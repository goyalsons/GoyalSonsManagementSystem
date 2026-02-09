/**
 * Check if a card number is an assigned manager (exists in emp_manager, mis_extinct = false).
 * Run: node scripts/check-is-manager.cjs [cardNo]
 * Example: node scripts/check-is-manager.cjs 11017
 * Or set CARD_NO=11017 and run: node scripts/check-is-manager.cjs
 */
require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const cardNo = process.argv[2] || process.env.CARD_NO || "";
if (!cardNo) {
  console.log("Usage: node scripts/check-is-manager.cjs <cardNo>");
  console.log("Example: node scripts/check-is-manager.cjs 11017");
  process.exit(1);
}

async function main() {
  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient();
  try {
    const normalized = String(cardNo).trim();
    const row = await prisma.empManager.findFirst({
      where: {
        mcardno: normalized,
        mis_extinct: false,
      },
    });
    if (row) {
      console.log(`Card ${normalized} IS an assigned manager.`);
      console.log("  mid:", row.mid);
      console.log("  mcardno:", row.mcardno);
      console.log("  mdepartmentIds:", row.mdepartmentIds?.length || 0, "departments");
      console.log("  mdesignationIds:", row.mdesignationIds?.length || 0, "designations");
      console.log("  morgUnitIds:", row.morgUnitIds?.length || 0, "org units");
    } else {
      const extinct = await prisma.empManager.findFirst({
        where: { mcardno: normalized, mis_extinct: true },
      });
      if (extinct) {
        console.log(`Card ${normalized} is NOT an active manager (has extinct record only).`);
      } else {
        console.log(`Card ${normalized} is NOT an assigned manager (no row in emp_manager).`);
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
