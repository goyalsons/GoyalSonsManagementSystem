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
  const existingDepartments = await prisma.department.findMany();
  const existingDesignations = await prisma.designation.findMany();

  console.log(`📋 Existing in database:`);
  console.log(`   - ${existingOrgUnits.length} org units`);
  console.log(`   - ${existingDepartments.length} departments`);
  console.log(`   - ${existingDesignations.length} designations`);

  // Use employees data - these are the real units/departments/designations
  const finalOrgUnits = existingOrgUnits.length > 0 ? existingOrgUnits : Array.from(orgUnitsFromEmployees.values());
  const finalDepartments = existingDepartments.length > 0 ? existingDepartments : Array.from(departmentsFromEmployees.values());
  const finalDesignations = existingDesignations.length > 0 ? existingDesignations : Array.from(designationsFromEmployees.values());

  console.log(`✅ Using ${finalOrgUnits.length} org units, ${finalDepartments.length} departments, ${finalDesignations.length} designations from database`);

  // Use units from employees data (real data)
  const ceoUnit = finalOrgUnits.length > 0 ? finalOrgUnits[0] : null;
  const managementUnit = finalOrgUnits.length > 0 ? finalOrgUnits[0] : null;
  const hrUnit = finalOrgUnits.length > 0 ? finalOrgUnits[0] : null;
  const financeUnit = finalOrgUnits.length > 1 ? finalOrgUnits[1] : finalOrgUnits[0] || null;
  const itUnit = finalOrgUnits.length > 2 ? finalOrgUnits[2] : finalOrgUnits[0] || null;
  const marketingUnit = finalOrgUnits.length > 3 ? finalOrgUnits[3] : finalOrgUnits[0] || null;
  const operationsUnit = finalOrgUnits.length > 4 ? finalOrgUnits[4] : finalOrgUnits[0] || null;

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

  // Create Policies
  const policies = [
    // Users Management
    { key: "users.view", description: "View users", category: "users" },
    { key: "users.create", description: "Create users", category: "users" },
    { key: "users.edit", description: "Edit users", category: "users" },
    { key: "users.delete", description: "Delete users", category: "users" },
    { key: "users.assign_role", description: "Assign roles to users", category: "users" },

    // Employees Management
    { key: "employees.view", description: "View employees", category: "employees" },
    { key: "employees.create", description: "Create employees", category: "employees" },
    { key: "employees.edit", description: "Edit employees", category: "employees" },
    { key: "employees.delete", description: "Delete employees", category: "employees" },
    { key: "employees.export", description: "Export employee data", category: "employees" },

    // Attendance (from routes: /api/attendance, /api/attendance/checkin, /api/attendance/today)
    { key: "attendance.view", description: "View attendance", category: "attendance" },
    { key: "attendance.create", description: "Check in/out and create attendance records", category: "attendance" },
    { key: "attendance.manage", description: "Manage attendance records", category: "attendance" },
    { key: "attendance.approve", description: "Approve attendance corrections", category: "attendance" },
    { key: "attendance.fill", description: "Fill attendance for others", category: "attendance" },

    // Tasks (from routes: /api/tasks)
    { key: "tasks.view", description: "View tasks", category: "tasks" },
    { key: "tasks.create", description: "Create tasks", category: "tasks" },
    { key: "tasks.edit", description: "Edit tasks", category: "tasks" },
    { key: "tasks.delete", description: "Delete tasks", category: "tasks" },
    { key: "tasks.assign", description: "Assign tasks to others", category: "tasks" },
    { key: "tasks.view_team", description: "View team tasks", category: "tasks" },

    // Claims (from routes: /api/claims)
    { key: "claims.view", description: "View claims", category: "claims" },
    { key: "claims.create", description: "Create claims", category: "claims" },
    { key: "claims.edit", description: "Edit claims", category: "claims" },
    { key: "claims.delete", description: "Delete claims", category: "claims" },
    { key: "claims.approve", description: "Approve claims", category: "claims" },
    { key: "claims.reject", description: "Reject claims", category: "claims" },
    { key: "claims.view_team", description: "View team claims", category: "claims" },

    // Help Tickets (from routes: /api/help-tickets)
    { key: "help_tickets.view", description: "View help tickets", category: "help_tickets" },
    { key: "help_tickets.create", description: "Create help tickets", category: "help_tickets" },
    { key: "help_tickets.edit", description: "Edit help tickets", category: "help_tickets" },
    { key: "help_tickets.resolve", description: "Resolve help tickets", category: "help_tickets" },
    { key: "help_tickets.view_team", description: "View team help tickets", category: "help_tickets" },

    // Announcements (from routes: /api/announcements)
    { key: "announcements.view", description: "View announcements", category: "announcements" },
    { key: "announcements.create", description: "Create announcements", category: "announcements" },
    { key: "announcements.edit", description: "Edit announcements", category: "announcements" },
    { key: "announcements.delete", description: "Delete announcements", category: "announcements" },

    // Targets (from routes: /api/targets)
    { key: "targets.view", description: "View targets", category: "targets" },
    { key: "targets.create", description: "Create targets", category: "targets" },
    { key: "targets.edit", description: "Edit targets", category: "targets" },
    { key: "targets.delete", description: "Delete targets", category: "targets" },
    { key: "targets.view_team", description: "View team targets", category: "targets" },

    // Sales (from routes: /api/sales, /api/sales/dashboard, /api/sales/staff)
    { key: "sales.view", description: "View sales data", category: "sales" },
    { key: "sales.manage", description: "Manage sales data", category: "sales" },
    { key: "sales.export", description: "Export sales data", category: "sales" },

    // Store/Inventory
    { key: "store.view", description: "View store/inventory", category: "store" },
    { key: "store.manage", description: "Manage store/inventory", category: "store" },
    
    // Purchase
    { key: "purchase.view", description: "View purchase data", category: "purchase" },
    { key: "purchase.create", description: "Create purchase requests", category: "purchase" },
    { key: "purchase.edit", description: "Edit purchase requests", category: "purchase" },
    { key: "purchase.approve", description: "Approve purchases", category: "purchase" },
    { key: "purchase.reject", description: "Reject purchase requests", category: "purchase" },

    // Admin (from routes: /api/admin/*, /api/roles, /api/policies)
    { key: "admin.roles", description: "Manage roles and permissions", category: "admin" },
    { key: "admin.panel", description: "Access admin panel and integrations (API Routing, Master Settings, Data Fetcher)", category: "admin" },
    { key: "admin.settings", description: "Access system settings", category: "admin" },
    { key: "admin.sync", description: "Manage data sync", category: "admin" },
    { key: "admin.audit", description: "View audit logs", category: "admin" },
    { key: "admin.org_units", description: "Manage organizational units", category: "admin" },
    { key: "admin.reports", description: "Access all reports", category: "admin" },
  ];

  // Create policies
  const createdPolicies: Record<string, any> = {};
  for (const policy of policies) {
    const created = await prisma.policy.upsert({
      where: { key: policy.key },
      update: {},
      create: policy,
    });
    createdPolicies[policy.key] = created;
  }

  console.log(`✅ Created ${Object.keys(createdPolicies).length} policies`);

  // Create Roles - Sabko default SalesMan wala access (attendance.view, sales.view)
  const defaultPolicies = ["attendance.view", "sales.view"];

  const roles = [
    {
      name: "Director",
      description: "Top management with full system access",
      level: 100,
      policies: defaultPolicies, // Default: SalesMan access
    },
    {
      name: "MDO",
      description: "Management Development Officer",
      level: 90,
      policies: defaultPolicies,
    },
    {
      name: "DME",
      description: "Department Manager/Executive",
      level: 80,
      policies: defaultPolicies,
    },
    {
      name: "HR",
      description: "Human Resources",
      level: 70,
      policies: defaultPolicies,
    },
    {
      name: "Store Manager",
      description: "Store operations management",
      level: 60,
      policies: defaultPolicies,
    },
    {
      name: "Floor Manager",
      description: "Floor operations management",
      level: 50,
      policies: defaultPolicies,
    },
    {
      name: "Purchaser",
      description: "Purchase operations",
      level: 40,
      policies: defaultPolicies,
    },
    {
      name: "SalesMan",
      description: "Sales staff - View sales and attendance",
      level: 30,
      policies: defaultPolicies,
    },
  ];

  // Create roles with policies
  for (const roleData of roles) {
    const { policies: policyKeys, ...roleInfo } = roleData;
    
    const role = await prisma.role.upsert({
      where: { name: roleData.name },
      update: {
        description: roleData.description,
        level: roleData.level,
      },
      create: roleInfo,
    });

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

  const ceoUser = await prisma.user.upsert({
    where: { email: "ceo@goyalsons.com" },
    update: {},
    create: {
      name: "Rajesh Goyal",
      email: "ceo@goyalsons.com",
      passwordHash: hashPassword("ceo123"),
      status: "active",
      isSuperAdmin: true,
      orgUnitId: ceoUnit.id,
    },
  });

  // UserRole assignments removed - Role tables deleted
  // await prisma.userRole.upsert({...});

  const managerUser = await prisma.user.upsert({
    where: { email: "manager@goyalsons.com" },
    update: {},
    create: {
      name: "Priya Sharma",
      email: "manager@goyalsons.com",
      passwordHash: hashPassword("manager123"),
      status: "active",
      isSuperAdmin: false,
      orgUnitId: managementUnit.id,
    },
  });

  // UserRole assignments removed - Role tables deleted
  // await prisma.userRole.upsert({...});

  const hrUser = await prisma.user.upsert({
    where: { email: "hr@goyalsons.com" },
    update: {},
    create: {
      name: "Amit Kumar",
      email: "hr@goyalsons.com",
      passwordHash: hashPassword("hr123"),
      status: "active",
      isSuperAdmin: false,
      orgUnitId: hrUnit.id,
    },
  });

  // UserRole assignments removed - Role tables deleted
  // await prisma.userRole.upsert({...});

  const financeUser = await prisma.user.upsert({
    where: { email: "finance@goyalsons.com" },
    update: {},
    create: {
      name: "Sunita Patel",
      email: "finance@goyalsons.com",
      passwordHash: hashPassword("finance123"),
      status: "active",
      isSuperAdmin: false,
      orgUnitId: financeUnit.id,
    },
  });

  // UserRole assignments removed - Role tables deleted
  // await prisma.userRole.upsert({...});

  const hrEmployee = await prisma.employee.upsert({
    where: { employeeCode: "EMP001" },
    update: {},
    create: {
      firstName: "Vikram",
      lastName: "Singh",
      employeeCode: "EMP001",
      departmentId: departmentsMap.get("HR"),
      designationId: staffDesignation.id,
      phone: "+91-9876543210",
      joiningDate: new Date("2023-01-15"),
      orgUnitId: hrUnit.id,
    },
  });

  const employeeUser = await prisma.user.upsert({
    where: { email: "vikram@goyalsons.com" },
    update: {},
    create: {
      name: "Vikram Singh",
      email: "vikram@goyalsons.com",
      passwordHash: hashPassword("employee123"),
      status: "active",
      isSuperAdmin: false,
      orgUnitId: hrUnit.id,
      employeeId: hrEmployee.id,
    },
  });

  // UserRole assignments removed - Role tables deleted
  // await prisma.userRole.upsert({...});

  // Only create sample employees if we have real data from employees
  if (finalOrgUnits.length > 0 && finalDepartments.length > 0 && staffDesignation) {
    let empCounter = 2;
    const deptList = finalDepartments.slice(0, 5); // Use first 5 departments from real data
    
    for (const dept of deptList) {
      for (let i = 0; i < 5; i++) {
        const empCode = `EMP${String(empCounter).padStart(3, "0")}`;
        await prisma.employee.upsert({
          where: { employeeCode: empCode },
          update: {},
          create: {
            firstName: `Employee${empCounter}`,
            lastName: dept.name,
            employeeCode: empCode,
            departmentId: dept.id,
            designationId: staffDesignation.id,
            phone: `+91-98765${String(empCounter).padStart(5, "0")}`,
            joiningDate: new Date(`2023-0${Math.min(i + 1, 9)}-${Math.min((i + 1) * 5, 28)}`),
            orgUnitId: hrUnit?.id || finalOrgUnits[0]?.id || null,
          },
        });
        empCounter++;
      }
    }
    console.log("Created sample employees using real data");
  } else {
    console.log("Skipping sample employee creation - using existing employees data");
  }

  console.log("Created sample employees");

  const allEmployees = await prisma.employee.findMany();
  const today = new Date();
  
  for (const employee of allEmployees) {
    for (let d = 0; d < 7; d++) {
      const date = new Date(today);
      date.setDate(date.getDate() - d);
      date.setHours(0, 0, 0, 0);

      const isWeekend = date.getDay() === 0 || date.getDay() === 6;
      if (isWeekend) continue;

      const isPresent = Math.random() > 0.1;
      const checkInHour = 8 + Math.floor(Math.random() * 2);
      const checkInMinute = Math.floor(Math.random() * 60);
      const checkOutHour = 17 + Math.floor(Math.random() * 2);
      const checkOutMinute = Math.floor(Math.random() * 60);

      const checkInAt = new Date(date);
      checkInAt.setHours(checkInHour, checkInMinute, 0, 0);

      const checkOutAt = new Date(date);
      checkOutAt.setHours(checkOutHour, checkOutMinute, 0, 0);

      await prisma.attendance.create({
        data: {
          employeeId: employee.id,
          date: date,
          checkInAt: isPresent ? checkInAt : null,
          checkOutAt: isPresent ? checkOutAt : null,
          status: isPresent ? (checkInHour > 9 ? "late" : "present") : "absent",
        },
      });
    }
  }

  console.log("Created attendance records");

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

  for (let i = 0; i < 24; i++) {
    const randomEmployee = allEmployees[Math.floor(Math.random() * allEmployees.length)];
    const randomTitle = taskTitles[Math.floor(Math.random() * taskTitles.length)];
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + Math.floor(Math.random() * 14));

    await prisma.task.create({
      data: {
        title: `${randomTitle} - ${i + 1}`,
        description: `Task description for ${randomTitle}`,
        assigneeId: randomEmployee.id,
        creatorId: ceoUser.id,
        status: Math.random() > 0.5 ? "open" : "in_progress",
        priority: ["low", "medium", "high"][Math.floor(Math.random() * 3)],
        dueDate: dueDate,
      },
    });
  }

  console.log("Created tasks");

  console.log("Seed completed successfully!");
  console.log("\nTest Users:");
  console.log("CEO: ceo@goyalsons.com / ceo123");
  console.log("Manager: manager@goyalsons.com / manager123");
  console.log("HR: hr@goyalsons.com / hr123");
  console.log("Finance: finance@goyalsons.com / finance123");
  console.log("Employee: vikram@goyalsons.com / employee123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
