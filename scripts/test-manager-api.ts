import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function testManagerAPI() {
  try {
    const cardNumber = "11017";
    
    console.log(`\n========================================`);
    console.log(`  Testing Manager API for Card: ${cardNumber}`);
    console.log(`========================================\n`);

    // 1. Get employee
    const employee = await prisma.employee.findFirst({
      where: { cardNumber },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        cardNumber: true,
      },
    });

    if (!employee) {
      console.log("❌ Employee not found");
      return;
    }

    console.log(`✅ Employee found: ${employee.firstName} ${employee.lastName}`);

    // 2. Get user
    const user = await prisma.user.findFirst({
      where: { employeeId: employee.id },
      select: {
        id: true,
        email: true,
        employeeId: true,
      },
    });

    if (!user) {
      console.log("❌ User not found");
      return;
    }

    console.log(`✅ User found: ${user.email}`);

    // 3. Check manager assignments
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
      WHERE "mcardno" = ${cardNumber} AND "mis_extinct" = false
    `;

    console.log(`\n✅ Manager assignments found: ${managers.length}`);
    if (managers.length > 0) {
      console.log("   Manager should have isManager: true");
      console.log("   Manager scopes:", {
        departments: managers.map(m => m.mdepartmentId).filter(Boolean),
        designations: managers.map(m => m.mdesignationId).filter(Boolean),
        orgUnits: managers.map(m => m.morgUnitId).filter(Boolean),
      });
    } else {
      console.log("   ❌ No manager assignments - user will NOT be a manager");
    }

    console.log("\n========================================\n");
    console.log("To test:");
    console.log(`1. Login with email: ${user.email}`);
    console.log("2. Check browser console for [Nav Debug] logs");
    console.log("3. Look for 'Team Task History' and 'Team Sales Staff' in navigation\n");

  } catch (error: any) {
    console.error("Error:", error.message);
  } finally {
    await prisma.$disconnect();
  }
}

testManagerAPI();

