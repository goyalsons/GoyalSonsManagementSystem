/**
 * Page-level permissions (OPTION B): UI abstraction only.
 * - <page>.view = open/read the page
 * - <page>.manage = view + all actions (create/assign/approve/update/close etc.)
 * Backend RBAC stays granular; this file only maps page-level intent to existing policy keys.
 */

export type PageAccessLevel = "none" | "view" | "manage";

export interface PagePermission {
  label: string;
  /** Keys required to open/read the page (legacy keys included) */
  viewKeys: string[];
  /** All action keys for this page (create, assign, approve, etc.) */
  manageKeys: string[];
}

/** Page id → viewKeys + manageKeys. Backend still uses granular keys; no keys removed. */
export const PAGE_PERMISSIONS: Record<string, PagePermission> = {
  dashboard: {
    label: "Dashboard",
    viewKeys: ["dashboard.view", "VIEW_DASHBOARD"],
    manageKeys: [],
  },
  attendance: {
    label: "Attendance",
    viewKeys: [
      "attendance.self.view",
      "attendance.history.view",
      "attendance.worklog.view",
      "VIEW_ATTENDANCE",
    ],
    manageKeys: [
      "attendance.team.view",
      "attendance.timing.absent.in.view",
      "attendance.timing.absent.out.view",
      "attendance.timing.present.in.view",
      "attendance.timing.present.out.view",
      "attendance.timing.present_late.in.view",
      "attendance.timing.present_late.out.view",
      "attendance.timing.present_early.in.view",
      "attendance.timing.present_early.out.view",
      "attendance.timing.miss.in.view",
      "attendance.timing.miss.out.view",
      "attendance.timing.all.view",
    ],
  },
  sales: {
    label: "Sales",
    viewKeys: ["sales.view", "sales.self.view", "sales-staff.view"],
    manageKeys: [
      "sales.staff.view",
      "staff-sales.view",
      "sales.dashboard.view",
      "sales.store.view",
    ],
  },
  requests: {
    label: "Requests",
    viewKeys: ["requests.view", "requests.self.view", "requests.team.view"],
    manageKeys: ["requests.create", "requests.approve"],
  },
  help_tickets: {
    label: "Help Tickets",
    viewKeys: ["help_tickets.view"],
    manageKeys: [
      "help_tickets.create",
      "help_tickets.update",
      "help_tickets.assign",
      "help_tickets.close",
    ],
  },
  training: {
    label: "Trainings",
    viewKeys: ["trainings.view"],
    manageKeys: ["trainings.create", "trainings.assign", "trainings.complete"],
  },
  users: {
    label: "User Management",
    viewKeys: ["VIEW_USERS"],
    manageKeys: ["CREATE_USER", "EDIT_USER", "RESET_PASSWORD", "ASSIGN_ROLE"],
  },
  roles_policies: {
    label: "Roles & Policies",
    viewKeys: ["VIEW_ROLES", "VIEW_POLICIES", "roles-assigned.view"],
    manageKeys: ["CREATE_ROLE", "EDIT_ROLE", "CREATE_POLICY", "EDIT_POLICY"],
  },
  admin_system: {
    label: "Admin & System",
    viewKeys: [
      "admin.panel",
      "admin.master-settings.view",
      "admin.routing.view",
      "integrations.fetched-data.view",
      "system.health.view",
      "settings.view",
      "salary.view",
      "VIEW_REPORTS",
      "VIEW_PAYROLL",
    ],
    manageKeys: ["MANAGE_SYSTEM_SETTINGS"],
  },
  audit: {
    label: "Audit Logs",
    viewKeys: ["audit.view", "VIEW_AUDIT_LOGS"],
    manageKeys: [],
  },
  employees_team: {
    label: "Employees & Team",
    viewKeys: ["employees.view", "assigned-manager.view", "my-team.view"],
    manageKeys: [],
  },
  /** No Policy page: shown when user has no other access; allow roles to explicitly grant it */
  no_policy: {
    label: "No Policy Page",
    viewKeys: ["no_policy.view"],
    manageKeys: [],
  },
};

/** Order of pages for UI (matrix columns, selector list) */
export const PAGE_IDS = [
  "dashboard",
  "attendance",
  "sales",
  "requests",
  "help_tickets",
  "training",
  "employees_team",
  "users",
  "roles_policies",
  "admin_system",
  "audit",
  "no_policy",
] as const;

export type PageId = (typeof PAGE_IDS)[number];

/**
 * Get page-level access from role's policy keys (UI abstraction).
 * Backend still checks granular keys; this is for display and selector only.
 */
export function getPageAccess(
  rolePolicyKeys: Set<string>,
  pageId: string
): PageAccessLevel {
  const page = PAGE_PERMISSIONS[pageId];
  if (!page) return "none";

  const viewSet = new Set(page.viewKeys);
  const manageSet = new Set([...page.viewKeys, ...page.manageKeys]);

  const hasAllManage = page.manageKeys.length === 0
    ? viewSet.size > 0 && page.viewKeys.every((k) => rolePolicyKeys.has(k))
    : manageSet.size > 0 && [...manageSet].every((k) => rolePolicyKeys.has(k));
  if (hasAllManage) return "manage";

  const hasAllView = viewSet.size > 0 && page.viewKeys.every((k) => rolePolicyKeys.has(k));
  if (hasAllView) return "view";

  return "none";
}

/**
 * Return all policy keys for a page at the given level (for templates / bulk select).
 * view => viewKeys only; manage => viewKeys + manageKeys.
 */
export function getAllKeysForPage(
  pageId: string,
  level: "view" | "manage"
): string[] {
  const page = PAGE_PERMISSIONS[pageId];
  if (!page) return [];
  if (level === "view") return [...page.viewKeys];
  return [...page.viewKeys, ...page.manageKeys];
}

/**
 * Apply a page-level toggle to the current selection (key space).
 * Used by UI: None = remove all keys for this page; View = set viewKeys; Manage = set viewKeys + manageKeys.
 * Returns the new full set of selected keys (other pages unchanged).
 */
export function expandSelectionFromPageToggle(
  pageId: string,
  level: "none" | "view" | "manage",
  currentSelectedKeys: Set<string>
): Set<string> {
  const page = PAGE_PERMISSIONS[pageId];
  if (!page) return currentSelectedKeys;

  const pageKeys = new Set([...page.viewKeys, ...page.manageKeys]);
  const next = new Set(currentSelectedKeys);

  pageKeys.forEach((k) => next.delete(k));
  if (level === "none") return next;

  page.viewKeys.forEach((k) => next.add(k));
  if (level === "manage") page.manageKeys.forEach((k) => next.add(k));

  return next;
}
