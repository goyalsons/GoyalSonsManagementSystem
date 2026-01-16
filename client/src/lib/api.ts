const API_BASE = "/api";

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem("gms_token");
  return token
    ? { "Content-Type": "application/json", "X-Session-Id": token }
    : { "Content-Type": "application/json" };
}

export async function apiGet<T>(endpoint: string): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ message: "Request failed" }));
    const err: any = new Error(errorBody.message || "Request failed");
    if (response.status === 403 && errorBody.code) {
      err.code = errorBody.code;
    }
    throw err;
  }

  return response.json();
}

export async function apiPost<T>(endpoint: string, data?: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: data ? JSON.stringify(data) : undefined,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Request failed" }));
    throw new Error(error.message);
  }

  return response.json();
}

export async function apiPut<T>(endpoint: string, data: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    method: "PUT",
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Request failed" }));
    throw new Error(error.message);
  }

  return response.json();
}

export async function apiDelete<T>(endpoint: string): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Request failed" }));
    throw new Error(error.message);
  }

  return response.json();
}

export interface DashboardStats {
  employees: number;
  todayAttendance: number;
  attendanceRate: number;
  pendingTasks: number;
  myPendingTasks: number;
}

export interface RecentCheckin {
  id: string;
  name: string;
  department: string | null;
  time: string;
  status: string;
  initials: string;
}

export const dashboardApi = {
  getStats: () => apiGet<DashboardStats>("/dashboard/stats"),
  getRecentCheckins: () => apiGet<RecentCheckin[]>("/dashboard/recent-checkins"),
};

export interface EmployeeFilters {
  unitId?: string;
  departmentId?: string;
  designationId?: string;
  statusFilter?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

export const employeesApi = {
  getAll: (filters?: EmployeeFilters) => {
    const query = new URLSearchParams();
    if (filters?.unitId) query.set("unitId", filters.unitId);
    if (filters?.departmentId) query.set("departmentId", filters.departmentId);
    if (filters?.designationId) query.set("designationId", filters.designationId);
    if (filters?.statusFilter) query.set("statusFilter", filters.statusFilter);
    if (filters?.search) query.set("search", filters.search);
    if (filters?.page) query.set("page", filters.page.toString());
    if (filters?.limit) query.set("limit", filters.limit.toString());
    const queryString = query.toString();
    return apiGet<PaginatedResponse<any>>(`/employees${queryString ? `?${queryString}` : ""}`);
  },
  getOne: (id: string) => apiGet<any>(`/employees/${id}`),
};

export interface TodayAttendanceRecord {
  id: string;
  cardNumber: string | null;
  firstName: string;
  lastName: string | null;
  phone: string | null;
  profileImageUrl: string | null;
  unit: { id: string; name: string; code: string } | null;
  department: { id: string; name: string; code: string } | null;
  designation: { id: string; name: string; code: string } | null;
  status: "present" | "absent";
  checkInAt: string | null;
  checkOutAt: string | null;
  attendanceStatus: string | null;
  meta: any;
}

export interface TodayAttendanceResponse {
  date: string;
  summary: {
    total: number;
    present: number;
    absent: number;
    attendanceRate: number;
  };
  data: TodayAttendanceRecord[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface TodayAttendanceFilters {
  unitId?: string;
  departmentId?: string;
  designationId?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export const attendanceApi = {
  getAll: (params?: { from?: string; to?: string; employeeId?: string }) => {
    const query = new URLSearchParams();
    if (params?.from) query.set("from", params.from);
    if (params?.to) query.set("to", params.to);
    if (params?.employeeId) query.set("employeeId", params.employeeId);
    return apiGet<any[]>(`/attendance?${query.toString()}`);
  },
  getToday: (filters?: TodayAttendanceFilters) => {
    const query = new URLSearchParams();
    if (filters?.unitId) query.set("unitId", filters.unitId);
    if (filters?.departmentId) query.set("departmentId", filters.departmentId);
    if (filters?.designationId) query.set("designationId", filters.designationId);
    if (filters?.status) query.set("status", filters.status);
    if (filters?.page) query.set("page", filters.page.toString());
    if (filters?.limit) query.set("limit", filters.limit.toString());
    return apiGet<TodayAttendanceResponse>(`/attendance/today?${query.toString()}`);
  },
  checkIn: (employeeId: string) => apiPost<any>("/attendance/checkin", { employeeId }),
};

export const tasksApi = {
  getAll: (params?: { status?: string; priority?: string }) => {
    const query = new URLSearchParams();
    if (params?.status) query.set("status", params.status);
    if (params?.priority) query.set("priority", params.priority);
    return apiGet<any[]>(`/tasks?${query.toString()}`);
  },
  create: (data: { title: string; description?: string; assigneeId?: string; priority?: string; dueDate?: string }) =>
    apiPost<any>("/tasks", data),
};

export const usersApi = {
  getAll: () => apiGet<any[]>("/users"),
  assignRole: (data: { userId: string; roleId: string; policyIds?: string[] }) =>
    apiPost<any>("/users/assign-role", data),
  removeRole: (userId: string, roleId: string) =>
    apiDelete<any>(`/users/${userId}/roles/${roleId}`),
  updateRolePermissions: (data: { userId: string; roleId: string; policyIds: string[] }) =>
    apiPost<any>("/users/update-role-permissions", data),
};

export const claimsApi = {
  getAll: (params?: { status?: string }) => {
    const query = new URLSearchParams();
    if (params?.status) query.set("status", params.status);
    return apiGet<any[]>(`/claims?${query.toString()}`);
  },
};

export const rolesApi = {
  getAll: () => apiGet<any[]>("/roles"),
  getById: (id: string) => apiGet<any>(`/roles/${id}`),
  create: (data: { name: string; description?: string; level?: number; policyIds?: string[] }) =>
    apiPost<any>("/roles", data),
  update: (id: string, data: { name?: string; description?: string; level?: number; policyIds?: string[] }) =>
    apiPut<any>(`/roles/${id}`, data),
  delete: (id: string) => apiDelete<any>(`/roles/${id}`),
};

export interface WorkflowData {
  roles: Array<{
    id: string;
    name: string;
    description?: string;
    type?: string;
    position?: { x: number; y: number };
  }>;
  connections: Array<{
    id: string;
    source: string;
    target: string;
  }>;
}

export const workflowApi = {
  get: () => apiGet<WorkflowData>("/roles/workflow"),
  save: (data: WorkflowData) => apiPost<WorkflowData>("/roles/workflow", data),
};

export const policiesApi = {
  getAll: () => apiGet<any[]>("/policies"),
  create: (data: { key: string; description?: string; category?: string }) =>
    apiPost<any>("/policies", data),
};

export const orgUnitsApi = {
  getAll: () => apiGet<any[]>("/org-units"),
};

export interface Branch {
  id: string;
  code: string;
  name: string;
  employeeCount: number;
}

export interface Department {
  id: string;
  code: string;
  name: string;
  employeeCount: number;
}

export interface Designation {
  id: string;
  code: string;
  name: string;
  employeeCount: number;
}

export const branchesApi = {
  getAll: () => apiGet<Branch[]>("/branches"),
};

export const departmentsApi = {
  getAll: (params?: { unitId?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.unitId) searchParams.set("unitId", params.unitId);
    const queryString = searchParams.toString();
    return apiGet<Department[]>(`/departments${queryString ? `?${queryString}` : ""}`);
  },
};

export const designationsApi = {
  getAll: (params?: { unitId?: string; departmentId?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.unitId) searchParams.set("unitId", params.unitId);
    if (params?.departmentId) searchParams.set("departmentId", params.departmentId);
    const queryString = searchParams.toString();
    return apiGet<Designation[]>(`/designations${queryString ? `?${queryString}` : ""}`);
  },
};

export interface EmployeeByCardResponse {
  success: boolean;
  data?: {
    id: string;
    firstName: string;
    lastName: string | null;
    cardNumber: string | null;
    designation: { id: string; name: string; code: string } | null;
    orgUnit: { id: string; name: string; code: string } | null;
    department: { id: string; name: string; code: string } | null;
    status: string;
  };
  message?: string;
}

export interface AssignManagerRequest {
  cardNumber: string;
  orgUnitId: string;
  departmentIds: string[];
}

export interface AssignManagerResponse {
  success: boolean;
  message?: string;
  data?: {
    managerCardNumber: string;
    managerName: string;
    orgUnit: string;
    departments: string[];
    assignmentIds: string[];
  };
}

export const managerApi = {
  getEmployeeByCard: (cardNumber: string) => 
    apiGet<EmployeeByCardResponse>(`/employees/by-card/${encodeURIComponent(cardNumber)}`),
  
  assignManager: (data: AssignManagerRequest) => 
    apiPost<AssignManagerResponse>("/manager/assign", data),
};
