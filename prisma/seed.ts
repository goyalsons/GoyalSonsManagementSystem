import { PrismaClient } from "@prisma/client";
import * as crypto from "crypto";

const prisma = new PrismaClient();

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password).digest("hex");
}

async function main() {
  console.log("Starting seed...");

  const ceoUnit = await prisma.orgUnit.upsert({
    where: { code: "CEO" },
    update: {},
    create: {
      name: "CEO Office",
      code: "CEO",
      description: "Chief Executive Office",
      level: 0,
      path: "/CEO",
    },
  });

  const managementUnit = await prisma.orgUnit.upsert({
    where: { code: "MGMT" },
    update: {},
    create: {
      name: "Management",
      code: "MGMT",
      description: "Management Team",
      level: 1,
      path: "/CEO/MGMT",
      parentId: ceoUnit.id,
    },
  });

  const hrUnit = await prisma.orgUnit.upsert({
    where: { code: "HR" },
    update: {},
    create: {
      name: "Human Resources",
      code: "HR",
      description: "Human Resources Department",
      level: 2,
      path: "/CEO/MGMT/HR",
      parentId: managementUnit.id,
    },
  });

  const financeUnit = await prisma.orgUnit.upsert({
    where: { code: "FIN" },
    update: {},
    create: {
      name: "Finance",
      code: "FIN",
      description: "Finance Department",
      level: 2,
      path: "/CEO/MGMT/FIN",
      parentId: managementUnit.id,
    },
  });

  const itUnit = await prisma.orgUnit.upsert({
    where: { code: "IT" },
    update: {},
    create: {
      name: "Information Technology",
      code: "IT",
      description: "IT Department",
      level: 2,
      path: "/CEO/MGMT/IT",
      parentId: managementUnit.id,
    },
  });

  const marketingUnit = await prisma.orgUnit.upsert({
    where: { code: "MKT" },
    update: {},
    create: {
      name: "Marketing",
      code: "MKT",
      description: "Marketing Department",
      level: 2,
      path: "/CEO/MGMT/MKT",
      parentId: managementUnit.id,
    },
  });

  const operationsUnit = await prisma.orgUnit.upsert({
    where: { code: "OPS" },
    update: {},
    create: {
      name: "Operations",
      code: "OPS",
      description: "Operations Department",
      level: 2,
      path: "/CEO/MGMT/OPS",
      parentId: managementUnit.id,
    },
  });

  console.log("Created org units");

  // Departments (linked to org units)
  const departmentRecords = [
    { code: "IT", name: "IT" },
    { code: "MKT", name: "Marketing" },
    { code: "OPS", name: "Operations" },
    { code: "FIN", name: "Finance" },
    { code: "HR", name: "HR" },
  ];

  const departmentsMap = new Map<string, string>();
  for (const dept of departmentRecords) {
    const record = await prisma.department.upsert({
      where: { code: dept.code },
      update: { name: dept.name },
      create: { code: dept.code, name: dept.name },
    });
    departmentsMap.set(dept.code, record.id);
  }

  // Single designation reused for seeds
  const staffDesignation = await prisma.designation.upsert({
    where: { code: "STAFF" },
    update: { name: "Staff" },
    create: { code: "STAFF", name: "Staff" },
  });

  // Role and Policy tables removed - commented out all role/policy creation code
  // const policies = [...];
  // Role, Policy, UserRole, RolePolicy creation code removed
  console.log("Skipped policies and roles creation (tables removed)");

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

  let empCounter = 2;
  for (const dept of departmentRecords) {
    for (let i = 0; i < 5; i++) {
      const empCode = `EMP${String(empCounter).padStart(3, "0")}`;
      await prisma.employee.upsert({
        where: { employeeCode: empCode },
        update: {},
        create: {
          firstName: `Employee${empCounter}`,
          lastName: dept.name,
          employeeCode: empCode,
          departmentId: departmentsMap.get(dept.code),
          designationId: staffDesignation.id,
          phone: `+91-98765${String(empCounter).padStart(5, "0")}`,
          joiningDate: new Date(`2023-0${Math.min(i + 1, 9)}-${Math.min((i + 1) * 5, 28)}`),
          orgUnitId:
            dept.code === "IT"
              ? itUnit.id
              : dept.code === "MKT"
              ? marketingUnit.id
              : dept.code === "OPS"
              ? operationsUnit.id
              : dept.code === "FIN"
              ? financeUnit.id
              : hrUnit.id,
        },
      });
      empCounter++;
    }
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
