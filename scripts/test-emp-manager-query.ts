import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testQuery() {
  try {
    console.log('Testing emp_manager queries...\n');
    
    // Test 1: Simple SELECT
    console.log('Test 1: Simple SELECT with quoted identifiers');
    const result1 = await prisma.$queryRaw<Array<{
      mid: string;
      mcardno: string;
      mdepartmentId: string | null;
      mdesignationId: string | null;
      morgUnitId: string | null;
      mis_extinct: boolean;
    }>>`
      SELECT "mid", "mcardno", "mdepartmentId", "mdesignationId", "morgUnitId", "mis_extinct"
      FROM "emp_manager"
      WHERE "mis_extinct" = false
      ORDER BY "mcardno", "mid" DESC
    `;
    
    console.log('✅ Query successful!');
    console.log(`Records found: ${result1.length}`);
    
    // Test 2: INSERT (simulate)
    console.log('\nTest 2: INSERT query structure');
    const testMid = `test-${Date.now()}`;
    const testCardNo = '99999';
    
    await prisma.$executeRaw`
      INSERT INTO "emp_manager" ("mid", "mcardno", "mdepartmentId", "mdesignationId", "morgUnitId", "mis_extinct")
      VALUES (${testMid}, ${testCardNo}, NULL, NULL, NULL, false)
    `;
    
    console.log('✅ INSERT successful!');
    
    // Clean up test record
    await prisma.$executeRaw`
      DELETE FROM "emp_manager" WHERE "mid" = ${testMid}
    `;
    
    console.log('✅ Test record cleaned up');
    
    console.log('\n✅ All tests passed! The table is working correctly.');
    
  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    console.error('Code:', error.code);
    if (error.meta) {
      console.error('Meta:', JSON.stringify(error.meta, null, 2));
    }
  } finally {
    await prisma.$disconnect();
  }
}

testQuery();

