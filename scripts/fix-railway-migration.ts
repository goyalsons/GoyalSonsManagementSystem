import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function fixFailedMigration() {
  console.log("\n========================================");
  console.log("  FIXING FAILED PRISMA MIGRATION");
  console.log("========================================\n");

  try {
    // Step 1: Check if columns exist
    console.log("🔍 Checking if migration columns exist...");
    
    const columnsCheck = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'HelpTicket' 
      AND column_name IN ('raisedByRole', 'assignedToRole', 'managerId', 'assignedToId')
      ORDER BY column_name
    `;

    const existingColumns = columnsCheck.map(c => c.column_name);
    console.log(`   Found columns: ${existingColumns.length > 0 ? existingColumns.join(', ') : 'NONE'}\n`);

    // Step 2: Check migration status
    console.log("🔍 Checking migration status...");
    const migrationStatus = await prisma.$queryRaw<Array<{
      migration_name: string;
      finished_at: Date | null;
      applied_steps_count: number;
    }>>`
      SELECT migration_name, finished_at, applied_steps_count
      FROM "_prisma_migrations"
      WHERE migration_name = '20251228161859_add_help_ticket_assignment_fields'
    `;

    if (migrationStatus.length === 0) {
      console.log("   ✅ Migration record not found. It may have been cleaned up.\n");
      console.log("   ✅ No action needed. Try deploying again.\n");
      process.exit(0);
    }

    const migration = migrationStatus[0];
    console.log(`   Migration: ${migration.migration_name}`);
    console.log(`   Finished at: ${migration.finished_at || 'NULL (FAILED)'}`);
    console.log(`   Applied steps: ${migration.applied_steps_count}\n`);

    // Step 3: Fix based on column existence
    if (existingColumns.length === 4) {
      // All columns exist - mark migration as applied
      console.log("✅ All columns exist. Marking migration as APPLIED...");
      
      await prisma.$executeRaw`
        UPDATE "_prisma_migrations" 
        SET finished_at = NOW(),
            applied_steps_count = 1
        WHERE migration_name = '20251228161859_add_help_ticket_assignment_fields'
        AND finished_at IS NULL
      `;
      
      console.log("   ✅ Migration marked as applied successfully!\n");
    } else if (existingColumns.length === 0) {
      // No columns exist - mark migration as rolled back
      console.log("⚠️  No columns exist. Marking migration as ROLLED BACK...");
      
      await prisma.$executeRaw`
        DELETE FROM "_prisma_migrations"
        WHERE migration_name = '20251228161859_add_help_ticket_assignment_fields'
        AND finished_at IS NULL
      `;
      
      console.log("   ✅ Migration marked as rolled back. It will retry on next deploy.\n");
    } else {
      // Partial columns - this is unusual, need manual fix
      console.log("⚠️  PARTIAL COLUMNS DETECTED!");
      console.log(`   Existing: ${existingColumns.join(', ')}`);
      console.log(`   Missing: ${['raisedByRole', 'assignedToRole', 'managerId', 'assignedToId']
        .filter(c => !existingColumns.includes(c)).join(', ')}\n`);
      console.log("   ⚠️  Manual intervention required. Please check the database.\n");
      process.exit(1);
    }

    // Step 4: Verify fix
    console.log("🔍 Verifying fix...");
    const verifyStatus = await prisma.$queryRaw<Array<{
      migration_name: string;
      finished_at: Date | null;
    }>>`
      SELECT migration_name, finished_at
      FROM "_prisma_migrations"
      WHERE migration_name = '20251228161859_add_help_ticket_assignment_fields'
    `;

    if (verifyStatus.length > 0 && verifyStatus[0].finished_at) {
      console.log("   ✅ Migration is now marked as finished!\n");
    } else if (verifyStatus.length === 0) {
      console.log("   ✅ Migration record removed (will retry on deploy)!\n");
    }

    console.log("========================================");
    console.log("  ✅ MIGRATION FIX COMPLETE");
    console.log("========================================\n");
    console.log("Next steps:");
    console.log("1. Redeploy your Railway service");
    console.log("2. The deployment should now succeed\n");

    process.exit(0);
  } catch (error: any) {
    console.error("\n❌ Error fixing migration:");
    console.error(error.message);
    console.error("\nFull error:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

fixFailedMigration();

