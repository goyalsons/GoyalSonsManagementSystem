/**
 * NAV_CONFIG - Single Source of Truth for Navigation & Policies
 * 
 * This file defines:
 * - All navigation items in the UI
 * - All policies required for each page/action
 * - Auto-synced to database on server startup
 * 
 * Rules:
 * - If a page exists → policy exists
 * - All policies are auto-generated from this config
 * - No manual policy creation needed
 * - Backend enforces these policies
 */

export interface NavAction {
  create?: string;
  update?: string;
  delete?: string;
  assign?: string;
  close?: string;
  [key: string]: string | undefined; // Allow custom actions
}

export interface NavConfigItem {
  key: string;
  label: string;
  path: string;
  policy: string; // Required policy to view this page
  actions?: NavAction; // Optional action policies (for buttons)
  icon?: string; // Icon name (for reference, actual icons in MainLayout)
}

export const NAV_CONFIG: NavConfigItem[] = [
  { 
    key: "dashboard", 
    label: "Dashboard", 
    path: "/", 
    policy: "dashboard.view" 
  },
  { 
    key: "roles-assigned", 
    label: "Roles Assigned", 
    path: "/roles-assigned", 
    policy: "roles-assigned.view" 
  },
  { 
    key: "roles", 
    label: "Roles", 
    path: "/roles", 
    policy: "roles-assigned.view" 
  },
  { 
    key: "roles-edit", 
    label: "Edit Role", 
    path: "/roles/:id", 
    policy: "roles-assigned.view" 
  },
  { 
    key: "roles-assign-manager", 
    label: "Assign Manager", 
    path: "/roles/manager/assign", 
    policy: "roles-assigned.view" 
  },
  { 
    key: "members", 
    label: "Members", 
    path: "/employees", 
    policy: "employees.view" 
  },
  { 
    key: "members-create", 
    label: "Create Member", 
    path: "/employees/create", 
    policy: "employees.view" 
  },
  { 
    key: "tasks-history", 
    label: "Task History", 
    path: "/attendance/history", 
    policy: "attendance.history.view" 
  },
  { 
    key: "attendance", 
    label: "Work Log", 
    path: "/attendance", 
    policy: "attendance.worklog.view" 
  },
  { 
    key: "attendance-today", 
    label: "Today Work Log", 
    path: "/attendance/today", 
    policy: "attendance.worklog.view" 
  },
  { 
    key: "attendance-fill", 
    label: "Fill Work Log", 
    path: "/attendance/fill", 
    policy: "attendance.worklog.view" 
  },
  { 
    key: "attendance-self", 
    label: "My Attendance", 
    path: "/attendance/self", 
    policy: "attendance.self.view" 
  },
  { 
    key: "attendance-team", 
    label: "Team Attendance", 
    path: "/attendance/team", 
    policy: "attendance.team.view" 
  },
  { 
    key: "work-log", 
    label: "Work Log", 
    path: "/work-log", 
    policy: "attendance.history.view" 
  },
  { 
    key: "sales", 
    label: "Sales", 
    path: "/sales", 
    policy: "staff-sales.view" 
  },
  { 
    key: "sales-self", 
    label: "My Sales", 
    path: "/sales/self", 
    policy: "sales.self.view" 
  },
  { 
    key: "sales-dashboard", 
    label: "Sales Dashboard", 
    path: "/sales/dashboard", 
    policy: "sales.dashboard.view" 
  },
  { 
    key: "sales-store", 
    label: "Store Sales", 
    path: "/sales/store", 
    policy: "sales.store.view" 
  },
  { 
    key: "sales-staff", 
    label: "Sales Staff", 
    path: "/sales-staff", 
    policy: "sales-staff.view" 
  },
  { 
    key: "sales-staff-view", 
    label: "Staff Sales View", 
    path: "/sales/staff", 
    policy: "sales.staff.view" 
  },
  { 
    key: "integrations", 
    label: "Integrations", 
    path: "/integrations", 
    policy: "admin.panel" 
  },
  { 
    key: "api-settings", 
    label: "API Setting", 
    path: "/admin/routing", 
    policy: "admin.routing.view" 
  },
  { 
    key: "masters-settings", 
    label: "Masters Settings", 
    path: "/admin/master-settings", 
    policy: "admin.master-settings.view" 
  },
  { 
    key: "fetched-data", 
    label: "Fetched Data", 
    path: "/integrations/fetched-data", 
    policy: "integrations.fetched-data.view" 
  },
  { 
    key: "trainings", 
    label: "Trainings", 
    path: "/training", 
    policy: "trainings.view" 
  },
  { 
    key: "requests", 
    label: "Requests", 
    path: "/requests", 
    policy: "requests.view" 
  },
  { 
    key: "salary", 
    label: "Salary", 
    path: "/salary", 
    policy: "salary.view" 
  },
  { 
    key: "settings", 
    label: "Settings", 
    path: "/settings", 
    policy: "settings.view" 
  },
  { 
    key: "manager-assigned", 
    label: "Assigned Manager", 
    path: "/assigned-manager", 
    policy: "assigned-manager.view" 
  },
  {
    key: "help-tickets",
    label: "Help Tickets",
    path: "/help-tickets",
    policy: "help_tickets.view",
    actions: {
      create: "help_tickets.create",
      update: "help_tickets.update",
      assign: "help_tickets.assign",
      close: "help_tickets.close"
    }
  },
  {
    key: "no-policy",
    label: "No Policy",
    path: "/no-policy",
    policy: "no_policy.view",
  }
];

/**
 * Get all unique policies from NAV_CONFIG
 * Includes both page policies and action policies
 */
export function getAllPoliciesFromNavConfig(): string[] {
  const policies = new Set<string>();
  
  NAV_CONFIG.forEach(item => {
    policies.add(item.policy);
    if (item.actions) {
      Object.values(item.actions).forEach(actionPolicy => {
        if (actionPolicy) {
          policies.add(actionPolicy);
        }
      });
    }
  });
  
  return Array.from(policies).sort();
}

/**
 * Get policy for a given path
 */
export function getPolicyForPath(path: string): string | null {
  const item = NAV_CONFIG.find(item => item.path === path);
  return item ? item.policy : null;
}

/**
 * Get action policy for a given path and action
 */
export function getActionPolicy(path: string, action: string): string | null {
  const item = NAV_CONFIG.find(item => item.path === path);
  if (!item || !item.actions) return null;
  return item.actions[action] || null;
}
