/**
 * Policy Sync Service
 * 
 * Auto-syncs policies from NAV_CONFIG to database on server startup.
 * 
 * Rules:
 * - Policies are immutable (key never changes)
 * - Never deletes existing policies
 * - Only creates missing policies
 * - Categories policies by resource (e.g., "dashboard", "sales", "help_tickets")
 */

import { prisma } from "../lib/prisma";

// Import NAV_CONFIG from client (we'll need to duplicate the structure here for server-side)
// Since we can't directly import from client, we'll define the same structure here
interface NavAction {
  create?: string;
  update?: string;
  delete?: string;
  assign?: string;
  close?: string;
  [key: string]: string | undefined;
}

interface NavConfigItem {
  key: string;
  label: string;
  path: string;
  policy: string;
  actions?: NavAction;
}

// NAV_CONFIG structure (must match client/src/config/nav.config.ts)
const NAV_CONFIG: NavConfigItem[] = [
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
    key: "work-log", 
    label: "Work Log", 
    path: "/work-log", 
    policy: "attendance.history.view" 
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
    policy: "trainings.view",
    actions: {
      create: "trainings.create",
      assign: "trainings.assign",
      complete: "trainings.complete"
    }
  },
  { 
    key: "requests", 
    label: "Requests", 
    path: "/requests", 
    policy: "requests.view",
    actions: {
      create: "requests.create",
      approve: "requests.approve"
    }
  },
  { 
    key: "requests-self", 
    label: "My Requests", 
    path: "/requests/self", 
    policy: "requests.self.view" 
  },
  { 
    key: "requests-team", 
    label: "Team Requests", 
    path: "/requests/team", 
    policy: "requests.team.view" 
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
    policy: "no_policy.view"
  }
];

/**
 * Extract all policies from NAV_CONFIG
 * Returns both page policies and action policies
 */
function getAllPoliciesFromNavConfig(): Array<{ key: string; description: string; category: string }> {
  const policiesMap = new Map<string, { description: string; category: string }>();
  
  NAV_CONFIG.forEach(item => {
    // Add page policy
    const category = item.policy.split('.')[0]; // e.g., "dashboard" from "dashboard.view"
    policiesMap.set(item.policy, {
      description: `View ${item.label}`,
      category: category
    });
    
    // Add action policies
    if (item.actions) {
      Object.entries(item.actions).forEach(([action, policyKey]) => {
        if (policyKey) {
          const actionCategory = policyKey.split('.')[0];
          const actionLabel = action.charAt(0).toUpperCase() + action.slice(1);
          policiesMap.set(policyKey, {
            description: `${actionLabel} ${item.label}`,
            category: actionCategory
          });
        }
      });
    }
  });
  
  return Array.from(policiesMap.entries()).map(([key, value]) => ({
    key,
    ...value
  }));
}

/**
 * Sync policies from NAV_CONFIG to database
 * 
 * This function:
 * 1. Extracts all policies from NAV_CONFIG
 * 2. Checks which policies exist in DB
 * 3. Deletes policies not in the allowlist
 * 4. Creates missing policies
 */
export async function syncPoliciesFromNavConfig(): Promise<{
  total: number;
  created: number;
  existing: number;
  removed: number;
  errors: string[];
}> {
  const policiesFromNav = getAllPoliciesFromNavConfig();
  const allowedPolicyKeys = new Set(policiesFromNav.map((p) => p.key));
  allowedPolicyKeys.add("sales.view");
  const policies = policiesFromNav.some((p) => p.key === "sales.view")
    ? policiesFromNav
    : [...policiesFromNav, { key: "sales.view", description: "Access sales page", category: "sales" }];
  const result = {
    total: policies.length,
    created: 0,
    existing: 0,
    removed: 0,
    errors: [] as string[]
  };

  console.log(`[Policy Sync] Starting sync of ${policies.length} policies from NAV_CONFIG...`);

  // Remove any policies that are not in the allowlist
  try {
    const disallowedPolicies = await prisma.policy.findMany({
      where: { key: { notIn: Array.from(allowedPolicyKeys) } },
      select: { id: true, key: true },
    });

    if (disallowedPolicies.length > 0) {
      const disallowedIds = disallowedPolicies.map((policy) => policy.id);
      await prisma.$transaction([
        prisma.rolePolicy.deleteMany({
          where: { policyId: { in: disallowedIds } },
        }),
        prisma.policy.deleteMany({
          where: { id: { in: disallowedIds } },
        }),
      ]);

      result.removed = disallowedPolicies.length;
      console.log(`[Policy Sync] 🧹 Removed ${disallowedPolicies.length} disallowed policies`);
    }
  } catch (error: any) {
    const errorMsg = `Failed to remove disallowed policies: ${error.message}`;
    result.errors.push(errorMsg);
    console.error(`[Policy Sync] ❌ ${errorMsg}`);
  }

  for (const policy of policies) {
    try {
      // Check if policy exists
      const existing = await prisma.policy.findUnique({
        where: { key: policy.key }
      });

      if (existing) {
        result.existing++;
        // Policy exists - do nothing (immutable)
        continue;
      }

      // Create new policy
      await prisma.policy.create({
        data: {
          key: policy.key,
          description: policy.description,
          category: policy.category
          // isActive defaults to true in schema
        }
      });

      result.created++;
      console.log(`[Policy Sync] ✅ Created policy: ${policy.key}`);
    } catch (error: any) {
      const errorMsg = `Failed to sync policy ${policy.key}: ${error.message}`;
      result.errors.push(errorMsg);
      console.error(`[Policy Sync] ❌ ${errorMsg}`);
    }
  }

  console.log(`[Policy Sync] Complete: ${result.created} created, ${result.existing} existing, ${result.removed} removed, ${result.errors.length} errors`);
  return result;
}

async function ensureRoleHasPolicies(roleName: string, policyKeys: string[]): Promise<void> {
  const role = await prisma.role.findUnique({
    where: { name: roleName },
    select: { id: true },
  });
  if (!role) return;

  const policies = await prisma.policy.findMany({
    where: { key: { in: policyKeys } },
    select: { id: true },
  });
  if (policies.length === 0) return;

  const created = await prisma.rolePolicy.createMany({
    data: policies.map((p) => ({ roleId: role.id, policyId: p.id })),
    skipDuplicates: true,
  });

  if (created.count > 0) {
    // Ensure existing sessions pick up new policies quickly
    await prisma.user.updateMany({
      where: {
        roles: {
          some: {
            roleId: role.id,
          },
        },
      },
      data: {
        policyVersion: { increment: 1 },
      },
    });
    console.log(`[Policy Sync] ✅ Added ${created.count} policies to role "${roleName}"`);
  }
}

async function ensureDefaultRolePolicies(): Promise<void> {
  // Task History is protected by attendance.history.view.
  // Other requested pages/actions:
  // - sales-staff.view (pivot)
  // - requests.view
  // - help_tickets.view
  // - help_tickets.create
  await ensureRoleHasPolicies("Employee", [
    "attendance.history.view",
    "sales-staff.view",
    "requests.view",
    "help_tickets.view",
    "help_tickets.create",
  ]);
}

async function removeRolePolicies(roleName: string, policyKeys: string[]): Promise<void> {
  const role = await prisma.role.findUnique({
    where: { name: roleName },
    select: { id: true },
  });
  if (!role) return;

  const policies = await prisma.policy.findMany({
    where: { key: { in: policyKeys } },
    select: { id: true },
  });
  if (policies.length === 0) return;

  const policyIds = policies.map((p) => p.id);
  const removed = await prisma.rolePolicy.deleteMany({
    where: { roleId: role.id, policyId: { in: policyIds } },
  });

  if (removed.count > 0) {
    await prisma.user.updateMany({
      where: { roles: { some: { roleId: role.id } } },
      data: { policyVersion: { increment: 1 } },
    });
    console.log(`[Policy Sync] 🧹 Removed ${removed.count} policies from role "${roleName}"`);
  }
}

/**
 * Initialize policy sync (called on server startup)
 */
export async function initializePolicySync(): Promise<void> {
  try {
    const result = await syncPoliciesFromNavConfig();
    
    if (result.errors.length > 0) {
      console.warn(`[Policy Sync] ⚠️  Completed with ${result.errors.length} errors`);
      result.errors.forEach(err => console.warn(`  - ${err}`));
    } else {
      console.log(`[Policy Sync] ✅ Successfully synced ${result.total} policies`);
    }

    // Keep default role policies aligned with expected access
    await ensureDefaultRolePolicies();
    // Employees should not see the /sales dashboard by default
    await removeRolePolicies("Employee", ["staff-sales.view"]);
  } catch (error: any) {
    console.error(`[Policy Sync] ❌ Fatal error during policy sync:`, error);
    throw error;
  }
}
