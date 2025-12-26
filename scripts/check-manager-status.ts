import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function checkManagerStatus() {
  try {
    const cardNumber = "11017";
    
    console.log(`\n========================================`);
    console.log(`  Checking Manager Status for Card: ${cardNumber}`);
    console.log(`========================================\n`);

    // 1. Check if manager exists in emp_manager table
    console.log("1. Checking emp_manager table...");
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

    if (managers.length === 0) {
      console.log("   ❌ No active manager assignments found for card", cardNumber);
      console.log("   → Make sure the manager is assigned in the Assigned Manager page\n");
    } else {
      console.log(`   ✅ Found ${managers.length} active manager assignment(s):`);
      managers.forEach((m, i) => {
        console.log(`      ${i + 1}. Department: ${m.mdepartmentId || "None"}, Designation: ${m.mdesignationId || "None"}, Org Unit: ${m.morgUnitId || "None"}`);
      });
      console.log("");
    }

    // 2. Check if employee exists with this card number
    console.log("2. Checking employee record...");
    const employee = await prisma.employee.findFirst({
      where: { cardNumber },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        cardNumber: true,
        status: true,
      },
    });

    if (!employee) {
      console.log("   ❌ No employee found with card number", cardNumber);
      console.log("   → The card number must exist in the Employee table\n");
    } else {
      console.log(`   ✅ Employee found: ${employee.firstName} ${employee.lastName || ""} (${employee.status})`);
      console.log("");

      // 3. Check if user account exists for this employee
      console.log("3. Checking user account...");
      const user = await prisma.user.findFirst({
        where: { employeeId: employee.id },
        select: {
          id: true,
          name: true,
          email: true,
          employeeId: true,
        },
      });

      if (!user) {
        console.log("   ⚠️  No user account linked to this employee");
        console.log("   → You need to login with email/password, not card number");
        console.log("   → The user account should have employeeId set to the employee's id\n");
      } else {
        console.log(`   ✅ User account found: ${user.name} (${user.email})`);
        console.log("   → This user can login and should see manager navigation links\n");
      }
    }

    console.log("========================================\n");
    console.log("To see manager navigation links:");
    console.log("1. Make sure manager is assigned in Assigned Manager page");
    console.log("2. Login with the user account linked to employee card", cardNumber);
    console.log("3. The navigation should show 'Team Task History' and 'Team Sales Staff'\n");

  } catch (error: any) {
    console.error("Error:", error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkManagerStatus();

