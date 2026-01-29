import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { employeesApi, rolesApi, apiPost, branchesApi, departmentsApi, designationsApi, Branch, Department, Designation, PaginatedResponse } from "@/lib/api";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchInput } from "@/components/ui/search-input";
import { Loader } from "@/components/ui/loader";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  Plus,
  Search,
  MoreHorizontal,
  Loader2,
  Calendar,
  UserPlus,
  Shield,
  Building2,
  Briefcase,
  UserCheck,
  RefreshCw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ImagePreview } from "@/components/ui/image-preview";
import { encodeFullName } from "@/lib/utils";
import { ToastAction } from "@/components/ui/toast";

interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  cardNumber: string | null;
  phone: string | null;
  email?: string | null;
  status: string;
  weeklyOff: string | null;
  shiftStart: string | null;
  shiftEnd: string | null;
  interviewDate: string | null;
  lastInterviewDate: string | null;
  profileImageUrl: string | null;
  orgUnit?: { id: string; name: string; code: string } | null;
  department?: { name: string; code: string } | null;
  designation?: { name: string; code: string } | null;
}

interface Role {
  id: string;
  name: string;
}

export default function EmployeesPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [unitFilter, setUnitFilter] = useState("ALL");
  const [departmentFilter, setDepartmentFilter] = useState("ALL");
  const [designationFilter, setDesignationFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("active");
  const [assignRoleOpen, setAssignRoleOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [selectedRoleId, setSelectedRoleId] = useState<string>("");
  const [tempPassword, setTempPassword] = useState("");
  const [lastSyncSummary, setLastSyncSummary] = useState<{ imported: number; failed: number; total: number } | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();


  const { data: response, isLoading, error } = useQuery({
    queryKey: ["employees", unitFilter, departmentFilter, designationFilter, statusFilter, debouncedSearch],
    queryFn: () => employeesApi.getAll({
      unitId: unitFilter !== "ALL" ? unitFilter : undefined,
      departmentId: departmentFilter !== "ALL" ? departmentFilter : undefined,
      designationId: designationFilter !== "ALL" ? designationFilter : undefined,
      // Important: pass "all" through so backend can return active + inactive
      statusFilter: statusFilter,
      search: debouncedSearch || undefined,
    }),
  });

  const employees = response?.data || [];
  const totalCount = response?.pagination?.total || employees.length;

  const { data: roles = [] } = useQuery<Role[]>({
    queryKey: ["roles"],
    queryFn: () => rolesApi.getAll(),
  });

  const { data: branches = [] } = useQuery<Branch[]>({
    queryKey: ["branches"],
    queryFn: () => branchesApi.getAll(),
  });

  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ["departments", unitFilter],
    queryFn: () => departmentsApi.getAll({
      unitId: unitFilter !== "ALL" ? unitFilter : undefined,
    }),
  });

  const { data: designations = [] } = useQuery<Designation[]>({
    queryKey: ["designations", unitFilter, departmentFilter],
    queryFn: () => designationsApi.getAll({
      unitId: unitFilter !== "ALL" ? unitFilter : undefined,
      departmentId: departmentFilter !== "ALL" ? departmentFilter : undefined,
    }),
  });

  const assignRoleMutation = useMutation({
    mutationFn: (data: { employeeId: string; roleId: string; tempPassword: string }) =>
      apiPost<any>("/employees/assign-role", data),
    onSuccess: () => {
      toast({
        title: "Role assigned successfully",
        description: `${selectedEmployee?.firstName} ${selectedEmployee?.lastName} has been promoted to a system user.`,
      });
      setAssignRoleOpen(false);
      setSelectedEmployee(null);
      setSelectedRoleId("");
      setTempPassword("");
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to assign role",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const syncEmployeesMutation = useMutation({
    mutationFn: () =>
      apiPost<{ success: boolean; message: string; total: number; imported: number; failed: number }>(
        "/admin/data-fetcher/sync-employees",
      ),
    onSuccess: (result) => {
      setLastSyncSummary({ imported: result.imported, failed: result.failed, total: result.total });
      toast({
        title: "Refresh complete",
        description: result.message || `Imported ${result.imported}/${result.total} (failed ${result.failed})`,
      });
      // Refresh list + filters that depend on employee data.
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      queryClient.invalidateQueries({ queryKey: ["branches"] });
      queryClient.invalidateQueries({ queryKey: ["departments"] });
      queryClient.invalidateQueries({ queryKey: ["designations"] });
    },
    onError: (error: any) => {
      const message = error?.message || "Failed to sync members";
      toast({
        title: "Refresh failed",
        description: message,
        variant: "destructive",
        action: message.includes("Employee Master URL not configured")
          ? (
            <ToastAction
              altText="Open Master Settings"
              onClick={() => {
                window.location.href = "/admin/master-settings";
              }}
            >
              Set URL
            </ToastAction>
          )
          : undefined,
      });
      // Even if sync fails, at least refetch the current list from DB.
      queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
  });

  const getEmployeeActiveStatus = (employee: Employee) => {
    // Simple logic: If Last_INTERVIEW_DATE is null/empty → Employee is ACTIVE
    // If Last_INTERVIEW_DATE has a date → Employee is INACTIVE
    return employee.lastInterviewDate === null;
  };

  const getStatusDisplay = (employee: Employee) => {
    const isActive = getEmployeeActiveStatus(employee);
    return isActive ? 'Active' : 'Inactive';
  };

  const getStatusStyle = (employee: Employee) => {
    const isActive = getEmployeeActiveStatus(employee);
    if (isActive) {
      return "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20";
    }
    return "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20";
  };

  const getInitials = (firstName: string, lastName?: string | null) => {
    return `${firstName?.[0] || ""}${lastName?.[0] || ""}`.toUpperCase() || "?";
  };

  const handleAssignRole = (employee: Employee) => {
    setSelectedEmployee(employee);
    setAssignRoleOpen(true);
  };

  const handleSubmitAssignRole = () => {
    if (!selectedEmployee || !selectedRoleId || !tempPassword) {
      toast({
        title: "Missing information",
        description: "Please select a role and enter a temporary password.",
        variant: "destructive",
      });
      return;
    }

    assignRoleMutation.mutate({
      employeeId: selectedEmployee.id,
      roleId: selectedRoleId,
      tempPassword,
    });
  };

  const handleFilterChange = (type: 'unit' | 'department' | 'designation', value: string) => {
    if (type === 'unit') {
      setUnitFilter(value);
      setDepartmentFilter("ALL");
      setDesignationFilter("ALL");
    } else if (type === 'department') {
      setDepartmentFilter(value);
      setDesignationFilter("ALL");
    } else {
      setDesignationFilter(value);
    }
  };

  if (isLoading && !response) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader size="md" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Failed to load members. Please try again.
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="page-title">Members</h1>
          <p className="page-subtitle">
            Manage member profiles and view shift schedules.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastSyncSummary && (
            <div className="text-xs text-muted-foreground hidden sm:block">
              Last refresh: {lastSyncSummary.imported}/{lastSyncSummary.total} imported
              {lastSyncSummary.failed > 0 ? ` (${lastSyncSummary.failed} failed)` : ""}
            </div>
          )}
          <Button
            className="gap-2 shadow-sm"
            onClick={() => syncEmployeesMutation.mutate()}
            disabled={syncEmployeesMutation.isPending}
            title="Fetch latest members and refresh list"
          >
            {syncEmployeesMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {syncEmployeesMutation.isPending ? "Refreshing..." : "Refresh"}
          </Button>
        </div>
      </div>

      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        <div className="p-4 border-b border-border flex flex-col gap-4 bg-muted/30">
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
            <div className="relative w-full sm:w-96">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search by name, code, phone..."
                className="pl-9 pr-20 bg-background"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setDebouncedSearch(searchTerm);
                  }
                }}
              />
              <Button
                size="sm"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 px-3 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-xs"
                onClick={() => setDebouncedSearch(searchTerm)}
              >
                Search
              </Button>
            </div>
            <div className="text-sm text-muted-foreground">
              {`${employees.length} of ${totalCount} members`}
            </div>
          </div>
          {syncEmployeesMutation.isPending && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Syncing members… the list will update automatically when it finishes.
            </div>
          )}
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <Select value={unitFilter} onValueChange={(value) => handleFilterChange('unit', value)}>
                <SelectTrigger className="w-[180px] bg-background">
                  <SelectValue placeholder="Filter by unit" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Units</SelectItem>
                  {branches.map((branch) => (
                    <SelectItem key={branch.id} value={branch.id}>
                      {branch.name} ({branch.employeeCount})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-muted-foreground" />
              <Select value={departmentFilter} onValueChange={(value) => handleFilterChange('department', value)}>
                <SelectTrigger className="w-[180px] bg-background">
                  <SelectValue placeholder="Filter by department" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Departments</SelectItem>
                  {departments.map((dept) => (
                      <SelectItem key={dept.id} value={dept.id}>
                        {dept.name} ({dept.employeeCount ?? 0})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-muted-foreground" />
              <Select value={designationFilter} onValueChange={(value) => handleFilterChange('designation', value)}>
                <SelectTrigger className="w-[180px] bg-background">
                  <SelectValue placeholder="Filter by designation" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Designations</SelectItem>
                  {designations.map((desig) => (
                      <SelectItem key={desig.id} value={desig.id}>
                        {desig.name} ({desig.employeeCount ?? 0})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-muted-foreground" />
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value)}>
                <SelectTrigger className="w-[150px] bg-background">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="all">All</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

          <Table>
            <TableHeader className="sticky top-0 z-10">
              <TableRow className="bg-muted">
                <TableHead className="w-[60px] bg-muted">S.No</TableHead>
                <TableHead className="w-[250px] bg-muted">Member</TableHead>
                <TableHead className="w-[100px] bg-muted">Emp Code</TableHead>
                <TableHead className="w-[120px] bg-muted">Designation</TableHead>
                <TableHead className="w-[100px] bg-muted">Unit</TableHead>
                <TableHead className="w-[100px] bg-muted">Weekly Off</TableHead>
                <TableHead className="w-[80px] bg-muted">Status</TableHead>
                <TableHead className="w-[60px] text-right bg-muted">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.length > 0 ? (
                employees.map((employee: Employee, index: number) => (
                  <TableRow key={employee.id} className="hover:bg-muted/30">
                    <TableCell className="font-medium text-muted-foreground">
                      {index + 1}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        {employee.profileImageUrl ? (
                        <ImagePreview
                            src={employee.profileImageUrl} 
                          alt={`${employee.firstName} ${employee.lastName || ''}`}
                          className="h-10 w-10 rounded-full object-cover border-2 border-muted hover:border-primary transition-colors"
                          previewSize={240}
                          fallback={
                            <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground font-medium">
                              {getInitials(employee.firstName, employee.lastName)}
                            </div>
                          }
                          />
                        ) : (
                          <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground font-medium">
                            {getInitials(employee.firstName, employee.lastName)}
                          </div>
                        )}
                        <div>
                          <div className="font-medium text-foreground">
                            {encodeFullName(employee.firstName, employee.lastName)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {employee.phone || 'No phone'}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-sm font-medium">
                        {employee.cardNumber || '-'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">
                        {employee.designation?.name || '-'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-normal">
                        {employee.orgUnit?.name || '-'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm">
                        <Calendar className="h-3 w-3 text-muted-foreground" />
                        {employee.weeklyOff || '-'}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={getStatusStyle(employee)}
                      >
                        {getStatusDisplay(employee)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem>View Profile</DropdownMenuItem>
                          <DropdownMenuItem>Edit Details</DropdownMenuItem>
                          <DropdownMenuItem>View Attendance</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            onClick={() => handleAssignRole(employee)}
                            className="text-blue-600"
                          >
                            <UserPlus className="h-4 w-4 mr-2" />
                            Assign Role (Promote)
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive">
                            Deactivate
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="h-32 text-center text-muted-foreground"
                  >
                    {searchTerm 
                      ? "No members found matching your search."
                      : "No members found. Sync data from Zoho to populate."
                    }
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

        {employees.length > 0 && (
          <div className="px-4 py-3 border-t border-border bg-muted/30">
            <div className="text-sm text-muted-foreground">
              Showing {employees.length} of {totalCount} members
            </div>
          </div>
        )}
      </div>

      <Dialog open={assignRoleOpen} onOpenChange={setAssignRoleOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-blue-600" />
              Assign Role to Member
            </DialogTitle>
            <DialogDescription>
              Promote {selectedEmployee?.firstName} {selectedEmployee?.lastName} to a system user by assigning a role.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Member</Label>
              <div className="p-3 bg-muted rounded-lg">
                <div className="font-medium">
                  {selectedEmployee?.firstName} {selectedEmployee?.lastName}
                </div>
                <div className="text-sm text-muted-foreground">
                  {selectedEmployee?.cardNumber || 'No member code'} • {selectedEmployee?.designation?.name || 'No designation'}
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Select Role</Label>
              <Select value={selectedRoleId} onValueChange={setSelectedRoleId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a role..." />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((role) => (
                    <SelectItem key={role.id} value={role.id}>
                      {role.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tempPassword">Temporary Password</Label>
              <Input
                id="tempPassword"
                type="password"
                placeholder="Set a temporary password"
                value={tempPassword}
                onChange={(e) => setTempPassword(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                The member will use this password for first login and should change it immediately.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignRoleOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSubmitAssignRole}
              disabled={assignRoleMutation.isPending || !selectedRoleId || !tempPassword}
              className="gap-2"
            >
              {assignRoleMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UserPlus className="h-4 w-4" />
              )}
              Assign Role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
