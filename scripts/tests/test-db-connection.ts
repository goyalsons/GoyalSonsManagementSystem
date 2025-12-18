import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function testDatabaseConnection() {
  console.log("\n========================================");
  console.log("  DATABASE CONNECTION TEST");
  console.log("========================================\n");

  try {
    console.log("🔍 Connecting to database...");
    
    await prisma.$connect();
    console.log("✅ Database connection established\n");

    console.log("🔍 Running test query...");
    const result = await prisma.$queryRaw`SELECT NOW() as current_time, current_database() as database_name`;
    console.log("✅ Query executed successfully");
    console.log("   Result:", JSON.stringify(result, null, 2), "\n");

    console.log("🔍 Checking tables...");
    const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
    `;
    console.log(`✅ Found ${tables.length} tables:`);
    tables.forEach((t, i) => console.log(`   ${i + 1}. ${t.tablename}`));

    console.log("\n🔍 Checking user count...");
    const userCount = await prisma.user.count();
    console.log(`✅ Users in database: ${userCount}`);

    if (userCount === 0) {
      console.log("\n⚠️ No users found. Run 'npm run db:seed' to create initial data.");
    }

    console.log("\n========================================");
    console.log("  ✅ DATABASE TEST PASSED");
    console.log("========================================\n");
    
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Database connection failed:");
    console.error("   ", error instanceof Error ? error.message : error);
    
    console.log("\nTroubleshooting:");
    console.log("  1. Check DATABASE_URL is set correctly");
    console.log("  2. Ensure PostgreSQL is running");
    console.log("  3. Verify database credentials");
    console.log("  4. Run: npm run db:push to sync schema\n");
    
    console.log("========================================");
    console.log("  ❌ DATABASE TEST FAILED");
    console.log("========================================\n");
    
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testDatabaseConnection();
