import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function insertEmpManagerSample() {
  try {
    console.log("Inserting sample data into emp_manager table...\n");

    const sampleData = {
      mid: "45455",
      mcardno: "11017",
      morgUnitId: null,
      mis_extinct: false,
      mdepartmentId: "077d0ed7-d84c-43bc-bf7f-8785a2657aa8",
      mdesignationId: null,
    };

    // Use raw query since emp_manager is not in Prisma schema
    const result = await prisma.$executeRaw`
      INSERT INTO "emp_manager" ("mid", "mcardno", "mdepartmentId", "mdesignationId", "morgUnitId", "mis_extinct")
      VALUES (${sampleData.mid}, ${sampleData.mcardno}, ${sampleData.mdepartmentId}, ${sampleData.mdesignationId}, ${sampleData.morgUnitId}, ${sampleData.mis_extinct})
      ON CONFLICT ("mid") DO UPDATE SET
        "mcardno" = EXCLUDED."mcardno",
        "mdepartmentId" = EXCLUDED."mdepartmentId",
        "mdesignationId" = EXCLUDED."mdesignationId",
        "morgUnitId" = EXCLUDED."morgUnitId",
        "mis_extinct" = EXCLUDED."mis_extinct"
    `;

    console.log(`✓ Inserted/updated record with mid: ${sampleData.mid}`);

    // Verify the data
    const records = await prisma.$queryRaw<Array<{
      mid: string;
      mcardno: string;
      mdepartmentId: string | null;
      mdesignationId: string | null;
      morgUnitId: string | null;
      mis_extinct: boolean;
    }>>`
      SELECT * FROM "emp_manager" WHERE "mid" = ${sampleData.mid}
    `;

    console.log("\n✓ Verification - Record in database:");
    console.log(JSON.stringify(records[0], null, 2));

    // Show all records
    const allRecords = await prisma.$queryRaw<Array<{
      mid: string;
      mcardno: string;
      mdepartmentId: string | null;
      mdesignationId: string | null;
      morgUnitId: string | null;
      mis_extinct: boolean;
    }>>`
      SELECT * FROM "emp_manager" ORDER BY "mid"
    `;

    console.log(`\n✓ Total records in emp_manager table: ${allRecords.length}`);
    if (allRecords.length > 0) {
      console.log("\nAll records:");
      allRecords.forEach((record, index) => {
        console.log(`${index + 1}. ${JSON.stringify(record, null, 2)}`);
      });
    }
  } catch (error: any) {
    console.error("Error inserting sample data:", error);
    if (error.message?.includes("does not exist") || error.message?.includes("relation")) {
      console.error("\n❌ The emp_manager table does not exist. Please run the migration first:");
      console.error("   npx prisma migrate deploy");
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

insertEmpManagerSample();

