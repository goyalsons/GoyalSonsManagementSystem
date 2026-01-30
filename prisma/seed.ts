import { PrismaClient } from "@prisma/client";
import * as crypto from "crypto";

const prisma = new PrismaClient();

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password).digest("hex");
}

async function main() {
  console.log("Starting seed...");

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
    console.log("No departments found - creating default departments...");
    // Only create if database is empty - these are fallback defaults
    const departmentRecords = [
      { code: "IT", name: "IT" },
      { code: "MKT", name: "Marketing" },
      { code: "OPS", name: "Operations" },
      { code: "FIN", name: "Finance" },
      { code: "HR", name: "HR" },
    ];

    for (const dept of departmentRecords) {
      const record = await prisma.department.upsert({
        where: { code: dept.code },
        update: {},
        create: { code: dept.code, name: dept.name },
      });
      departmentsMap.set(dept.code, record.id);
    }
    console.log("Created default departments");
  } else {
    console.log(`Found ${existingDepartments.length} existing departments - using real database data`);
    // Build map from existing departments for sample employee creation
    existingDepartments.forEach(dept => {
      departmentsMap.set(dept.code, dept.id);
    });
  }

  // Check if database already has designations - if yes, skip creation
  const existingDesignations = await prisma.designation.findMany();
  let staffDesignation;
  
  if (existingDesignations.length === 0) {
    console.log("No designations found - creating default designation...");
    // Only create if database is empty
    staffDesignation = await prisma.designation.upsert({
      where: { code: "STAFF" },
      update: {},
      create: { code: "STAFF", name: "Staff" },
    });
    console.log("Created default designation");
  } else {
    console.log(`Found ${existingDesignations.length} existing designations - using real database data`);
    // Use first existing designation for sample employee creation
    staffDesignation = existingDesignations[0];
  }

  // ==================== SEED ROLES AND POLICIES ====================
  console.log("🌱 Seeding Roles and Policies...");

  // Create Policies based on the locked allowlist
  const policies = [
    { key: "dashboard.view", description: "Access dashboard", category: "dashboard" },
    { key: "roles-assigned.view", description: "Access roles assigned page", category: "roles" },
    { key: "employees.view", description: "Access employees page", category: "employees" },
    { key: "attendance.history.view", description: "Access attendance history", category: "attendance" },
    { key: "attendance.self.view", description: "View own attendance", category: "attendance" },
    { key: "attendance.team.view", description: "View team attendance", category: "attendance" },
    { key: "attendance.worklog.view", description: "View attendance worklog", category: "attendance" },
    { key: "sales.view", description: "Access sales page", category: "sales" },
    { key: "sales.self.view", description: "View own sales", category: "sales" },
    { key: "sales.staff.view", description: "View staff sales", category: "sales" },
    { key: "sales.dashboard.view", description: "Access sales dashboard", category: "sales" },
    { key: "sales.store.view", description: "View store sales", category: "sales" },
    { key: "sales-staff.view", description: "Access sales staff page", category: "sales" },
    { key: "admin.panel", description: "Access admin panel", category: "admin" },
    { key: "admin.routing.view", description: "Access API routing", category: "admin" },
    { key: "admin.master-settings.view", description: "Access master settings", category: "admin" },
    { key: "integrations.fetched-data.view", description: "Access fetched data", category: "integrations" },
    { key: "trainings.view", description: "Access trainings", category: "training" },
    { key: "requests.view", description: "Access requests", category: "requests" },
    { key: "salary.view", description: "Access salary", category: "salary" },
    { key: "settings.view", description: "Access settings", category: "settings" },
    { key: "assigned-manager.view", description: "Access assigned manager", category: "manager" },
    { key: "help_tickets.view", description: "View help tickets", category: "help_tickets" },
    { key: "help_tickets.create", description: "Create help tickets", category: "help_tickets" },
    { key: "help_tickets.update", description: "Update help tickets", category: "help_tickets" },
    { key: "help_tickets.assign", description: "Assign help tickets", category: "help_tickets" },
    { key: "help_tickets.close", description: "Close help tickets", category: "help_tickets" },
    { key: "no_policy.view", description: "Access no policy page", category: "system" },
  ];

  // Remove any policies not in the allowlist
  const allowedPolicyKeys = policies.map((policy) => policy.key);
  const disallowedPolicies = await prisma.policy.findMany({
    where: { key: { notIn: allowedPolicyKeys } },
    select: { id: true },
  });
  if (disallowedPolicies.length > 0) {
    const disallowedIds = disallowedPolicies.map((policy) => policy.id);
    await prisma.$transaction([
      prisma.rolePolicy.deleteMany({ where: { policyId: { in: disallowedIds } } }),
      prisma.policy.deleteMany({ where: { id: { in: disallowedIds } } }),
    ]);
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
  const defaultPolicies = ["attendance.history.view", "sales.view"];
  const employeeDefaultPolicies = [
    "attendance.history.view",
    "requests.view",
    "help_tickets.view",
    "help_tickets.create",
  ];
  const allPolicyKeys = Object.keys(createdPolicies);

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

  // Remove any roles that are not in the allowed list
  await prisma.userRole.deleteMany({
    where: { role: { name: { notIn: allowedRoleNames } } },
  });
  await prisma.rolePolicy.deleteMany({
    where: { role: { name: { notIn: allowedRoleNames } } },
  });
  await prisma.role.deleteMany({
    where: { name: { notIn: allowedRoleNames } },
  });

  const rolesByName = new Map<string, { id: string; name: string }>();

  // Create roles with policies
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

    // Delete existing role policies
    await prisma.rolePolicy.deleteMany({
      where: { roleId: role.id },
    });

    // Assign policies to role
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

    console.log(`✅ Created/Updated role: ${role.name} with ${policyKeys?.length || 0} policies`);
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

    const getDepartmentIdForRole = (roleName?: string) => {
      if (!roleName) return departmentsMap.values().next().value;
      if (roleName === "HR") return departmentsMap.get("HR");
      if (roleName === "Purchaser") return departmentsMap.get("FIN");
      if (roleName === "Store Manager" || roleName === "Floor Manager") return departmentsMap.get("OPS");
      if (roleName === "SalesMan") return departmentsMap.get("MKT");
      return departmentsMap.values().next().value;
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
      const existingEmployee = await prisma.employee.findFirst({
        where: {
          OR: [
            { companyEmail: email },
            { personalEmail: email },
            { externalId: email },
          ],
        },
        select: { id: true },
      });

      const departmentId = getDepartmentIdForRole(role?.name) ?? undefined;
      const employee = existingEmployee
        ? await prisma.employee.update({
            where: { id: existingEmployee.id },
            data: {
              firstName: displayName.split(" ")[0],
              lastName: displayName.split(" ").slice(1).join(" ") || null,
              companyEmail: email,
              externalId: email,
              departmentId,
              designationId: staffDesignation.id,
              orgUnitId: managementOrgUnitId ?? defaultOrgUnitId ?? undefined,
            },
          })
        : await prisma.employee.create({
            data: {
              firstName: displayName.split(" ")[0],
              lastName: displayName.split(" ").slice(1).join(" ") || null,
              employeeCode: email.split("@")[0].toUpperCase(),
              companyEmail: email,
              externalId: email,
              departmentId,
              designationId: staffDesignation.id,
              orgUnitId: managementOrgUnitId ?? defaultOrgUnitId ?? undefined,
              status: "ACTIVE",
            },
          });

      const user = await prisma.user.upsert({
        where: { email },
        update: {
          name: displayName,
          passwordHash: hashPassword(password),
          status: "active",
          employeeId: employee.id,
        },
        create: {
          name: displayName,
          email,
          passwordHash: hashPassword(password),
          status: "active",
          orgUnitId: managementOrgUnitId ?? undefined,
          employeeId: employee.id,
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
