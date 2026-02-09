import { describe, it, expect } from "vitest";
import { encodeName, encodeFullName } from "../../client/src/lib/utils";

describe("client utils", () => {
  describe("encodeName", () => {
    it("returns empty for null/undefined/empty", () => {
      expect(encodeName(null)).toBe("");
      expect(encodeName(undefined)).toBe("");
      expect(encodeName("")).toBe("");
      expect(encodeName("   ")).toBe("");
    });

    it("keeps first letter and removes vowels from rest", () => {
      expect(encodeName("VISHAWJEET")).toBe("VSHWJT");
      expect(encodeName("ANKUSH")).toBe("ANKSH");
    });
  });

  describe("encodeFullName", () => {
    it("encodes first and last name", () => {
      expect(encodeFullName("VISHAWJEET", "KUMA")).toBe("VSHWJT KM");
    });
  });
});
