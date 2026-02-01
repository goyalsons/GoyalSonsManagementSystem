import type { Response } from "express";

/**
 * SSE connection store for real-time session invalidation.
 * When Director triggers "logout all", we push to all connected clients.
 */
const sseClients = new Map<string, Response>();

export function registerSseClient(sessionId: string, res: Response): void {
  sseClients.set(sessionId, res);
  res.on("close", () => sseClients.delete(sessionId));
}

export function broadcastLogoutAll(): void {
  const payload = JSON.stringify({ event: "logout_all", message: "Session invalidated by admin" });
  for (const [sessionId, res] of sseClients.entries()) {
    try {
      res.write(`data: ${payload}\n\n`);
      res.end();
    } catch {
      // Ignore write errors
    }
    sseClients.delete(sessionId);
  }
}
