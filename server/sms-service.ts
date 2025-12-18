import { PrismaClient } from "@prisma/client";
import { v4 as uuidv4 } from "uuid";

const prisma = new PrismaClient();

interface SmsConfig {
  apiUrl: string;
  apiKey: string;
  senderId: string;
  dltEntityId: string;
  dltTemplateId: string;
}

interface SendSmsResult {
  success: boolean;
  messageId?: string;
  customerRef?: string;
  error?: string;
  smsLogId?: string;
}

type InstaAlertsStatus =
  | string
  | {
      code?: string | number;
      desc?: string;
    };

interface InstaAlertsResponse {
  status: InstaAlertsStatus;
  statusCode?: number;
  messageId?: string;
  error?: string;
}

function isProviderError(status: InstaAlertsStatus): { isError: boolean; code?: string; desc?: string } {
  if (typeof status === "string") {
    return { isError: false };
  }
  const code = status?.code?.toString();
  const desc = status?.desc;
  // Treat any negative or non-success code as error
  const isError = !!code && (code.startsWith("-") || !["0", "00", "200", "300"].includes(code));
  return { isError, code, desc };
}

function getConfig(): SmsConfig {
  return {
    apiUrl: "https://japi.instaalerts.zone/httpapi/JsonReceiver",
    apiKey: process.env.SMS_API_KEY || "",
    senderId: process.env.SMS_SENDER_ID || "GOYLSN",
    dltEntityId: process.env.SMS_DLT_ENTITY_ID || "1101682460000011989",
    dltTemplateId: process.env.SMS_DLT_TEMPLATE_ID || "1107176475621761408",
  };
}

function formatPhoneNumber(phone: string): string {
  let cleaned = phone.replace(/\D/g, "");
  if (cleaned.length === 10) {
    cleaned = "91" + cleaned;
  }
  if (!cleaned.startsWith("91") && cleaned.length === 12) {
    cleaned = "91" + cleaned.slice(-10);
  }
  return cleaned;
}

export async function sendOtpSms(phone: string, otpCode: string): Promise<SendSmsResult> {
  const config = getConfig();
  
  if (!config.apiKey) {
    console.error("[SMS] API key not configured");
    return { success: false, error: "SMS API key not configured" };
  }

  const formattedPhone = formatPhoneNumber(phone);
  const customerRef = uuidv4().slice(0, 8);
  const messageText = `Use verification code ${otpCode} for Goyalsons Shopmax`;

  const smsLog = await prisma.smsLog.create({
    data: {
      recipientPhone: formattedPhone,
      messageType: "OTP",
      messageText: messageText,
      status: "pending",
      customerRef: customerRef,
    },
  });

  try {
    const payload = {
      ver: "1.0",
      key: config.apiKey,
      encrpt: "0",
      messages: [
        {
          dest: [formattedPhone],
          text: `Use verification code ${otpCode} for Goyalsons Shopmax`,
          send: config.senderId,
          dlt_entity_id: config.dltEntityId,
          dlt_template_id: config.dltTemplateId,
          type: "PM",
          dcs: "0",
          udhi_inc: "0",
          dlr_req: "1",
          app_country: "1",
          cust_ref: customerRef,
        },
      ],
    };

    console.log("[SMS] Sending OTP to:", formattedPhone);

    const response = await fetch(config.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const responseData = await response.json() as InstaAlertsResponse;
    console.log("[SMS] API Response:", responseData);

    const { isError, code, desc } = isProviderError(responseData.status);

    await prisma.smsLog.update({
      where: { id: smsLog.id },
      data: {
        apiResponse: responseData as any,
        apiMessageId: responseData.messageId,
        status: response.ok && !isError ? "sent" : "failed",
        sentAt: response.ok && !isError ? new Date() : null,
        failedAt: !response.ok || isError ? new Date() : null,
        errorMessage: !response.ok || isError ? (responseData.error || desc || "API request failed") : null,
      },
    });

    if (response.ok && !isError) {
      return {
        success: true,
        messageId: responseData.messageId,
        customerRef: customerRef,
        smsLogId: smsLog.id,
      };
    } else {
      return {
        success: false,
        error: responseData.error || desc || `Failed to send SMS${code ? ` (code ${code})` : ""}`,
        smsLogId: smsLog.id,
      };
    }
  } catch (error) {
    console.error("[SMS] Error sending SMS:", error);
    
    await prisma.smsLog.update({
      where: { id: smsLog.id },
      data: {
        status: "failed",
        failedAt: new Date(),
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      },
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      smsLogId: smsLog.id,
    };
  }
}

export async function sendNotificationSms(phone: string, message: string): Promise<SendSmsResult> {
  const config = getConfig();
  
  if (!config.apiKey) {
    console.error("[SMS] API key not configured");
    return { success: false, error: "SMS API key not configured" };
  }

  const formattedPhone = formatPhoneNumber(phone);
  const customerRef = uuidv4().slice(0, 8);

  const smsLog = await prisma.smsLog.create({
    data: {
      recipientPhone: formattedPhone,
      messageType: "NOTIFICATION",
      messageText: message,
      status: "pending",
      customerRef: customerRef,
    },
  });

  try {
    const payload = {
      ver: "1.0",
      key: config.apiKey,
      encrpt: "0",
      messages: [
        {
          dest: [formattedPhone],
          text: message,
          send: config.senderId,
          dlt_entity_id: config.dltEntityId,
          dlt_template_id: config.dltTemplateId,
          type: "PM",
          dcs: "0",
          udhi_inc: "0",
          dlr_req: "1",
          app_country: "1",
          cust_ref: customerRef,
        },
      ],
    };

    const response = await fetch(config.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const responseData = await response.json() as InstaAlertsResponse;
    const { isError, code, desc } = isProviderError(responseData.status);

    await prisma.smsLog.update({
      where: { id: smsLog.id },
      data: {
        apiResponse: responseData as any,
        apiMessageId: responseData.messageId,
        status: response.ok && !isError ? "sent" : "failed",
        sentAt: response.ok && !isError ? new Date() : null,
        failedAt: !response.ok || isError ? new Date() : null,
        errorMessage: !response.ok || isError ? (responseData.error || desc || "API request failed") : null,
      },
    });

    if (response.ok && !isError) {
      return {
        success: true,
        messageId: responseData.messageId,
        customerRef: customerRef,
        smsLogId: smsLog.id,
      };
    } else {
      return {
        success: false,
        error: responseData.error || desc || `Failed to send SMS${code ? ` (code ${code})` : ""}`,
        smsLogId: smsLog.id,
      };
    }
  } catch (error) {
    console.error("[SMS] Error sending notification SMS:", error);
    
    await prisma.smsLog.update({
      where: { id: smsLog.id },
      data: {
        status: "failed",
        failedAt: new Date(),
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      },
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      smsLogId: smsLog.id,
    };
  }
}

export async function getSmsLogs(filters?: {
  phone?: string;
  status?: string;
  messageType?: string;
  limit?: number;
}) {
  const where: any = {};
  
  if (filters?.phone) {
    where.recipientPhone = { contains: filters.phone };
  }
  if (filters?.status) {
    where.status = filters.status;
  }
  if (filters?.messageType) {
    where.messageType = filters.messageType;
  }

  return prisma.smsLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: filters?.limit || 100,
  });
}

export async function getSmsStats() {
  const [total, sent, delivered, failed, pending] = await Promise.all([
    prisma.smsLog.count(),
    prisma.smsLog.count({ where: { status: "sent" } }),
    prisma.smsLog.count({ where: { status: "delivered" } }),
    prisma.smsLog.count({ where: { status: "failed" } }),
    prisma.smsLog.count({ where: { status: "pending" } }),
  ]);

  return { total, sent, delivered, failed, pending };
}
