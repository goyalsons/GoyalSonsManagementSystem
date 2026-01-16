import type { Express } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requirePolicy } from "../lib/auth-middleware";

export function registerHelpTicketsRoutes(app: Express) {
  // GET /api/help-tickets - Get help tickets based on user role:
  // - Regular employees: only their own tickets
  // - Managers: tickets from their team members
  // - MDO: tickets from managers
  app.get("/api/help-tickets", requireAuth, requirePolicy("help_tickets.view"), async (req, res) => {
    try {
      const user = req.user!;
      const { status, category } = req.query;
      
      // First, check if new columns exist by querying the information_schema
      let columnsExist = false;
      try {
        const columnCheck = await prisma.$queryRaw<Array<{ column_name: string }>>`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = 'HelpTicket' 
          AND column_name IN ('assignedToRole', 'assignedToId', 'raisedByRole', 'managerId')
        `;
        columnsExist = columnCheck.length >= 2; // At least assignedToRole and assignedToId should exist
      } catch (checkError) {
        console.warn("[Help Tickets] Could not check for columns, assuming they don't exist:", checkError);
        columnsExist = false;
      }
      
      const where: any = {};
      
      // Super admin sees all tickets
      if (user.isSuperAdmin) {
        // No filter - show all tickets
      }
      // MDO sees tickets assigned to MDO role
      else if (user.loginType === "mdo") {
        if (columnsExist) {
          where.assignedToRole = "MDO";
          console.log(`[Help Ticket] MDO (${user.id}) fetching tickets with assignedToRole = "MDO"`);
        } else {
          console.log(`[Help Ticket] MDO (${user.id}) fetching tickets - columns don't exist, showing all as fallback`);
        }
        // If columns don't exist, no filter (show all for MDO as fallback)
      }
      // Managers see tickets assigned to them
      else if (user.isManager && user.id) {
        if (columnsExist) {
          where.assignedToRole = "MANAGER";
          where.assignedToId = user.id;
        } else {
          // Fallback: show tickets from team members (old logic)
          if (user.employeeCardNo) {
            const managers = await prisma.$queryRaw<Array<{
              mdepartmentId: string | null;
              mdesignationId: string | null;
              morgUnitId: string | null;
            }>>`
              SELECT "mdepartmentId", "mdesignationId", "morgUnitId"
              FROM "emp_manager"
              WHERE "mcardno" = ${user.employeeCardNo} AND "mis_extinct" = false
            `;

            if (managers.length > 0) {
              const whereConditions: any[] = [];
              managers.forEach((manager) => {
                const condition: any = {}; // Remove status check from condition, will apply globally
                if (manager.mdepartmentId) condition.departmentId = manager.mdepartmentId;
                if (manager.mdesignationId) condition.designationId = manager.mdesignationId;
                if (manager.morgUnitId) condition.orgUnitId = manager.morgUnitId;
                if (manager.mdepartmentId || manager.mdesignationId || manager.morgUnitId) {
                  whereConditions.push(condition);
                }
              });

              if (whereConditions.length > 0) {
                const teamMembers = await prisma.employee.findMany({
                  where: { AND: [{ lastInterviewDate: null }, { OR: whereConditions }] }, // Only active employees
                  select: { id: true },
                });
                const teamMemberIds = teamMembers.map(e => e.id);
                where.employeeId = teamMemberIds.length > 0 ? { in: teamMemberIds } : { in: [] };
              } else {
                where.employeeId = { in: [] };
              }
            } else {
              where.employeeId = { in: [] };
            }
          } else {
            where.employeeId = { in: [] };
          }
        }
      }
      // Regular employees should not see Requests (handled by frontend navigation, but add safety check)
      else {
        // No access - return empty
        where.employeeId = { in: [] };
      }
      
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
      
      console.log(`[Help Ticket] Found ${tickets.length} tickets for user ${user.id} (loginType: ${user.loginType}, isManager: ${user.isManager})`);
      
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
      let raisedByRole = "EMPLOYEE";
      if (user.loginType === "mdo") {
        raisedByRole = "MDO";
      } else if (user.isManager) {
        raisedByRole = "MANAGER";
      }

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
      
      // Allow managers/MDO to update tickets assigned to them, or employees to update their own tickets, or admin to update any
      const canUpdate = user.isSuperAdmin || 
                        ticket.employeeId === user.employeeId ||
                        (user.loginType === "mdo" && ticket.assignedToRole === "MDO") ||
                        (user.isManager && ticket.assignedToRole === "MANAGER" && ticket.assignedToId === user.id);
      
      if (!canUpdate) {
        return res.status(403).json({ 
          success: false, 
          message: "You don't have permission to update this ticket" 
        });
      }
      
      const updateData: any = {};
      
      // Allow status updates for managers/MDO/admins
      if (status && (user.isSuperAdmin || user.loginType === "mdo" || user.isManager)) {
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
      
      // Only admin/MDO can update response
      if (response !== undefined && (user.isSuperAdmin || user.loginType === "mdo")) {
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

