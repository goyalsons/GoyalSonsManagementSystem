import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function debugManagerWorkflow() {
  try {
    const managerCardNo = "11017";
    
    console.log("\n" + "=".repeat(60));
    console.log("  MANAGER WORKFLOW DEBUG");
    console.log("=".repeat(60) + "\n");

    // Step 1: Verify Manager Assignment
    console.log("1️⃣ VERIFYING MANAGER ASSIGNMENT");
    console.log("-".repeat(60));
    const managers = await prisma.$queryRaw<Array<{
      mid: string;
      mcardno: string;
      mdepartmentId: string | null;
      mdesignationId: string | null;
      morgUnitId: string | null;
      mis_extinct: boolean;
    }>>`
      SELECT "mid", "mcardno", "mdepartmentId", "mdesignationId", "morgUnitId", "mis_extinct"
      FROM "emp_manager"
      WHERE "mcardno" = ${managerCardNo} AND "mis_extinct" = false
    `;

    if (managers.length === 0) {
      console.log("❌ No manager assignments found for card:", managerCardNo);
      return;
    }

    console.log(`✅ Found ${managers.length} manager assignment(s):`);
    managers.forEach((m, i) => {
      console.log(`   ${i + 1}. Assignment ID: ${m.mid}`);
      console.log(`      - Department: ${m.mdepartmentId || "None"}`);
      console.log(`      - Designation: ${m.mdesignationId || "None"}`);
      console.log(`      - Org Unit: ${m.morgUnitId || "None"}`);
    });

    // Step 2: Get Employee Record
    console.log("\n2️⃣ VERIFYING EMPLOYEE RECORD");
    console.log("-".repeat(60));
    const employee = await prisma.employee.findFirst({
      where: {
        OR: [
          { cardNumber: managerCardNo },
          { cardNumber: managerCardNo.toString() },
        ],
      },
      include: {
        department: { select: { id: true, name: true, code: true } },
        designation: { select: { id: true, name: true, code: true } },
        orgUnit: { select: { id: true, name: true } },
      },
    });

    if (!employee) {
      console.log("❌ Employee not found with card number:", managerCardNo);
      return;
    }

    console.log(`✅ Employee found: ${employee.firstName} ${employee.lastName || ""}`);
    console.log(`   - Card Number: ${employee.cardNumber}`);
    console.log(`   - Department: ${employee.department?.name || "None"} (${employee.departmentId || "null"})`);
    console.log(`   - Designation: ${employee.designation?.name || "None"} (${employee.designationId || "null"})`);
    console.log(`   - Org Unit: ${employee.orgUnit?.name || "None"} (${employee.orgUnitId || "null"})`);
    console.log(`   - Status: ${employee.status}`);

    // Step 3: Build Filter Conditions
    console.log("\n3️⃣ BUILDING FILTER CONDITIONS");
    console.log("-".repeat(60));
    const whereConditions: any[] = [];
    
    managers.forEach((manager, idx) => {
      const condition: any = { status: "ACTIVE" };
      if (manager.mdepartmentId) {
        condition.departmentId = manager.mdepartmentId;
      }
      if (manager.mdesignationId) {
        condition.designationId = manager.mdesignationId;
      }
      if (manager.morgUnitId) {
        condition.orgUnitId = manager.morgUnitId;
      }
      
      if (manager.mdepartmentId || manager.mdesignationId || manager.morgUnitId) {
        whereConditions.push(condition);
        console.log(`   Condition ${idx + 1}:`, JSON.stringify(condition, null, 2));
      }
    });

    if (whereConditions.length === 0) {
      console.log("❌ No valid filter conditions (manager has no scope)");
      return;
    }

    // Step 4: Find Matching Employees
    console.log("\n4️⃣ FINDING MATCHING EMPLOYEES");
    console.log("-".repeat(60));
    const teamMembers = await prisma.employee.findMany({
      where: {
        OR: whereConditions,
      },
      include: {
        department: { select: { id: true, name: true } },
        designation: { select: { id: true, name: true } },
        orgUnit: { select: { id: true, name: true } },
      },
    });

    console.log(`✅ Found ${teamMembers.length} team member(s):`);
    if (teamMembers.length > 0) {
      teamMembers.forEach((m, i) => {
        console.log(`   ${i + 1}. ${m.firstName} ${m.lastName || ""} (Card: ${m.cardNumber})`);
        console.log(`      - Dept: ${m.department?.name || "None"} (${m.departmentId || "null"})`);
        console.log(`      - Desig: ${m.designation?.name || "None"} (${m.designationId || "null"})`);
        console.log(`      - Org: ${m.orgUnit?.name || "None"} (${m.orgUnitId || "null"})`);
      });
    } else {
      console.log("⚠️ No employees match the filter!");
      
      // Debug: Check why no matches
      console.log("\n   Debugging why no matches...");
      const allActive = await prisma.employee.findMany({
        where: { status: "ACTIVE" },
        take: 10,
        select: {
          firstName: true,
          lastName: true,
          cardNumber: true,
          departmentId: true,
          designationId: true,
          orgUnitId: true,
        },
      });
      
      console.log(`   Sample of ${allActive.length} active employees:`);
      allActive.forEach((e, i) => {
        console.log(`   ${i + 1}. ${e.firstName} ${e.lastName || ""}`);
        console.log(`      - Dept: ${e.departmentId || "null"}, Desig: ${e.designationId || "null"}, Org: ${e.orgUnitId || "null"}`);
      });
    }

    // Step 5: Check Tasks
    console.log("\n5️⃣ CHECKING TASKS");
    console.log("-".repeat(60));
    const teamMemberIds = teamMembers.map(e => e.id);
    
    if (teamMemberIds.length > 0) {
      const tasks = await prisma.task.findMany({
        where: {
          assigneeId: { in: teamMemberIds },
        },
        include: {
          assignee: {
            select: {
              firstName: true,
              lastName: true,
              cardNumber: true,
            },
          },
        },
        take: 10,
      });

      console.log(`✅ Found ${tasks.length} task(s) for team members:`);
      if (tasks.length > 0) {
        tasks.forEach((t, i) => {
          console.log(`   ${i + 1}. "${t.title}" - Assigned to: ${t.assignee?.firstName} ${t.assignee?.lastName || ""} (${t.assignee?.cardNumber || "N/A"})`);
        });
      } else {
        console.log("⚠️ No tasks assigned to team members");
      }
    } else {
      console.log("⚠️ Skipping task check (no team members found)");
    }

    // Step 6: Check Sales Data
    console.log("\n6️⃣ CHECKING SALES DATA");
    console.log("-".repeat(60));
    const teamCardNumbers = teamMembers
      .map(e => e.cardNumber)
      .filter((card): card is string => card !== null);

    if (teamCardNumbers.length > 0) {
      const salesData = await prisma.salesStaffSummary.findMany({
        where: {
          smno: { in: teamCardNumbers },
        },
        take: 10,
      });

      console.log(`✅ Found ${salesData.length} sales record(s) for team members`);
      if (salesData.length > 0) {
        const uniqueCards = new Set(salesData.map(s => s.smno));
        console.log(`   - Unique card numbers with sales: ${uniqueCards.size}`);
        salesData.slice(0, 5).forEach((s, i) => {
          console.log(`   ${i + 1}. Card: ${s.smno}, Date: ${s.dat}, Net Sale: ${s.netsale}`);
        });
      } else {
        console.log("⚠️ No sales records found for team card numbers");
      }
    } else {
      console.log("⚠️ Skipping sales check (no team card numbers found)");
    }

    console.log("\n" + "=".repeat(60));
    console.log("  DEBUG COMPLETE");
    console.log("=".repeat(60) + "\n");

  } catch (error: any) {
    console.error("❌ Error:", error.message);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

debugManagerWorkflow();

