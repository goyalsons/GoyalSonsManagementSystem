/**
 * Increment policyVersion for all users with a given role.
 * Used when role's policies change so auth cache revalidates on next request.
 */

import { prisma } from "./prisma";

export async function incrementPolicyVersionForRoleUsers(roleId: string): Promise<void> {
  const usersWithRole = await prisma.userRole.findMany({
    where: { roleId },
    select: { userId: true },
  });

  const userIds = usersWithRole.map((ur) => ur.userId);
  if (userIds.length > 0) {
    await prisma.user.updateMany({
      where: { id: { in: userIds } },
      data: {
        policyVersion: { increment: 1 },
      },
    });
  }
}
