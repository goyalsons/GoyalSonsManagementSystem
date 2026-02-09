/**
 * Helpers for authenticated API tests: create a session token or set req.user for Supertest.
 */
import type { PrismaClient } from "@prisma/client";

export interface TestUser {
  id: string;
  email: string;
  name: string;
}

/**
 * Create a session in DB for the given user and return session id.
 * Use with setSessionHeader(sessionId) in Supertest requests.
 */
export async function createSessionForUser(
  prisma: PrismaClient,
  userId: string
): Promise<string> {
  const session = await prisma.session.create({
    data: {
      userId,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      loginType: "mdo",
    },
  });
  return session.id;
}

/** Request header for session. Use in API tests: .set(...setSessionHeader(sessionId)) */
export function setSessionHeader(sessionId: string): Record<string, string> {
  return { "x-session-id": sessionId };
}
