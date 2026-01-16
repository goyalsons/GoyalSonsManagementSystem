import type { Express } from "express";
import { prisma } from "../lib/prisma";
import { getUserAuthInfo } from "../lib/authorization";
import { sendOtpSms } from "../sms-service";

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function maskPhone(phone: string): string {
  if (!phone) return "";
  const cleanPhone = phone.replace(/\D/g, "");
  if (cleanPhone.length >= 10) {
    const last10 = cleanPhone.slice(-10);
    return `+91-******${last10.slice(-4)}`;
  }
  return `******${cleanPhone.slice(-4)}`;
}

export function registerOtpRoutes(app: Express): void {
  app.post("/api/auth/send-otp", async (req, res) => {
    try {
      const { phone } = req.body;

      if (!phone) {
        return res.status(400).json({ message: "Phone number is required" });
      }

      let cleanPhone = phone.replace(/\D/g, "");
      if (cleanPhone.length === 10) {
        cleanPhone = "91" + cleanPhone;
      }

      await prisma.otpCode.updateMany({
        where: { phone: cleanPhone, used: false },
        data: { used: true },
      });

      const otp = generateOtp();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

      await prisma.otpCode.create({
        data: {
          phone: cleanPhone,
          code: otp,
          type: "login",
          expiresAt,
        },
      });

      console.log(`[OTP] Generated OTP for ${cleanPhone}: ${otp}`);
      
      const smsResult = await sendOtpSms(cleanPhone, otp);
      
      if (smsResult.success) {
        console.log(`[OTP] SMS sent successfully to ${cleanPhone}`);
        const maskedPhone = cleanPhone.slice(0, 4) + "****" + cleanPhone.slice(-2);
        res.json({ 
          success: true, 
          message: `OTP sent to ${maskedPhone}`,
          smsSent: true,
        });
      } else {
        console.error(`[OTP] Failed to send SMS: ${smsResult.error}`);
        res.json({ 
          success: true, 
          message: "OTP generated but SMS delivery failed. Please contact admin.",
          smsSent: false,
          debug: process.env.NODE_ENV === "development" ? otp : undefined,
        });
      }
    } catch (error) {
      console.error("Send OTP error:", error);
      res.status(500).json({ message: "Failed to send OTP" });
    }
  });

  app.post("/api/auth/verify-otp", async (req, res) => {
    try {
      const { phone, otp } = req.body;

      if (!phone || !otp) {
        return res.status(400).json({ message: "Phone number and OTP are required" });
      }

      let cleanPhone = phone.replace(/\D/g, "");
      if (cleanPhone.length === 10) {
        cleanPhone = "91" + cleanPhone;
      }
      const searchPhone = cleanPhone.slice(-10);

      const otpRecord = await prisma.otpCode.findFirst({
        where: {
          phone: cleanPhone,
          code: otp,
          used: false,
          expiresAt: { gt: new Date() },
        },
      });

      if (!otpRecord) {
        return res.status(400).json({ message: "Invalid or expired OTP" });
      }

      await prisma.otpCode.update({
        where: { id: otpRecord.id },
        data: { used: true },
      });

      const employee = await prisma.employee.findFirst({
        where: {
          OR: [
            { phone: { contains: searchPhone } },
            { secondaryPhone: { contains: searchPhone } },
          ],
        },
        include: { user: true, orgUnit: true },
      });

      let user = employee?.user;
      
      if (!user) {
        user = await prisma.user.findFirst({
          where: { phone: { contains: searchPhone } },
        });
      }

      if (!user && employee) {
        try {
          const fullName = [employee.firstName, employee.lastName].filter(n => n && n !== ".").join(" ");
          
          let email = employee.companyEmail || employee.personalEmail;
          if (!email) {
            email = `emp-${employee.id.slice(0, 8)}@goyalsons.local`;
          }
          
          const existingEmailUser = await prisma.user.findUnique({
            where: { email },
          });
          
          if (existingEmailUser) {
            email = `emp-${employee.id}@goyalsons.local`;
          }
          
          user = await prisma.user.create({
            data: {
              name: fullName,
              email: email,
              phone: employee.phone,
              passwordHash: "otp-only-user",
              employeeId: employee.id,
              orgUnitId: employee.orgUnitId,
              status: "active",
            },
          });

          console.log(`[OTP] Auto-created User account for employee: ${fullName} (${employee.cardNumber})`);
        } catch (createError: any) {
          console.error(`[OTP] Failed to auto-create user for employee ${employee.id}:`, createError.message);
          return res.status(500).json({ message: "Failed to create account. Please contact admin." });
        }
      }

      if (!user) {
        return res.status(404).json({ message: "No employee found with this phone number. Please contact admin." });
      }

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);
      const loginType = employee?.cardNumber ? "employee" : "mdo";
      const employeeCardNo = employee?.cardNumber || null;

      const session = await prisma.session.create({
        data: {
          userId: user.id,
          expiresAt,
          loginType,
          employeeCardNo,
        },
      });

      const authInfo = await getUserAuthInfo(user.id);

      res.json({
        token: session.id,
        user: {
          ...authInfo,
          loginType,
          employeeCardNo,
        },
      });
    } catch (error) {
      console.error("Verify OTP error:", error);
      res.status(500).json({ message: "Failed to verify OTP" });
    }
  });

  // Employee OTP Login
  app.post("/api/auth/employee-lookup", async (req, res) => {
    try {
      const { employeeCode } = req.body;

      if (!employeeCode) {
        return res.status(400).json({ message: "Employee code is required" });
      }

      let employee = null;
      const maxRetries = 3;
      let lastError: any = null;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          try {
            await prisma.$queryRaw`SELECT 1`;
          } catch (connectionError: any) {
            console.warn(`[Employee Lookup] Connection check failed (attempt ${attempt}), attempting reconnect...`, connectionError.message);
            try {
              await prisma.$disconnect().catch(() => {});
            } catch (disconnectError) {
              // Ignore
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
            await prisma.$queryRaw`SELECT 1`;
          }

          employee = await prisma.employee.findFirst({
            where: {
              OR: [
                { cardNumber: employeeCode },
                { cardNumber: employeeCode.toString() },
              ],
            },
          });
          break;
        } catch (error: any) {
          lastError = error;
          if (error.code === 'P1017' && attempt < maxRetries) {
            console.warn(`[Employee Lookup] Database connection error (attempt ${attempt}/${maxRetries}), retrying...`, error.message);
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            continue;
          }
          throw error;
        }
      }

      if (!employee && lastError) {
        throw lastError;
      }

      if (!employee) {
        return res.status(404).json({ message: "Employee not found. Please check your employee code." });
      }

      if (employee.status !== "ACTIVE") {
        return res.status(403).json({ message: "Your account is not active. Please contact HR." });
      }

      if ((employee as any).lastInterviewDate) {
        return res.status(404).json({ message: "Employee not found. Please check your employee code." });
      }

      if (!employee.phone) {
        return res.status(400).json({ message: "No phone number registered. Please contact admin." });
      }

      res.json({
        success: true,
        maskedPhone: maskPhone(employee.phone),
      });
    } catch (error) {
      console.error("Employee lookup error:", error);
      res.status(500).json({ message: "Failed to lookup employee" });
    }
  });

  app.post("/api/auth/send-employee-otp", async (req, res) => {
    try {
      const { employeeCode } = req.body;

      if (!employeeCode) {
        return res.status(400).json({ message: "Employee code is required" });
      }

      const employee = await prisma.employee.findFirst({
        where: {
          OR: [
            { cardNumber: employeeCode },
            { cardNumber: employeeCode.toString() },
          ],
        },
      });

      if (!employee) {
        return res.status(404).json({ message: "Employee not found" });
      }

      if (employee.status !== "ACTIVE") {
        return res.status(403).json({ message: "Your account is not active. Please contact HR." });
      }

      if (!employee.phone) {
        return res.status(400).json({ message: "No phone number registered for this employee" });
      }

      let cleanPhone = employee.phone.replace(/\D/g, "");
      if (cleanPhone.length === 10) {
        cleanPhone = "91" + cleanPhone;
      }

      const existingOtp = await prisma.otpCode.findFirst({
        where: {
          phone: cleanPhone,
          used: false,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: "desc" },
      });

      if (existingOtp) {
        const remainingSeconds = Math.floor((existingOtp.expiresAt.getTime() - Date.now()) / 1000);
        return res.json({
          success: true,
          existingOtp: true,
          remainingSeconds,
          message: `OTP already sent. Expires in ${Math.floor(remainingSeconds / 60)}:${(remainingSeconds % 60).toString().padStart(2, '0')}`,
        });
      }

      const otp = generateOtp();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

      await prisma.otpCode.create({
        data: {
          phone: cleanPhone,
          code: otp,
          type: "employee_login",
          expiresAt,
        },
      });

      console.log(`[Employee OTP] Generated OTP for ${employee.cardNumber} (${cleanPhone}): ${otp}`);
      
      const smsResult = await sendOtpSms(cleanPhone, otp);
      
      if (smsResult.success) {
        console.log(`[Employee OTP] SMS sent successfully to ${cleanPhone}`);
        res.json({ 
          success: true, 
          message: `OTP sent to ${maskPhone(employee.phone)}`,
          smsSent: true,
        });
      } else {
        console.error(`[Employee OTP] Failed to send SMS: ${smsResult.error}`);
        res.json({ 
          success: true, 
          message: "OTP generated but SMS delivery failed. Please contact admin.",
          smsSent: false,
          debug: process.env.NODE_ENV === "development" ? otp : undefined,
        });
      }
    } catch (error) {
      console.error("Send employee OTP error:", error);
      res.status(500).json({ message: "Failed to send OTP" });
    }
  });

  app.post("/api/auth/resend-employee-otp", async (req, res) => {
    try {
      const { employeeCode } = req.body;

      if (!employeeCode) {
        return res.status(400).json({ message: "Employee code is required" });
      }

      const employee = await prisma.employee.findFirst({
        where: {
          OR: [
            { cardNumber: employeeCode },
            { cardNumber: employeeCode.toString() },
          ],
        },
      });

      if (!employee) {
        return res.status(404).json({ message: "Employee not found" });
      }

      if (employee.status !== "ACTIVE") {
        return res.status(403).json({ message: "Your account is not active. Please contact HR." });
      }

      if (!employee.phone) {
        return res.status(400).json({ message: "No phone number registered for this employee" });
      }

      let cleanPhone = employee.phone.replace(/\D/g, "");
      if (cleanPhone.length === 10) {
        cleanPhone = "91" + cleanPhone;
      }

      const existingOtp = await prisma.otpCode.findFirst({
        where: {
          phone: cleanPhone,
          used: false,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: "desc" },
      });

      if (!existingOtp) {
        return res.status(400).json({ message: "No valid OTP found. Please request a new OTP." });
      }

      const smsResult = await sendOtpSms(cleanPhone, existingOtp.code);
      
      if (smsResult.success) {
        console.log(`[Employee OTP] Resent OTP for ${employee.cardNumber} (${cleanPhone}): ${existingOtp.code}`);
        const remainingSeconds = Math.floor((existingOtp.expiresAt.getTime() - Date.now()) / 1000);
        res.json({ 
          success: true, 
          message: `OTP resent to ${maskPhone(employee.phone)}`,
          smsSent: true,
          remainingSeconds,
        });
      } else {
        console.error(`[Employee OTP] Failed to resend SMS: ${smsResult.error}`);
        res.json({ 
          success: false, 
          message: "Failed to resend OTP. Please try again.",
          smsSent: false,
        });
      }
    } catch (error) {
      console.error("Resend employee OTP error:", error);
      res.status(500).json({ message: "Failed to resend OTP" });
    }
  });

  app.post("/api/auth/verify-employee-otp", async (req, res) => {
    try {
      const { employeeCode, otp } = req.body;

      if (!employeeCode || !otp) {
        return res.status(400).json({ message: "Employee code and OTP are required" });
      }

      const employee = await prisma.employee.findFirst({
        where: {
          OR: [
            { cardNumber: employeeCode },
            { cardNumber: employeeCode.toString() },
          ],
        },
        include: { user: true, orgUnit: true },
      });

      if (!employee) {
        return res.status(404).json({ message: "Employee not found" });
      }

      if (employee.status !== "ACTIVE") {
        return res.status(403).json({ message: "Your account is not active. Please contact HR." });
      }

      if (!employee.phone) {
        return res.status(400).json({ message: "No phone number registered for this employee" });
      }

      let cleanPhone = employee.phone.replace(/\D/g, "");
      if (cleanPhone.length === 10) {
        cleanPhone = "91" + cleanPhone;
      }

      const otpRecord = await prisma.otpCode.findFirst({
        where: {
          phone: cleanPhone,
          code: otp,
          used: false,
          expiresAt: { gt: new Date() },
        },
      });

      if (!otpRecord) {
        return res.status(400).json({ message: "Invalid or expired OTP" });
      }

      await prisma.otpCode.update({
        where: { id: otpRecord.id },
        data: { used: true },
      });

      let user = employee.user;

      if (!user) {
        try {
          const fullName = [employee.firstName, employee.lastName].filter(n => n && n !== ".").join(" ");
          
          let email = employee.companyEmail || employee.personalEmail;
          if (!email) {
            email = `emp-${employee.cardNumber}@goyalsons.local`;
          }
          
          const existingEmailUser = await prisma.user.findUnique({
            where: { email },
          });
          
          if (existingEmailUser) {
            email = `emp-${employee.id}@goyalsons.local`;
          }
          
          user = await prisma.user.create({
            data: {
              name: fullName,
              email: email,
              phone: employee.phone,
              passwordHash: "otp-only-user",
              employeeId: employee.id,
              orgUnitId: employee.orgUnitId,
              status: "active",
            },
          });

          console.log(`[Employee OTP] Auto-created User account for employee: ${fullName} (${employee.cardNumber})`);
        } catch (createError: any) {
          console.error(`[Employee OTP] Failed to auto-create user for employee ${employee.id}:`, createError.message);
          return res.status(500).json({ message: "Failed to create account. Please contact admin." });
        }
      }

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      const session = await prisma.session.create({
        data: {
          userId: user.id,
          expiresAt,
          loginType: "employee",
          employeeCardNo: employee.cardNumber,
        },
      });

      const authInfo = await getUserAuthInfo(user.id);

      res.json({
        token: session.id,
        user: {
          ...authInfo,
          loginType: "employee",
          employeeCardNo: employee.cardNumber,
          employeeId: employee.id,
        },
      });
    } catch (error) {
      console.error("Verify employee OTP error:", error);
      res.status(500).json({ message: "Failed to verify OTP" });
    }
  });
}

