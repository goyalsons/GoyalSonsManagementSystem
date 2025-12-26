import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkTable() {
  try {
    // Check if table exists
    const tableCheck = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name = 'emp_manager'
    `;
    
    console.log('Table exists:', tableCheck.length > 0);
    
    if (tableCheck.length > 0) {
      // Get column information
      const columns = await prisma.$queryRaw<Array<{ column_name: string; data_type: string }>>`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'emp_manager'
        ORDER BY ordinal_position
      `;
      
      console.log('\nColumns:');
      columns.forEach(col => {
        console.log(`  - ${col.column_name} (${col.data_type})`);
      });
      
      // Try to query the table
      const count = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) as count FROM "emp_manager"
      `;
      
      console.log(`\nTotal records: ${count[0].count}`);
    } else {
      console.log('\n❌ Table does not exist! Creating it now...');
      // Create the table
      await prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS "emp_manager" (
          "mid" TEXT NOT NULL,
          "mcardno" TEXT NOT NULL,
          "mdepartmentId" TEXT,
          "mdesignationId" TEXT,
          "morgUnitId" TEXT,
          "mis_extinct" BOOLEAN NOT NULL DEFAULT false,
          CONSTRAINT "emp_manager_pkey" PRIMARY KEY ("mid")
        )
      `;
      
      await prisma.$executeRaw`
        CREATE INDEX IF NOT EXISTS "emp_manager_mcardno_idx" ON "emp_manager"("mcardno")
      `;
      
      console.log('✅ Table created successfully!');
    }
    
  } catch (error: any) {
    console.error('Error:', error.message);
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

checkTable();

