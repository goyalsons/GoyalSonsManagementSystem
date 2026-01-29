import { z } from "zod";

// Types matching the schema
export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: string;
  status: "active" | "inactive";
  createdAt: string;
}

export interface Role {
  id: string;
  name: string;
  description: string;
  userCount: number;
}

export const mockUsers: User[] = [
  {
    id: "USR001",
    name: "Admin User",
    email: "admin@example.com",
    phone: "+1234567890",
    role: "Admin",
    status: "active",
    createdAt: "2023-01-01",
  },
  {
    id: "USR002",
    name: "John HR",
    email: "hr@example.com",
    phone: "+1987654321",
    role: "HR",
    status: "active",
    createdAt: "2023-02-15",
  },
  {
    id: "USR003",
    name: "Sarah Manager",
    email: "sarah@example.com",
    role: "Manager",
    status: "active",
    createdAt: "2023-03-10",
  },
  {
    id: "USR004",
    name: "Mike Employee",
    email: "mike@example.com",
    role: "Employee",
    status: "inactive",
    createdAt: "2023-06-20",
  },
];

export const mockRoles: Role[] = [
  { id: "ROLE001", name: "Admin", description: "Full system access", userCount: 1 },
  { id: "ROLE002", name: "HR", description: "Manage employees and attendance", userCount: 1 },
  { id: "ROLE003", name: "Manager", description: "Team management and approvals", userCount: 5 },
  { id: "ROLE004", name: "Employee", description: "Standard access", userCount: 120 },
];

export const mockPolicies = [
  { id: "POL001", key: "can_create_user", label: "Create Users" },
  { id: "POL002", key: "can_edit_user", label: "Edit Users" },
  { id: "POL003", key: "can_delete_user", label: "Delete Users" },
  { id: "POL004", key: "can_view_attendance", label: "View Attendance" },
  { id: "POL005", key: "can_approve_claims", label: "Approve Claims" },
];
