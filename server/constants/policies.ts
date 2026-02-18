/**
 * Policy Constants - Allowlist for requirePolicy middleware.
 * Single source of truth: shared/policies.ts (registry).
 * POLICIES object kept for backward compatibility; allowlist from registry.
 */

import { POLICY_KEYS_FLAT } from "../../shared/policies";

export const POLICIES = {
  DASHBOARD_VIEW: "dashboard.view",
  ROLES_ASSIGNED_VIEW: "roles-assigned.view",
  EMPLOYEES_VIEW: "employees.view",
  ATTENDANCE_HISTORY_VIEW: "attendance.history.view",
  ATTENDANCE_SELF_VIEW: "attendance.self.view",
  ATTENDANCE_TEAM_VIEW: "attendance.team.view",
  ATTENDANCE_TEAM_EXPORT: "attendance.team.export",
  ATTENDANCE_TEAM_VERIFY: "attendance.team.verify",
  ATTENDANCE_TEAM_QUERIES_VIEW: "attendance.team.queries.view",
  ATTENDANCE_HR_VIEW: "attendance.hr.view",
  ATTENDANCE_HR_RESOLVE: "attendance.hr.resolve",
  ATTENDANCE_TEAM_VERIFICATION_AUDIT_VIEW: "attendance.team.verification.audit.view",
  ATTENDANCE_TEAM_VERIFICATION_AUDIT_EXPORT: "attendance.team.verification.audit.export",
  SALES_ATTENDANCE_CURRENT_MONTH_VIEW: "sales.attendance.current-month.view",
  ATTENDANCE_WORKLOG_VIEW: "attendance.worklog.view",
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
  VIEW_USERS: "VIEW_USERS",
  CREATE_USER: "CREATE_USER",
  EDIT_USER: "EDIT_USER",
  RESET_PASSWORD: "RESET_PASSWORD",
  ASSIGN_ROLE: "ASSIGN_ROLE",
  VIEW_ROLES: "VIEW_ROLES",
  CREATE_ROLE: "CREATE_ROLE",
  EDIT_ROLE: "EDIT_ROLE",
  VIEW_POLICIES: "VIEW_POLICIES",
  CREATE_POLICY: "CREATE_POLICY",
  EDIT_POLICY: "EDIT_POLICY",
  MANAGE_SYSTEM_SETTINGS: "MANAGE_SYSTEM_SETTINGS",
  VIEW_AUDIT_LOGS: "VIEW_AUDIT_LOGS",
  AUDIT_VIEW: "audit.view",
  SYSTEM_HEALTH_VIEW: "system.health.view",
  VIEW_DASHBOARD: "VIEW_DASHBOARD",
  VIEW_ATTENDANCE: "VIEW_ATTENDANCE",
  VIEW_REPORTS: "VIEW_REPORTS",
  VIEW_PAYROLL: "VIEW_PAYROLL",
} as const;

/**
 * Policy key validation regex (dot notation, 2+ segments)
 */
export const POLICY_KEY_REGEX = /^[a-z][a-z0-9_-]*(\.[a-z][a-z0-9_-]*)+$/;

/** UPPER_SNAKE_CASE for RBAC policy keys */
export const POLICY_KEY_RBAC_REGEX = /^[A-Z][A-Z0-9_]+$/;

/**
 * Validate policy key: format (dot or UPPER_SNAKE) or present in registry
 */
export function isValidPolicyKey(key: string): boolean {
  return POLICY_KEY_REGEX.test(key) || POLICY_KEY_RBAC_REGEX.test(key) || POLICY_KEYS_FLAT.includes(key);
}

/**
 * Get all policy keys (from registry) for requirePolicy allowlist
 */
export function getAllPolicyKeys(): string[] {
  return POLICY_KEYS_FLAT;
}
