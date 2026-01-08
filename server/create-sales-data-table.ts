import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({
  path: path.resolve(process.cwd(), '.env'),
});

import { prisma } from './lib/prisma';

async function createSalesDataTable() {
  try {
    console.log('Creating SalesData table...');
    
    // Create table
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "SalesData" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "smno" TEXT,
        "sm" TEXT,
        "shrtname" TEXT,
        "dept" TEXT,
        "brand" TEXT,
        "email" TEXT,
        "totalSale" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "inhouseSal" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "prDays" INTEGER NOT NULL DEFAULT 0,
        "billMonth" TIMESTAMP(3),
        "updOn" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL
      );
    `);
    
    console.log('✅ SalesData table created');
    
    // Create indexes
    const indexes = [
      'CREATE INDEX IF NOT EXISTS "SalesData_smno_idx" ON "SalesData"("smno");',
      'CREATE INDEX IF NOT EXISTS "SalesData_shrtname_idx" ON "SalesData"("shrtname");',
      'CREATE INDEX IF NOT EXISTS "SalesData_dept_idx" ON "SalesData"("dept");',
      'CREATE INDEX IF NOT EXISTS "SalesData_brand_idx" ON "SalesData"("brand");',
      'CREATE INDEX IF NOT EXISTS "SalesData_billMonth_idx" ON "SalesData"("billMonth");',
      'CREATE INDEX IF NOT EXISTS "SalesData_updatedAt_idx" ON "SalesData"("updatedAt");',
    ];
    
    for (const indexSql of indexes) {
      await prisma.$executeRawUnsafe(indexSql);
    }
    
    console.log('✅ All indexes created');
    console.log('✅ SalesData table setup complete!');
  } catch (error: any) {
    if (error.message?.includes('already exists')) {
      console.log('✅ SalesData table already exists');
    } else {
      console.error('❌ Error creating table:', error.message);
      throw error;
    }
  } finally {
    await prisma.$disconnect();
  }
}

// Export for use in server startup
export default createSalesDataTable;

export { createSalesDataTable };

