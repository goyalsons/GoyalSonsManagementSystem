/**
 * Role templates: predefined policy sets from page-level intent (OPTION B).
 * Templates expand to granular keys via getAllKeysForPage; backend still stores granular policies.
 */

import { getAllKeysForPage } from "./page-permissions";
import { POLICY_KEYS_FLAT } from "@shared/policies";

function getAllTemplatePolicyKeys(): string[] {
  return [...POLICY_KEYS_FLAT];
}

export interface RoleTemplate {
  id: string;
  name: string;
  description: string;
  policyKeys: string[];
}

/** Employee: Dashboard(view), Attendance(view), Sales(view), Requests(view only), Help Tickets(view+create), Employees & Team(view). */
function employeePolicyKeys(): string[] {
  const keys: string[] = [];
  keys.push(...getAllKeysForPage("dashboard", "view"));
  keys.push(...getAllKeysForPage("attendance", "view"));
  keys.push(...getAllKeysForPage("sales", "view"));
  keys.push(...getAllKeysForPage("requests", "view"));
  keys.push(...getAllKeysForPage("help_tickets", "view"), "help_tickets.create"); // view + create only (safest for employee)
  keys.push(...getAllKeysForPage("employees_team", "view"));
  keys.push("settings.view", "no_policy.view");
  return keys;
}

/** Manager: Employee base + Attendance(manage), Sales(manage), Requests(manage). */
function managerPolicyKeys(): string[] {
  const keys = employeePolicyKeys();
  const toAdd = [
    ...getAllKeysForPage("attendance", "manage"),
    ...getAllKeysForPage("sales", "manage"),
    ...getAllKeysForPage("requests", "manage"),
  ];
  const set = new Set(keys);
  toAdd.forEach((k) => set.add(k));
  return [...set];
}

/** Admin: Manager + Users(manage), Roles & Policies(manage), Admin & System(view+manage), Trainings(manage), Audit(view). */
function adminPolicyKeys(): string[] {
  const keys = managerPolicyKeys();
  const toAdd = [
    ...getAllKeysForPage("users", "manage"),
    ...getAllKeysForPage("roles_policies", "manage"),
    ...getAllKeysForPage("admin_system", "manage"),
    ...getAllKeysForPage("training", "manage"),
    ...getAllKeysForPage("audit", "view"),
  ];
  const set = new Set(keys);
  toAdd.forEach((k) => set.add(k));
  return [...set];
}

export const ROLE_TEMPLATES: RoleTemplate[] = [
  {
    id: "employee",
    name: "Employee",
    description: "Dashboard(view), Attendance(view), Sales(view), Requests(view), Help Tickets(view+create), Employees & Team(view)",
    policyKeys: employeePolicyKeys(),
  },
  {
    id: "manager",
    name: "Manager",
    description: "Employee + Attendance(manage), Sales(manage), Requests(manage)",
    policyKeys: managerPolicyKeys(),
  },
  {
    id: "admin",
    name: "Admin",
    description: "Manager + Users(manage), Roles & Policies(manage), Admin & System(manage), Trainings(manage), Audit(view)",
    policyKeys: adminPolicyKeys(),
  },
  {
    id: "director",
    name: "Director",
    description: "Full access to all features (system role; policies are immutable on backend)",
    policyKeys: getAllTemplatePolicyKeys(),
  },
];

/**
 * Resolve template policy keys to policy IDs using the API policy list.
 */
export function templateKeysToPolicyIds(
  policyKeys: string[],
  policiesFromApi: Array<{ id: string; key: string }>
): string[] {
  const keyToId = new Map(policiesFromApi.map((p) => [p.key, p.id]));
  return policyKeys.map((k) => keyToId.get(k)).filter((id): id is string => !!id);
}
