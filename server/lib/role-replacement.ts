import { PrismaClient } from "@prisma/client";

/**
 * Atomic role replacement: remove all existing roles, add only the selected role.
 * Single active role behavior. Uses a short transaction only (no long-held connections).
 * Transaction safety: keep $transaction blocks small; for heavy sync use batches outside transactions.
 */
export async function replaceUserRoles(
  prisma: PrismaClient,
  userId: string,
  roleId: string
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.userRole.deleteMany({ where: { userId } });
    await tx.userRole.create({
      data: { userId, roleId },
    });
    await tx.user.update({
      where: { id: userId },
      data: { policyVersion: { increment: 1 } },
    });
  });
}
