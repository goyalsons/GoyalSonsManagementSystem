import { PrismaClient } from "@prisma/client";
import crypto from "crypto";

async function main() {
  const prisma = new PrismaClient();
  const email = "akshat@goyalsons.com";
  const name = "Akshat";
  const password = "akshat@123";
  const hash = crypto.createHash("sha256").update(password).digest("hex");

  await prisma.user.upsert({
    where: { email },
    update: { passwordHash: hash, name, isSuperAdmin: true },
    create: { email, name, passwordHash: hash, isSuperAdmin: true },
  });

  console.log("User upserted:", email);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

