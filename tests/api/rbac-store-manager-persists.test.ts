/**
 * Regression test: Store Manager role must persist after re-login (card login).
 *
 * Bug: loadUserFromSession() used to call ensureUserHasRole("Employee"), which
 * called replaceUserRoles() and wiped Store Manager on every request.
 *
 * This test: assign Store Manager to employee-linked user, create a new session
 * (simulating re-login via card), call GET /api/auth/me, expect role is still Store Manager.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../../server/app.js";
import { prisma } from "../../server/lib/prisma.js";

describe("RBAC: Store Manager persists after re-login (card)", () => {
  let app: Awaited<ReturnType<typeof createApp>>;
  let created: {
    orgUnitId?: string;
    employeeId?: string;
    userId?: string;
    sessionId?: string;
    storeManagerRoleId?: string;
  } = {};

  beforeAll(async () => {
    app = await createApp();
  });

  afterAll(async () => {
    // Cleanup in reverse order of creation
    if (created.sessionId) {
      await prisma.session.delete({ where: { id: created.sessionId } }).catch(() => {});
    }
    if (created.userId) {
      await prisma.userRole.deleteMany({ where: { userId: created.userId } }).catch(() => {});
      await prisma.session.deleteMany({ where: { userId: created.userId } }).catch(() => {});
      await prisma.user.delete({ where: { id: created.userId } }).catch(() => {});
    }
    if (created.employeeId) {
      await prisma.employee.delete({ where: { id: created.employeeId } }).catch(() => {});
    }
    if (created.orgUnitId) {
      await prisma.orgUnit.delete({ where: { id: created.orgUnitId } }).catch(() => {});
    }
  });

  it("assign Store Manager to employee-linked user, re-login (session), GET /api/auth/me returns Store Manager", async () => {
    // 1) Get or create Store Manager role
    const storeManagerRole = await prisma.role.upsert({
      where: { name: "Store Manager" },
      update: {},
      create: { name: "Store Manager", description: "Store Manager" },
      select: { id: true, name: true },
    });
    created.storeManagerRoleId = storeManagerRole.id;

    // 2) Create OrgUnit (required for Employee)
    const orgUnit = await prisma.orgUnit.create({
      data: {
        name: `Test OU RBAC ${Date.now()}`,
        code: `RBAC-${Date.now()}`,
      },
      select: { id: true },
    });
    created.orgUnitId = orgUnit.id;

    // 3) Create Employee (card-linked)
    const employee = await prisma.employee.create({
      data: {
        firstName: "Store",
        lastName: "Manager",
        cardNumber: `CARD-RBAC-${Date.now()}`,
        phone: "9876543210",
        status: "ACTIVE",
        orgUnitId: orgUnit.id,
      },
      select: { id: true, cardNumber: true },
    });
    created.employeeId = employee.id;

    // 4) Create User linked to employee
    const user = await prisma.user.create({
      data: {
        name: "Store Manager User",
        email: `rbac-sm-${Date.now()}@test.example.invalid`,
        passwordHash: "test-hash",
        status: "active",
        employeeId: employee.id,
        orgUnitId: orgUnit.id,
      },
      select: { id: true },
    });
    created.userId = user.id;

    // 5) Assign Store Manager role (single role per user)
    await prisma.userRole.deleteMany({ where: { userId: user.id } });
    await prisma.userRole.create({
      data: { userId: user.id, roleId: storeManagerRole.id },
    });
    await prisma.user.update({
      where: { id: user.id },
      data: { policyVersion: { increment: 1 } },
    });

    // 6) Simulate "re-login with card": create a new session (employee login type)
    const session = await prisma.session.create({
      data: {
        userId: user.id,
        expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
        loginType: "employee",
        employeeCardNo: employee.cardNumber,
      },
      select: { id: true },
    });
    created.sessionId = session.id;

    // 7) Call /api/auth/me with this session (triggers loadUserFromSession; must NOT mutate roles)
    const res = await request(app)
      .get("/api/auth/me")
      .set("x-session-id", session.id)
      .expect(200);

    const body = res.body as {
      roles?: { id: string; name: string }[];
      loginType?: string;
      employeeId?: string | null;
    };

    expect(body.roles, "roles must be present").toBeDefined();
    expect(Array.isArray(body.roles)).toBe(true);
    const roleNames = (body.roles ?? []).map((r) => r.name);
    expect(
      roleNames.includes("Store Manager"),
      `Expected roles to include "Store Manager", got: ${JSON.stringify(roleNames)}`
    ).toBe(true);
    expect(body.loginType).toBe("employee");
    expect(body.employeeId).toBe(employee.id);
  });
});
