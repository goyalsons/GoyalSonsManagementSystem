import { POLICY_KEY_REGEX, isValidPolicyKey } from "../constants/policies";

/**
 * Validation utilities for RBAC system
 */

/**
 * Validate policy key format
 */
export function validatePolicyKey(key: string): { valid: boolean; error?: string } {
  if (!key || typeof key !== "string") {
    return { valid: false, error: "Policy key must be a non-empty string" };
  }

  if (!isValidPolicyKey(key)) {
    return {
      valid: false,
      error: `Policy key must match format: {resource}.{action} (lowercase, dots only, 2-3 parts)`,
    };
  }

  return { valid: true };
}

/**
 * Validate role name
 */
export function validateRoleName(name: string): { valid: boolean; error?: string } {
  if (!name || typeof name !== "string") {
    return { valid: false, error: "Role name must be a non-empty string" };
  }

  if (name.trim().length === 0) {
    return { valid: false, error: "Role name cannot be empty or whitespace" };
  }

  if (name.length > 100) {
    return { valid: false, error: "Role name cannot exceed 100 characters" };
  }

  // Allow letters, numbers, spaces, and common punctuation
  if (!/^[a-zA-Z0-9\s\-_.,()]+$/.test(name)) {
    return {
      valid: false,
      error: "Role name contains invalid characters. Only letters, numbers, spaces, and basic punctuation are allowed.",
    };
  }

  return { valid: true };
}

/**
 * Validate role level
 */
export function validateRoleLevel(level: number | undefined | null): { valid: boolean; error?: string } {
  if (level === undefined || level === null) {
    return { valid: true }; // Optional field
  }

  if (typeof level !== "number" || !Number.isInteger(level)) {
    return { valid: false, error: "Role level must be an integer" };
  }

  if (level < -100 || level > 100) {
    return { valid: false, error: "Role level must be between -100 and 100" };
  }

  return { valid: true };
}

/**
 * Validate UUID format
 */
export function validateUUID(id: string): { valid: boolean; error?: string } {
  if (!id || typeof id !== "string") {
    return { valid: false, error: "ID must be a non-empty string" };
  }

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    return { valid: false, error: "ID must be a valid UUID" };
  }

  return { valid: true };
}

/**
 * Validate array of policy IDs
 */
export function validatePolicyIds(policyIds: any): { valid: boolean; error?: string; ids?: string[] } {
  if (!Array.isArray(policyIds)) {
    return { valid: false, error: "Policy IDs must be an array" };
  }

  const validIds: string[] = [];
  for (const id of policyIds) {
    const validation = validateUUID(id);
    if (!validation.valid) {
      return { valid: false, error: `Invalid policy ID: ${id}. ${validation.error}` };
    }
    validIds.push(id);
  }

  return { valid: true, ids: validIds };
}
