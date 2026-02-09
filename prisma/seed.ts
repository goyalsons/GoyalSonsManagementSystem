import { PrismaClient } from "@prisma/client";
import * as crypto from "crypto";
import { POLICY_REGISTRY } from "../shared/policies";

const prisma = new PrismaClient();

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password).digest("hex");
}

async function main() {
  const isProduction = process.env.NODE_ENV === "production";
  const allowDestructive = !isProduction || process.env.SEED_FORCE_SYNC === "1";
  console.log("Starting seed...");
  console.log(
    `[seed] NODE_ENV=${process.env.NODE_ENV ?? "undefined"} | SEED_FORCE_SYNC=${process.env.SEED_FORCE_SYNC ?? "undefined"} | destructive operations (deleteMany): ${allowDestructive ? "allowed" : "skipped (production-safe)"}`,
  );

  // ==================== EXTRACT DATA FROM EMPLOYEES ====================
  console.log("📊 Extracting units, departments, and designations from employees data...");
  
  // Get all employees with their related data
  const allEmployees = await prisma.employee.findMany({
    include: {
      orgUnit: true,
      department: true,
      designation: true,
    },
  });

  console.log(`Found ${allEmployees.length} employees in database`);

  // Extract unique org units from employees
  const orgUnitsFromEmployees = new Map<string, { id: string; name: string; code: string }>();
  allEmployees.forEach(emp => {
    if (emp.orgUnit && emp.orgUnitId) {
      orgUnitsFromEmployees.set(emp.orgUnitId, {
        id: emp.orgUnit.id,
        name: emp.orgUnit.name,
        code: emp.orgUnit.code,
      });
    }
  });

  // Extract unique departments from employees
  const departmentsFromEmployees = new Map<string, { id: string; name: string; code: string }>();
  allEmployees.forEach(emp => {
    if (emp.department && emp.departmentId) {
      departmentsFromEmployees.set(emp.departmentId, {
        id: emp.department.id,
        name: emp.department.name,
        code: emp.department.code,
      });
    }
  });

  // Extract unique designations from employees
  const designationsFromEmployees = new Map<string, { id: string; name: string; code: string }>();
  allEmployees.forEach(emp => {
    if (emp.designation && emp.designationId) {
      designationsFromEmployees.set(emp.designationId, {
        id: emp.designation.id,
        name: emp.designation.name,
        code: emp.designation.code,
      });
    }
  });

  console.log(`📦 Extracted from employees:`);
  console.log(`   - ${orgUnitsFromEmployees.size} unique org units`);
  console.log(`   - ${departmentsFromEmployees.size} unique departments`);
  console.log(`   - ${designationsFromEmployees.size} unique designations`);

  // Get existing data from database
  const existingOrgUnits = await prisma.orgUnit.findMany();
  const existingDepartmentsInitial = await prisma.department.findMany();
  const existingDesignationsInitial = await prisma.designation.findMany();

  console.log(`📋 Existing in database:`);
  console.log(`   - ${existingOrgUnits.length} org units`);
  console.log(`   - ${existingDepartmentsInitial.length} departments`);
  console.log(`   - ${existingDesignationsInitial.length} designations`);

  // Use employees data - these are the real units/departments/designations
  const finalOrgUnits = existingOrgUnits.length > 0 ? existingOrgUnits : Array.from(orgUnitsFromEmployees.values());
  const finalDepartments = existingDepartmentsInitial.length > 0 ? existingDepartmentsInitial : Array.from(departmentsFromEmployees.values());
  const finalDesignations = existingDesignationsInitial.length > 0 ? existingDesignationsInitial : Array.from(designationsFromEmployees.values());

  console.log(`✅ Using ${finalOrgUnits.length} org units, ${finalDepartments.length} departments, ${finalDesignations.length} designations from database`);

  // Use units from employees data (real data)
  const defaultOrgUnitId = finalOrgUnits[0]?.id;
  const ceoOrgUnitId = defaultOrgUnitId;
  const managementOrgUnitId = defaultOrgUnitId;
  const hrOrgUnitId = defaultOrgUnitId;
  const financeOrgUnitId = finalOrgUnits[1]?.id ?? defaultOrgUnitId;

  // Check if database already has departments - if yes, skip creation
  const existingDepartments = await prisma.department.findMany();
  const departmentsMap = new Map<string, string>();
  
  if (existingDepartments.length === 0) {
    console.log("No departments found - skipping (departments come from Zoho API or other source)");
  } else {
    console.log(`Found ${existingDepartments.length} existing departments - using real database data`);
    // Build map from existing departments for sample employee creation
    existingDepartments.forEach(dept => {
      departmentsMap.set(dept.code, dept.id);
    });
  }

  // Designations are now synced from Zoho API - no need to create default ones
  // The auto-sync process creates designations based on DESIGNATION.DESIGN_CODE from API
  console.log("Skipping designation creation - designations are synced from Zoho API");

  // ==================== SEED ROLES AND POLICIES ====================
  console.log("🌱 Seeding Roles and Policies...");

  // Create Policies from shared registry (single source of truth)
  const policies = POLICY_REGISTRY;

  // Remove any policies not in the allowlist (skipped in production unless SEED_FORCE_SYNC=1)
  const allowedPolicyKeys = policies.map((policy) => policy.key);
  const disallowedPolicies = await prisma.policy.findMany({
    where: { key: { notIn: allowedPolicyKeys } },
    select: { id: true },
  });
  if (disallowedPolicies.length > 0) {
    if (allowDestructive) {
      const disallowedIds = disallowedPolicies.map((policy) => policy.id);
      await prisma.$transaction([
        prisma.rolePolicy.deleteMany({ where: { policyId: { in: disallowedIds } } }),
        prisma.policy.deleteMany({ where: { id: { in: disallowedIds } } }),
      ]);
      console.log(`[seed] Removed ${disallowedPolicies.length} disallowed policies (destructive allowed).`);
    } else {
      console.log(`[seed] Skipping removal of ${disallowedPolicies.length} disallowed policies (production-safe).`);
    }
  }

  // Create policies (canonical set)
  const createdPolicies: Record<string, any> = {};
  for (const policy of policies) {
    const created = await prisma.policy.upsert({
      where: { key: policy.key },
      update: {
        description: policy.description,
        category: policy.category,
        isActive: true, // Ensure all canonical policies are active
      },
      create: {
        ...policy,
        isActive: true,
      },
    });
    createdPolicies[policy.key] = created;
  }

  console.log(`✅ Created/Updated ${Object.keys(createdPolicies).length} canonical policies`);

  // Create Roles - Policies are the only source of access
  const defaultPolicies: string[] = [];
  const employeeDefaultPolicies: string[] = [];
  const allPolicyKeys = Object.keys(createdPolicies);
  // HR: dashboard, members, attendance, roles, settings, requests
  const hrPolicyKeys = allPolicyKeys.filter(
    (k) =>
      k.startsWith("dashboard.") ||
      k.startsWith("employees.") ||
      k.startsWith("attendance.") ||
      k.startsWith("roles-assigned.") ||
      k.startsWith("settings.") ||
      k.startsWith("requests.") ||
      k === "no_policy.view" ||
      k === "VIEW_USERS" ||
      k === "VIEW_ROLES" ||
      k === "VIEW_POLICIES"
  );

  const roles = [
    {
      name: "Director",
      description: "Top management with full system access",
      policies: allPolicyKeys,
    },
    {
      name: "Employee",
      description: "Default role for all employees",
      policies: employeeDefaultPolicies,
    },
    {
      name: "MDO",
      description: "Management Development Officer",
      policies: defaultPolicies,
    },
    {
      name: "DME",
      description: "Department Manager/Executive",
      policies: defaultPolicies,
    },
    {
      name: "HR",
      description: "Human Resources",
      policies: hrPolicyKeys,
    },
    {
      name: "Manager",
      description: "Team/people manager with limited admin",
      policies: defaultPolicies,
    },
    {
      name: "Store Manager",
      description: "Store operations management",
      policies: defaultPolicies,
    },
    {
      name: "Floor Manager",
      description: "Floor operations management",
      policies: defaultPolicies,
    },
    {
      name: "Purchaser",
      description: "Purchase operations",
      policies: defaultPolicies,
    },
    {
      name: "SalesMan",
      description: "Sales staff - View sales and attendance",
      policies: defaultPolicies,
    },
  ];

  const allowedRoleNames = roles.map((role) => role.name);

  // Remove any roles that are not in the allowed list (skipped in production unless SEED_FORCE_SYNC=1)
  if (allowDestructive) {
    await prisma.userRole.deleteMany({
      where: { role: { name: { notIn: allowedRoleNames } } },
    });
    await prisma.rolePolicy.deleteMany({
      where: { role: { name: { notIn: allowedRoleNames } } },
    });
    await prisma.role.deleteMany({
      where: { name: { notIn: allowedRoleNames } },
    });
    console.log("[seed] Removed roles/policies not in allowlist (destructive allowed).");
  } else {
    console.log("[seed] Skipping role/policy/userRole deleteMany (production-safe).");
  }

  const rolesByName = new Map<string, { id: string; name: string }>();

  // Create roles; assign default policies only if role has no policies yet (preserve UI changes)
  for (const roleData of roles) {
    const { policies: policyKeys, ...roleInfo } = roleData;
    
    const role = await prisma.role.upsert({
      where: { name: roleData.name },
      update: {
        description: roleData.description,
      },
      create: roleInfo,
    });
    rolesByName.set(role.name, role);

    const existingCount = await prisma.rolePolicy.count({
      where: { roleId: role.id },
    });

    if (existingCount > 0) {
      console.log(`✅ Role "${role.name}" already has ${existingCount} policies – skipping (preserve UI changes)`);
      continue;
    }

    if (policyKeys && policyKeys.length > 0) {
      const rolePolicies = policyKeys
        .map((key) => createdPolicies[key])
        .filter(Boolean)
        .map((policy) => ({
          roleId: role.id,
          policyId: policy.id,
        }));

      if (rolePolicies.length > 0) {
        await prisma.rolePolicy.createMany({
          data: rolePolicies,
        });
      }
    }

    console.log(`✅ Created/Updated role: ${role.name} with ${policyKeys?.length || 0} policies (initial seed)`);
  }

  console.log("✅ Roles and Policies seeded successfully!");

  const employeeRole = rolesByName.get("Employee");
  if (employeeRole) {
    const employeeUsers = await prisma.user.findMany({
      where: { employeeId: { not: null } },
      select: { id: true },
    });

    if (employeeUsers.length > 0) {
      await prisma.userRole.createMany({
        data: employeeUsers.map((user) => ({
          userId: user.id,
          roleId: employeeRole.id,
        })),
        skipDuplicates: true,
      });
    }
  }

  let taskCreatorId: string | undefined;
  const allowedEmails = (process.env.ALLOWED_GOOGLE_EMAILS || "")
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);

  if (allowedEmails.length === 0) {
    console.log("No ALLOWED_GOOGLE_EMAILS configured - skipping user creation");
  } else {
    const directorEmail = allowedEmails[0];
    const defaultRole = rolesByName.get("SalesMan");
    const directorRole = rolesByName.get("Director");

    const roleOrder = [
      "Director",
      "MDO",
      "DME",
      "HR",
      "Store Manager",
      "Floor Manager",
      "Purchaser",
      "SalesMan",
    ];

    const getRoleForEmail = (email: string, index: number) => {
      if (email.toLowerCase() === directorEmail.toLowerCase()) {
        return directorRole || defaultRole;
      }
      const roleName = roleOrder[Math.min(index, roleOrder.length - 1)];
      return rolesByName.get(roleName) || defaultRole;
    };

    const makeDisplayName = (email: string) =>
      email
        .split("@")[0]
        .split(/[._-]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");

    // Optional fixed passwords (per email) via env:
    //   ALLOWED_EMAIL_PASSWORDS="user1@example.com=pass1,user2@example.com=pass2"
    // Aliases supported: ALLOWED_PASSWORD, ALLOWED_PASSWORDS
    const parseEmailPasswordMap = (raw: string | undefined): Map<string, string> => {
      const map = new Map<string, string>();
      (raw || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((pair) => {
          const idx = pair.indexOf("=");
          if (idx <= 0) return;
          const email = pair.slice(0, idx).trim().toLowerCase();
          const password = pair.slice(idx + 1).trim();
          if (!email || !password) return;
          map.set(email, password);
        });
      return map;
    };

    const allowedEmailPasswords = parseEmailPasswordMap(
      process.env.ALLOWED_EMAIL_PASSWORDS || process.env.ALLOWED_PASSWORDS || process.env.ALLOWED_PASSWORD,
    );

    const makePassword = (email: string) =>
      allowedEmailPasswords.get(email.toLowerCase()) ??
      `Gms@${crypto.createHash("sha256").update(email).digest("hex").slice(0, 8)}`;

    const seededUsers: Array<{ id: string; email: string; password: string; role?: string }> = [];

    for (const [index, email] of allowedEmails.entries()) {
      const role = getRoleForEmail(email, index);
      const password = makePassword(email);

      const displayName = makeDisplayName(email);
      
      // Don't create fake employees - employees come from Zoho API only
      // Just find if there's already a linked employee by email
      const existingEmployee = await prisma.employee.findFirst({
        where: {
          OR: [
            { companyEmail: email },
            { personalEmail: email },
          ],
        },
        select: { id: true },
      });

      const user = await prisma.user.upsert({
        where: { email },
        update: {
          name: displayName,
          passwordHash: hashPassword(password),
          status: "active",
          employeeId: existingEmployee?.id || null,
        },
        create: {
          name: displayName,
          email,
          passwordHash: hashPassword(password),
          status: "active",
          orgUnitId: managementOrgUnitId ?? undefined,
          employeeId: existingEmployee?.id || null,
        },
      });

      if (role) {
        await prisma.userRole.upsert({
          where: { userId_roleId: { userId: user.id, roleId: role.id } },
          update: {},
          create: { userId: user.id, roleId: role.id },
        });
      }

      seededUsers.push({ id: user.id, email, password, role: role?.name });
    }

    taskCreatorId = seededUsers[0]?.id;

    console.log("\nSeeded Users (from ALLOWED_GOOGLE_EMAILS):");
    seededUsers.forEach((user) => {
      const roleLabel = user.role ? ` [${user.role}]` : "";
      console.log(`${user.email}${roleLabel} / ${user.password}`);
    });
  }

  console.log("Skipping sample employee creation - users are seeded from ALLOWED_GOOGLE_EMAILS");

  const taskEmployees = await prisma.employee.findMany();
  const taskTitles = [
    "Review quarterly reports",
    "Update employee handbook",
    "Conduct team meeting",
    "Prepare budget proposal",
    "Complete compliance training",
    "Update website content",
    "Process pending invoices",
    "Schedule performance reviews",
    "Organize team building event",
    "Review vendor contracts",
  ];

  if (taskEmployees.length === 0 || !taskCreatorId) {
    console.log("Skipping task creation - no employees or no creator available");
  } else {
    for (let i = 0; i < 24; i++) {
      const randomEmployee = taskEmployees[Math.floor(Math.random() * taskEmployees.length)];
      const randomTitle = taskTitles[Math.floor(Math.random() * taskTitles.length)];
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + Math.floor(Math.random() * 14));

      await prisma.task.create({
        data: {
          title: `${randomTitle} - ${i + 1}`,
          description: `Task description for ${randomTitle}`,
          assigneeId: randomEmployee.id,
          creatorId: taskCreatorId,
          status: Math.random() > 0.5 ? "open" : "in_progress",
          priority: ["low", "medium", "high"][Math.floor(Math.random() * 3)],
          dueDate: dueDate,
        },
      });
    }

    console.log("Created tasks");
  }

  console.log("Seed completed successfully!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
