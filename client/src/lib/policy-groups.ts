/**
 * UI-only policy grouping for Roles Management.
 * Maps logical groups to existing backend policy keys. Backend RBAC stays granular.
 * Used for: grouped role editor, role matrix, role templates.
 */

export interface PolicyGroupItem {
  /** Display label (e.g. "Self", "View") */
  label: string;
  /** Backend policy keys in this sub-group */
  policyKeys: string[];
}

export interface PolicyGroup {
  id: string;
  label: string;
  description?: string;
  /** Sub-groups (e.g. Attendance: Self, Team, Full Timing) */
  items: PolicyGroupItem[];
}

/** All policy keys in this group (flat, for "select all" and matrix calculation) */
export function getGroupPolicyKeys(group: PolicyGroup): string[] {
  return group.items.flatMap((item) => item.policyKeys);
}

/** UI groups → backend policy keys. No keys removed; backward compatible. */
export const POLICY_GROUPS_UI: PolicyGroup[] = [
  {
    id: "dashboard",
    label: "Dashboard Access",
    description: "Access to main dashboard",
    items: [
      { label: "View", policyKeys: ["dashboard.view", "VIEW_DASHBOARD"] },
    ],
  },
  {
    id: "attendance",
    label: "Attendance Access",
    description: "Attendance history, self, team, and timing details",
    items: [
      { label: "Self", policyKeys: ["attendance.self.view", "attendance.history.view", "attendance.worklog.view", "VIEW_ATTENDANCE"] },
      { label: "Team", policyKeys: ["attendance.team.view"] },
      {
        label: "Full Timing",
        policyKeys: [
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
    ],
  },
  {
    id: "sales",
    label: "Sales Access",
    description: "Sales pages and reports",
    items: [
      { label: "Self", policyKeys: ["sales.view", "sales.self.view"] },
      { label: "Staff", policyKeys: ["sales.staff.view", "sales-staff.view", "staff-sales.view"] },
      { label: "Store", policyKeys: ["sales.store.view"] },
      { label: "Dashboard", policyKeys: ["sales.dashboard.view"] },
    ],
  },
  {
    id: "requests",
    label: "Requests Management",
    description: "Leave and other requests",
    items: [
      { label: "View", policyKeys: ["requests.view", "requests.self.view", "requests.team.view"] },
      { label: "Create", policyKeys: ["requests.create"] },
      { label: "Approve", policyKeys: ["requests.approve"] },
    ],
  },
  {
    id: "help_tickets",
    label: "Help Tickets",
    description: "Help desk tickets",
    items: [
      { label: "View", policyKeys: ["help_tickets.view"] },
      { label: "Create", policyKeys: ["help_tickets.create"] },
      { label: "Assign", policyKeys: ["help_tickets.assign"] },
      { label: "Update", policyKeys: ["help_tickets.update"] },
      { label: "Close", policyKeys: ["help_tickets.close"] },
    ],
  },
  {
    id: "training",
    label: "Training Management",
    description: "Trainings and assignments",
    items: [
      {
        label: "All",
        policyKeys: ["trainings.view", "trainings.create", "trainings.assign", "trainings.complete"],
      },
    ],
  },
  {
    id: "users",
    label: "User Management",
    description: "Users and credentials",
    items: [
      {
        label: "All",
        policyKeys: ["VIEW_USERS", "CREATE_USER", "EDIT_USER", "RESET_PASSWORD", "ASSIGN_ROLE"],
      },
    ],
  },
  {
    id: "roles_policies",
    label: "Role & Policy Management",
    description: "Roles and policies configuration",
    items: [
      {
        label: "All",
        policyKeys: [
          "roles-assigned.view",
          "VIEW_ROLES",
          "VIEW_POLICIES",
          "CREATE_ROLE",
          "EDIT_ROLE",
          "CREATE_POLICY",
          "EDIT_POLICY",
        ],
      },
    ],
  },
  {
    id: "admin_system",
    label: "Admin & System Settings",
    description: "Admin panel and system configuration",
    items: [
      {
        label: "All",
        policyKeys: [
          "admin.panel",
          "admin.routing.view",
          "admin.master-settings.view",
          "settings.view",
          "MANAGE_SYSTEM_SETTINGS",
          "system.health.view",
          "integrations.fetched-data.view",
        ],
      },
    ],
  },
  {
    id: "reports_payroll",
    label: "Reports & Payroll",
    description: "Reports and salary views",
    items: [
      { label: "All", policyKeys: ["VIEW_REPORTS", "VIEW_PAYROLL", "salary.view"] },
    ],
  },
  {
    id: "audit",
    label: "Audit Logs",
    description: "View audit logs",
    items: [{ label: "View", policyKeys: ["audit.view", "VIEW_AUDIT_LOGS"] }],
  },
  {
    id: "employees_manager",
    label: "Employees & Team",
    description: "Employee list and manager team views",
    items: [
      { label: "Employees", policyKeys: ["employees.view"] },
      { label: "Assigned Manager / My Team", policyKeys: ["assigned-manager.view", "my-team.view"] },
    ],
  },
];

/** Matrix column order (group ids) for Role Matrix table */
export const MATRIX_GROUP_IDS = [
  "dashboard",
  "attendance",
  "sales",
  "requests",
  "help_tickets",
  "training",
  "employees_manager",
  "users",
  "roles_policies",
  "admin_system",
  "reports_payroll",
  "audit",
] as const;

export type MatrixGroupId = (typeof MATRIX_GROUP_IDS)[number];

/** Access level for matrix cell: derived from how many of the group's policies the role has */
export type AccessLevel = "None" | "View" | "Limited" | "Full";

/**
 * Compute access level for a group given the set of policy keys the role has.
 * None = 0 policies; View = only view-type policies; Limited = some; Full = all in group.
 */
export function getAccessLevelForGroup(
  group: PolicyGroup,
  rolePolicyKeys: Set<string>
): AccessLevel {
  const keys = getGroupPolicyKeys(group);
  const hasCount = keys.filter((k) => rolePolicyKeys.has(k)).length;
  if (hasCount === 0) return "None";
  if (hasCount >= keys.length) return "Full";
  const hasKeys = keys.filter((k) => rolePolicyKeys.has(k));
  const allView = hasKeys.every(
    (k) => k.includes(".view") || k.startsWith("VIEW_") || k === "admin.panel"
  );
  if (allView && hasKeys.length > 0) return "View";
  return "Limited";
}

/** Map policy key → group id (first group that contains the key) */
export function getGroupIdForPolicyKey(key: string): string | null {
  for (const g of POLICY_GROUPS_UI) {
    if (getGroupPolicyKeys(g).includes(key)) return g.id;
  }
  return null;
}
