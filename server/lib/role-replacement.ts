import { PrismaClient } from "@prisma/client";

/**
 * Atomic role replacement: remove all existing roles, add only the selected role.
 * Single active role behavior. Uses DB transaction.
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
