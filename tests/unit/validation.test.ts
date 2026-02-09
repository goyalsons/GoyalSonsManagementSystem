import { describe, it, expect } from "vitest";
import {
  validatePolicyKey,
  validateRoleName,
  validateUUID,
  validatePolicyIds,
} from "../../server/lib/validation.js";

describe("validation", () => {
  describe("validatePolicyKey", () => {
    it("accepts valid policy key", () => {
      expect(validatePolicyKey("dashboard.view")).toEqual({ valid: true });
      expect(validatePolicyKey("attendance.team.view")).toEqual({ valid: true });
    });

    it("rejects empty or non-string", () => {
      expect(validatePolicyKey("")).toEqual({
        valid: false,
        error: "Policy key must be a non-empty string",
      });
      expect(validatePolicyKey(undefined as any)).toEqual({
        valid: false,
        error: "Policy key must be a non-empty string",
      });
    });

    it("rejects invalid format", () => {
      const r = validatePolicyKey("Invalid Key");
      expect(r.valid).toBe(false);
      expect(r.error).toContain("match format");
    });
  });

  describe("validateRoleName", () => {
    it("accepts valid role name", () => {
      expect(validateRoleName("Director")).toEqual({ valid: true });
      expect(validateRoleName("Store Manager")).toEqual({ valid: true });
    });

    it("rejects empty or whitespace", () => {
      expect(validateRoleName("")).toEqual({
        valid: false,
        error: "Role name must be a non-empty string",
      });
      expect(validateRoleName("   ")).toEqual({
        valid: false,
        error: "Role name cannot be empty or whitespace",
      });
    });

    it("rejects name over 100 chars", () => {
      const r = validateRoleName("a".repeat(101));
      expect(r.valid).toBe(false);
      expect(r.error).toContain("100");
    });
  });

  describe("validateUUID", () => {
    it("accepts valid UUID", () => {
      expect(
        validateUUID("550e8400-e29b-41d4-a716-446655440000")
      ).toEqual({ valid: true });
    });

    it("rejects invalid UUID", () => {
      expect(validateUUID("not-a-uuid").valid).toBe(false);
      expect(validateUUID("").valid).toBe(false);
    });
  });

  describe("validatePolicyIds", () => {
    it("accepts valid array of UUIDs", () => {
      const ids = ["550e8400-e29b-41d4-a716-446655440000", "6ba7b810-9dad-11d1-80b4-00c04fd430c8"];
      const r = validatePolicyIds(ids);
      expect(r.valid).toBe(true);
      expect(r.ids).toEqual(ids);
    });

    it("accepts empty array", () => {
      const r = validatePolicyIds([]);
      expect(r.valid).toBe(true);
      expect(r.ids).toEqual([]);
    });

    it("rejects non-array", () => {
      expect(validatePolicyIds(null).valid).toBe(false);
      expect(validatePolicyIds("string").valid).toBe(false);
      expect(validatePolicyIds({}).valid).toBe(false);
    });

    it("rejects array with invalid UUID", () => {
      const r = validatePolicyIds(["550e8400-e29b-41d4-a716-446655440000", "not-a-uuid"]);
      expect(r.valid).toBe(false);
      expect(r.error).toContain("Invalid policy ID");
    });
  });
});
