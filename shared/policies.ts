/**
 * Shared Policy Registry - Single source of truth for RBAC policy keys.
 * Used by: server (requirePolicy allowlist), prisma/seed, policy-sync service, nav config validation.
 * Browser and Node safe (no Node-only APIs).
 */

export interface PolicyRecord {
  key: string;
  description: string;
  category: string;
}

/** Full registry: key, description, category for seed and sync */
export const POLICY_REGISTRY: PolicyRecord[] = [
  { key: "dashboard.view", description: "Access dashboard", category: "dashboard" },
  { key: "roles-assigned.view", description: "Access roles assigned page", category: "roles" },
  { key: "employees.view", description: "Access employees page", category: "employees" },
  { key: "attendance.history.view", description: "Access attendance history", category: "attendance" },
  { key: "attendance.self.view", description: "View own attendance", category: "attendance" },
  { key: "attendance.team.view", description: "View team attendance", category: "attendance" },
  { key: "attendance.team.export", description: "Export team attendance check as Excel", category: "attendance" },
  { key: "attendance.team.verify", description: "Create and save team attendance verification batch", category: "attendance" },
  { key: "attendance.team.queries.view", description: "View my attendance queries (manager inbox)", category: "attendance" },
  { key: "attendance.hr.view", description: "View HR attendance queries dashboard", category: "attendance" },
  { key: "attendance.hr.resolve", description: "Resolve attendance queries (set status/remark)", category: "attendance" },
  { key: "attendance.team.verification.audit.view", description: "View verification audit batches", category: "attendance" },
  { key: "attendance.team.verification.audit.export", description: "Export verification audit data", category: "attendance" },
  { key: "attendance.worklog.view", description: "View attendance worklog", category: "attendance" },
  { key: "sales.view", description: "Access sales page", category: "sales" },
  { key: "sales.self.view", description: "View own sales", category: "sales" },
  { key: "sales.staff.view", description: "View staff sales", category: "sales" },
  { key: "sales.dashboard.view", description: "Access sales dashboard", category: "sales" },
  { key: "sales.store.view", description: "View store sales", category: "sales" },
  { key: "sales-staff.view", description: "Access sales staff page", category: "sales" },
  { key: "staff-sales.view", description: "Access staff sales", category: "sales" },
  { key: "admin.panel", description: "Access admin panel", category: "admin" },
  { key: "admin.routing.view", description: "Access API routing", category: "admin" },
  { key: "admin.master-settings.view", description: "Access master settings", category: "admin" },
  { key: "integrations.fetched-data.view", description: "Access fetched data", category: "integrations" },
  { key: "trainings.view", description: "Access trainings", category: "training" },
  { key: "trainings.create", description: "Create training", category: "training" },
  { key: "trainings.assign", description: "Assign training to employees", category: "training" },
  { key: "trainings.complete", description: "Mark training complete", category: "training" },
  { key: "requests.view", description: "Access requests", category: "requests" },
  { key: "requests.self.view", description: "View own requests", category: "requests" },
  { key: "requests.team.view", description: "View team requests", category: "requests" },
  { key: "requests.create", description: "Create new request", category: "requests" },
  { key: "requests.approve", description: "Approve or reject request", category: "requests" },
  { key: "salary.view", description: "Access salary", category: "salary" },
  { key: "settings.view", description: "Access settings", category: "settings" },
  { key: "assigned-manager.view", description: "Access Assigned Manager page (team members list)", category: "manager" },
  { key: "my-team.view", description: "Access My Team menu (Team Attendance, Team Sales, Team Requests)", category: "manager" },
  { key: "help_tickets.view", description: "View help tickets", category: "help_tickets" },
  { key: "help_tickets.create", description: "Create help tickets", category: "help_tickets" },
  { key: "help_tickets.update", description: "Update help tickets", category: "help_tickets" },
  { key: "help_tickets.assign", description: "Assign help tickets", category: "help_tickets" },
  { key: "help_tickets.close", description: "Close help tickets", category: "help_tickets" },
  { key: "no_policy.view", description: "Access no policy page", category: "system" },
  { key: "attendance.timing.absent.in.view", description: "View In Time for ABSENT status", category: "attendance_timing" },
  { key: "attendance.timing.absent.out.view", description: "View Out Time for ABSENT status", category: "attendance_timing" },
  { key: "attendance.timing.present.in.view", description: "View In Time for PRESENT status", category: "attendance_timing" },
  { key: "attendance.timing.present.out.view", description: "View Out Time for PRESENT status", category: "attendance_timing" },
  { key: "attendance.timing.present_late.in.view", description: "View In Time for PRESENT LATE status", category: "attendance_timing" },
  { key: "attendance.timing.present_late.out.view", description: "View Out Time for PRESENT LATE status", category: "attendance_timing" },
  { key: "attendance.timing.present_early.in.view", description: "View In Time for PRESENT EARLY_OUT status", category: "attendance_timing" },
  { key: "attendance.timing.present_early.out.view", description: "View Out Time for PRESENT EARLY_OUT status", category: "attendance_timing" },
  { key: "attendance.timing.miss.in.view", description: "View In Time for MISS status", category: "attendance_timing" },
  { key: "attendance.timing.miss.out.view", description: "View Out Time for MISS status", category: "attendance_timing" },
  { key: "attendance.timing.all.view", description: "View all attendance timings (Director bypass)", category: "attendance_timing" },
  { key: "VIEW_DASHBOARD", description: "View dashboard", category: "pages" },
  { key: "VIEW_ATTENDANCE", description: "View attendance", category: "pages" },
  { key: "VIEW_REPORTS", description: "View reports", category: "pages" },
  { key: "VIEW_PAYROLL", description: "View payroll", category: "pages" },
  { key: "VIEW_USERS", description: "View users management", category: "pages" },
  { key: "VIEW_ROLES", description: "View roles management", category: "pages" },
  { key: "VIEW_POLICIES", description: "View policies management", category: "pages" },
  { key: "CREATE_USER", description: "Create user (email/password)", category: "actions" },
  { key: "EDIT_USER", description: "Edit user (name, status)", category: "actions" },
  { key: "RESET_PASSWORD", description: "Reset user password", category: "actions" },
  { key: "ASSIGN_ROLE", description: "Assign role to user", category: "actions" },
  { key: "CREATE_ROLE", description: "Create role", category: "actions" },
  { key: "EDIT_ROLE", description: "Edit role and assign policies", category: "actions" },
  { key: "CREATE_POLICY", description: "Create policy", category: "actions" },
  { key: "EDIT_POLICY", description: "Edit policy", category: "actions" },
  { key: "MANAGE_SYSTEM_SETTINGS", description: "Manage system settings", category: "system" },
  { key: "VIEW_AUDIT_LOGS", description: "View audit logs (legacy key)", category: "system" },
  { key: "audit.view", description: "View audit logs", category: "audit" },
  { key: "system.health.view", description: "View system health dashboard", category: "system" },
];

/** Flat list of all policy keys (deduplicated, stable order) */
export const POLICY_KEYS_FLAT: string[] = POLICY_REGISTRY.map((r) => r.key);

/** Grouped policy keys for documentation and health checks */
export const POLICY_GROUPS = {
  Pages: POLICY_REGISTRY.filter((r) => r.category === "dashboard" || r.category === "roles" || r.category === "employees" || r.category === "attendance" || r.category === "sales" || r.category === "admin" || r.category === "integrations" || r.category === "training" || r.category === "requests" || r.category === "manager" || r.category === "help_tickets" || r.category === "pages").map((r) => r.key),
  Actions: POLICY_REGISTRY.filter((r) => r.category === "actions" || (r.category !== "system" && r.category !== "audit" && /\.(create|assign|approve|update|close)$/.test(r.key))).map((r) => r.key),
  System: POLICY_REGISTRY.filter((r) => r.category === "system").map((r) => r.key),
  Audit: ["audit.view", "VIEW_AUDIT_LOGS"],
} as const;

/** Optional: map legacy keys to canonical key (e.g. VIEW_AUDIT_LOGS -> audit.view) */
export const POLICY_ALIASES: Record<string, string> = {
  VIEW_AUDIT_LOGS: "audit.view",
};

/** Check if a key is in the registry (resolve alias) */
export function isKnownPolicyKey(key: string): boolean {
  return POLICY_KEYS_FLAT.includes(key) || POLICY_KEYS_FLAT.includes(POLICY_ALIASES[key] ?? "");
}

/** Resolve alias to canonical key; returns key if not an alias */
export function resolvePolicyKey(key: string): string {
  return POLICY_ALIASES[key] ?? key;
}

/** Get all policy keys (for requirePolicy allowlist) */
export function getAllPolicyKeys(): string[] {
  return POLICY_KEYS_FLAT;
}
