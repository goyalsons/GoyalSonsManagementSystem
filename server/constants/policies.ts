/**
 * Policy Constants - DEPRECATED
 * 
 * ⚠️ NOTE: Policies are now auto-synced from NAV_CONFIG (client/src/config/nav.config.ts)
 * ⚠️ This file is kept for backward compatibility but policies come from NAV_CONFIG
 * 
 * The single source of truth for policies is:
 * - client/src/config/nav.config.ts (defines all policies)
 * - server/services/policy-sync.service.ts (syncs to DB on startup)
 * - Database (PostgreSQL) is the runtime source of truth
 * 
 * Format: {resource}.{action}
 * - Lowercase only
 * - Use dots as separators
 * - No spaces, underscores, or hyphens
 * 
 * @deprecated Use policies from database via /api/policies endpoint
 */

export const POLICIES = {
  // Dashboard
  DASHBOARD_VIEW: "dashboard.view",

  // User Management
  USERS_VIEW: "users.view",
  USERS_ASSIGN_ROLE: "users.assign_role",

  // Attendance/Work Log
  ATTENDANCE_VIEW: "attendance.view",
  ATTENDANCE_CREATE: "attendance.create",

  // Sales
  SALES_VIEW: "sales.view",
  SALES_REFRESH: "sales.refresh",
  SALES_STAFF_VIEW: "sales.staff.view",
  SALES_STAFF_REFRESH: "sales.staff.refresh",

  // Tasks
  TASKS_VIEW: "tasks.view",
  TASKS_CREATE: "tasks.create",

  // Claims
  CLAIMS_VIEW: "claims.view",

  // Announcements
  ANNOUNCEMENTS_VIEW: "announcements.view",

  // Targets
  TARGETS_VIEW: "targets.view",

  // Role Management
  ROLES_VIEW: "roles.view",
  ROLES_CREATE: "roles.create",
  ROLES_EDIT: "roles.edit",
  ROLES_DELETE: "roles.delete",

  // Policy Management
  POLICIES_VIEW: "policies.view",
  POLICIES_CREATE: "policies.create",

  // Manager
  MANAGER_VIEW: "manager.view",
  MANAGER_ASSIGN: "manager.assign",
  MANAGER_DELETE: "manager.delete",
  MANAGER_TEAM_VIEW: "manager.team.view",

  // Help Tickets
  HELP_TICKETS_VIEW: "help_tickets.view",
  HELP_TICKETS_CREATE: "help_tickets.create",
  HELP_TICKETS_UPDATE: "help_tickets.update",

  // Settings
  SETTINGS_VIEW: "settings.view",
  SETTINGS_EDIT: "settings.edit",

  // Admin Panel
  ADMIN_PANEL: "admin.panel",
} as const;

/**
 * Policy key validation regex
 * Format: {resource}.{action}
 * - Lowercase letters and numbers
 * - Dots as separators
 * - Minimum 2 parts (resource.action)
 * - Maximum 3 levels deep (resource.subresource.action)
 */
export const POLICY_KEY_REGEX = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*){1,2}$/;

/**
 * Validate policy key format
 */
export function isValidPolicyKey(key: string): boolean {
  return POLICY_KEY_REGEX.test(key);
}

/**
 * Get all policy keys as array
 */
export function getAllPolicyKeys(): string[] {
  return Object.values(POLICIES);
}
