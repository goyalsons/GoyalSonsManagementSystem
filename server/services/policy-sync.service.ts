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
    policy: "roles.assigned.view" 
  },
  { 
    key: "members", 
    label: "Members", 
    path: "/employees", 
    policy: "members.view" 
  },
  { 
    key: "tasks-history", 
    label: "Task History", 
    path: "/attendance/history", 
    policy: "tasks.history.view" 
  },
  { 
    key: "sales", 
    label: "Sales", 
    path: "/sales", 
    policy: "sales.view" 
  },
  { 
    key: "sales-staff", 
    label: "Sales Staff", 
    path: "/sales-staff", 
    policy: "sales.staff.view" 
  },
  { 
    key: "integrations", 
    label: "Integrations", 
    path: "/integrations", 
    policy: "integrations.view" 
  },
  { 
    key: "api-settings", 
    label: "API Setting", 
    path: "/admin/routing", 
    policy: "api.settings.view" 
  },
  { 
    key: "masters-settings", 
    label: "Masters Settings", 
    path: "/admin/master-settings", 
    policy: "masters.settings.view" 
  },
  { 
    key: "fetched-data", 
    label: "Fetched Data", 
    path: "/integrations/fetched-data", 
    policy: "fetched.data.view" 
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
    policy: "manager.assigned.view" 
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
 * 3. Creates missing policies
 * 4. Never deletes existing policies (immutable)
 */
export async function syncPoliciesFromNavConfig(): Promise<{
  total: number;
  created: number;
  existing: number;
  errors: string[];
}> {
  const policies = getAllPoliciesFromNavConfig();
  const result = {
    total: policies.length,
    created: 0,
    existing: 0,
    errors: [] as string[]
  };

  console.log(`[Policy Sync] Starting sync of ${policies.length} policies from NAV_CONFIG...`);

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

  console.log(`[Policy Sync] Complete: ${result.created} created, ${result.existing} existing, ${result.errors.length} errors`);
  
  return result;
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
  } catch (error: any) {
    console.error(`[Policy Sync] ❌ Fatal error during policy sync:`, error);
    throw error;
  }
}
