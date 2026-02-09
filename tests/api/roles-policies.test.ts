import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { createApp } from "../../server/app.js";

describe("API roles and policies", () => {
  let app: Awaited<ReturnType<typeof createApp>>;

  beforeAll(async () => {
    app = await createApp();
  });

  describe("GET /api/roles", () => {
    it("returns 401 when not authenticated", async () => {
      await request(app)
        .get("/api/roles")
        .expect(401);
    });
  });

  describe("GET /api/roles/:id", () => {
    it("returns 401 when not authenticated", async () => {
      await request(app)
        .get("/api/roles/550e8400-e29b-41d4-a716-446655440000")
        .expect(401);
    });
  });

  describe("GET /api/policies", () => {
    it("returns 401 when not authenticated", async () => {
      await request(app)
        .get("/api/policies")
        .expect(401);
    });
  });
});
