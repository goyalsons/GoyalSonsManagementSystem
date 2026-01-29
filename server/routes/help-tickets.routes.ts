import type { Express } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requirePolicy } from "../lib/auth-middleware";

export function registerHelpTicketsRoutes(app: Express) {
  // GET /api/help-tickets - Get help tickets (policy-based)
  app.get("/api/help-tickets", requireAuth, requirePolicy("help_tickets.view"), async (req, res) => {
    try {
      const { status, category } = req.query;
      const where: any = {};
      
      if (status && typeof status === 'string') {
        where.status = status;
      }
      
      if (category && typeof category === 'string') {
        where.category = category;
      }
      
      console.log(`[Help Ticket] Fetching tickets with where clause:`, JSON.stringify(where, null, 2));
      
      let tickets = await prisma.helpTicket.findMany({
        where,
        include: {
          employee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              cardNumber: true,
              employeeCode: true,
            },
          },
          resolvedBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
      
      // Auto-reset dismissed/resolved tickets to pending after 1 day
      const oneDayAgo = new Date();
      oneDayAgo.setDate(oneDayAgo.getDate() - 1);
      
      const ticketsToReset = tickets.filter(t => 
        (t.status === "resolved" || t.status === "dismissed") && 
        t.resolvedAt && 
        new Date(t.resolvedAt) < oneDayAgo
      );
      
      if (ticketsToReset.length > 0) {
        const updatePromises = ticketsToReset.map(ticket =>
          prisma.helpTicket.update({
            where: { id: ticket.id },
            data: {
              status: "pending",
              resolvedAt: null,
              resolvedById: null,
            },
          })
        );
        await Promise.all(updatePromises);
        
        // Refetch tickets after update
        tickets = await prisma.helpTicket.findMany({
          where,
          include: {
            employee: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                cardNumber: true,
                employeeCode: true,
              },
            },
            resolvedBy: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        });
        
        console.log(`[Help Ticket] Auto-reset ${ticketsToReset.length} tickets to pending status`);
      }
      
      res.json({ success: true, tickets });
    } catch (error: any) {
      console.error("Get help tickets error:", error);
      console.error("Error details:", {
        message: error.message,
        code: error.code,
        meta: error.meta,
      });
      res.status(500).json({ 
        success: false, 
        message: error.message || "Failed to fetch help tickets",
        hint: error.message?.includes('assignedToRole') || error.message?.includes('assignedToId') || error.message?.includes('column') || error.message?.includes('does not exist')
          ? "Please run the database migration. See RUN_MIGRATION.sql in the project root."
          : undefined,
      });
    }
  });
  
  // POST /api/help-tickets - Create a new help ticket with role-based assignment
  app.post("/api/help-tickets", requireAuth, requirePolicy("help_tickets.create"), async (req, res) => {
    try {
      const user = req.user!;
      const { subject, description, category, priority, relatedData } = req.body;
      
      if (!user.employeeId) {
        return res.status(403).json({ 
          success: false, 
          message: "Only employees can create help tickets" 
        });
      }
      
      if (!subject || !description) {
        return res.status(400).json({ 
          success: false, 
          message: "Subject and description are required" 
        });
      }

      // Determine raisedByRole
      const raisedByRole = "EMPLOYEE";

      // Get employee details to find manager assignment
      const employee = await prisma.employee.findUnique({
        where: { id: user.employeeId },
        select: {
          id: true,
          cardNumber: true,
          departmentId: true,
          designationId: true,
          orgUnitId: true,
        },
      });

      let assignedToRole = "MDO"; // Default to MDO
      let assignedToId: string | null = null;
      let managerId: string | null = null;

      // Assignment Logic:
      // Case 1: If EMPLOYEE raises ticket
      if (raisedByRole === "EMPLOYEE" && employee) {
        // Find manager assigned to this employee (match by department/designation/orgUnit)
        const managerAssignments = await prisma.$queryRaw<Array<{
          mid: string;
          mcardno: string;
          mdepartmentId: string | null;
          mdesignationId: string | null;
          morgUnitId: string | null;
        }>>`
          SELECT "mid", "mcardno", "mdepartmentId", "mdesignationId", "morgUnitId"
          FROM "emp_manager"
          WHERE "mis_extinct" = false
          AND (
            (${employee.departmentId} IS NOT NULL AND "mdepartmentId" = ${employee.departmentId})
            OR (${employee.designationId} IS NOT NULL AND "mdesignationId" = ${employee.designationId})
            OR (${employee.orgUnitId} IS NOT NULL AND "morgUnitId" = ${employee.orgUnitId})
          )
          LIMIT 1
        `;

        if (managerAssignments.length > 0) {
          // Assign to manager
          const managerCardNo = managerAssignments[0].mcardno;
          const managerEmployee = await prisma.employee.findUnique({
            where: { cardNumber: managerCardNo },
            select: { id: true },
          });

          if (managerEmployee) {
            const managerUser = await prisma.user.findFirst({
              where: { employeeId: managerEmployee.id },
              select: { id: true },
            });

            if (managerUser) {
              assignedToRole = "MANAGER";
              assignedToId = managerUser.id;
              managerId = managerEmployee.id;
            }
          }
        }
        // If no manager found, assignedToRole remains "MDO" and assignedToId remains null
      }
      // Case 2: If MANAGER raises ticket → always assign to MDO
      else if (raisedByRole === "MANAGER") {
        assignedToRole = "MDO";
        assignedToId = null; // MDO is not a specific user, it's a role
        console.log(`[Help Ticket] Manager (${user.id}) raised ticket, assigned to MDO role`);
      }
      // Case 3: If MDO raises ticket → assign to MDO (self or system)
      else if (raisedByRole === "MDO") {
        assignedToRole = "MDO";
        assignedToId = null;
      }
      
      const ticketData = {
        employeeId: user.employeeId,
        subject,
        description,
        category: category || "attendance",
        priority: priority || "medium",
        relatedData: relatedData || null,
        status: "open",
        raisedByRole,
        managerId,
        assignedToRole,
        assignedToId,
      };
      
      console.log(`[Help Ticket] Creating ticket with data:`, JSON.stringify(ticketData, null, 2));
      
      const ticket = await prisma.helpTicket.create({
        data: ticketData,
        include: {
          employee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              cardNumber: true,
              employeeCode: true,
            },
          },
        },
      });
      
      console.log(`[Help Ticket] Ticket created successfully: ${ticket.id}, assignedToRole: ${ticket.assignedToRole}, assignedToId: ${ticket.assignedToId}`);
      
      res.json({ success: true, ticket });
    } catch (error: any) {
      console.error("Create help ticket error:", error);
      res.status(500).json({ success: false, message: error.message || "Failed to create help ticket" });
    }
  });
  
  // PUT /api/help-tickets/:id - Update help ticket (for status/response)
  app.put("/api/help-tickets/:id", requireAuth, requirePolicy("help_tickets.update"), async (req, res) => {
    try {
      const user = req.user!;
      const { id } = req.params;
      const { status, response } = req.body;
      
      const ticket = await prisma.helpTicket.findUnique({
        where: { id },
      });
      
      if (!ticket) {
        return res.status(404).json({ success: false, message: "Ticket not found" });
      }
      
      const hasUpdatePolicy = user.policies?.includes("help_tickets.update") || false;
      const hasClosePolicy = user.policies?.includes("help_tickets.close") || false;
      const isClosingStatus = status && ["resolved", "closed", "dismissed"].includes(status);

      if (isClosingStatus && !hasClosePolicy) {
        return res.status(403).json({
          success: false,
          message: "You don't have permission to close this ticket",
        });
      }
      
      const updateData: any = {};
      
      // Allow status updates for users with update policy
      if (status && hasUpdatePolicy) {
        updateData.status = status;
        if (status === "resolved" || status === "closed") {
          updateData.resolvedById = user.id;
          updateData.resolvedAt = new Date();
        } else if (status === "dismissed") {
          // Store dismissedAt timestamp for 1-day auto-reset
          updateData.resolvedById = user.id;
          updateData.resolvedAt = new Date();
        }
      }
      
      // Only users with update policy can update response
      if (response !== undefined && hasUpdatePolicy) {
        updateData.response = response;
      }
      
      const updatedTicket = await prisma.helpTicket.update({
        where: { id },
        data: updateData,
        include: {
          employee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              cardNumber: true,
              employeeCode: true,
            },
          },
          resolvedBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });
      
      res.json({ success: true, ticket: updatedTicket });
    } catch (error: any) {
      console.error("Update help ticket error:", error);
      res.status(500).json({ success: false, message: error.message || "Failed to update help ticket" });
    }
  });
}

