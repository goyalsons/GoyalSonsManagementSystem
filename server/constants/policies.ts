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
  DASHBOARD_VIEW: "dashboard.view",
  ROLES_ASSIGNED_VIEW: "roles-assigned.view",
  EMPLOYEES_VIEW: "employees.view",
  // Attendance policies
  ATTENDANCE_HISTORY_VIEW: "attendance.history.view",
  ATTENDANCE_SELF_VIEW: "attendance.self.view",
  ATTENDANCE_TEAM_VIEW: "attendance.team.view",
  ATTENDANCE_WORKLOG_VIEW: "attendance.worklog.view",
  // Sales policies
  SALES_VIEW: "sales.view",
  SALES_SELF_VIEW: "sales.self.view",
  SALES_STAFF_VIEW: "sales.staff.view",
  SALES_DASHBOARD_VIEW: "sales.dashboard.view",
  SALES_STORE_VIEW: "sales.store.view",
  STAFF_SALES_VIEW: "staff-sales.view",
  SALES_STAFF_PAGE_VIEW: "sales-staff.view",
  ADMIN_PANEL: "admin.panel",
  ADMIN_ROUTING_VIEW: "admin.routing.view",
  ADMIN_MASTER_SETTINGS_VIEW: "admin.master-settings.view",
  INTEGRATIONS_FETCHED_DATA_VIEW: "integrations.fetched-data.view",
  TRAININGS_VIEW: "trainings.view",
  TRAININGS_CREATE: "trainings.create",
  TRAININGS_ASSIGN: "trainings.assign",
  TRAININGS_COMPLETE: "trainings.complete",
  REQUESTS_VIEW: "requests.view",
  REQUESTS_SELF_VIEW: "requests.self.view",
  REQUESTS_TEAM_VIEW: "requests.team.view",
  REQUESTS_CREATE: "requests.create",
  REQUESTS_APPROVE: "requests.approve",
  SALARY_VIEW: "salary.view",
  SETTINGS_VIEW: "settings.view",
  ASSIGNED_MANAGER_VIEW: "assigned-manager.view",
  HELP_TICKETS_VIEW: "help_tickets.view",
  HELP_TICKETS_CREATE: "help_tickets.create",
  HELP_TICKETS_UPDATE: "help_tickets.update",
  HELP_TICKETS_ASSIGN: "help_tickets.assign",
  HELP_TICKETS_CLOSE: "help_tickets.close",
  NO_POLICY_VIEW: "no_policy.view",
} as const;

/**
 * Policy key validation regex
 * Format: {resource}.{action}
 * - Lowercase letters, numbers, hyphens, underscores
 * - Dots as separators
 * - Minimum 2 parts (resource.action)
 * - Maximum 3 levels deep (resource.subresource.action)
 */
export const POLICY_KEY_REGEX = /^[a-z][a-z0-9_-]*(\.[a-z][a-z0-9_-]*){1,2}$/;

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
