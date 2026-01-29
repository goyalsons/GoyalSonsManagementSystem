import { PrismaClient } from "@prisma/client";
import crypto from "crypto";

async function main() {
  const prisma = new PrismaClient();
  const email = process.argv[2] || process.env.USER_EMAIL || "user@example.com";
  const name = process.argv[3] || process.env.USER_NAME || "User";
  const password = process.argv[4] || process.env.USER_PASSWORD || "ChangeMe123!";
  const hash = crypto.createHash("sha256").update(password).digest("hex");

  await prisma.user.upsert({
    where: { email },
    update: { passwordHash: hash, name },
    create: { email, name, passwordHash: hash },
  });

  console.log("User upserted:", email);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

