import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { encodeFullName } from "@/lib/utils";
import { Loader2, UserCheck, Plus, RefreshCw, Search, User, X, MoreVertical, Trash2, Users, Check } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { employeesApi, apiGet, apiDelete } from "@/lib/api";
import TeamMembersPage from "./assigned-manager/team-members";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface EmpManager {
  mid: string;
  mcardno: string;
  mdepartmentId: string | null;
  mdesignationId: string | null;
  morgUnitId: string | null;
  mis_extinct: boolean;
}

interface Employee {
  id: string;
  cardNumber: string | null;
  firstName: string;
  lastName: string | null;
  department?: { id: string; name: string; code: string } | null;
  designation?: { id: string; name: string; code: string } | null;
  orgUnit?: { id: string; name: string; code: string } | null;
}

interface Department {
  id: string;
  name: string;
  code: string;
}

interface Designation {
  id: string;
  name: string;
  code: string;
}

interface OrgUnit {
  id: string;
  name: string;
  code: string;
}

export default function AssignedManagerPage() {
  const [selectedEmployees, setSelectedEmployees] = useState<Employee[]>([]);
  const [selectedDepartmentIds, setSelectedDepartmentIds] = useState<string[]>([]);
  const [selectedDesignationIds, setSelectedDesignationIds] = useState<string[]>([]);
  const [selectedOrgUnitIds, setSelectedOrgUnitIds] = useState<string[]>([]);
  
  // Toggle functions for multi-select
  const handleDepartmentToggle = (deptId: string) => {
    setSelectedDepartmentIds(prev =>
      prev.includes(deptId)
        ? prev.filter(id => id !== deptId)
        : [...prev, deptId]
    );
  };

  const handleDesignationToggle = (desigId: string) => {
    setSelectedDesignationIds(prev =>
      prev.includes(desigId)
        ? prev.filter(id => id !== desigId)
        : [...prev, desigId]
    );
  };

  const handleOrgUnitToggle = (unitId: string) => {
    setSelectedOrgUnitIds(prev =>
      prev.includes(unitId)
        ? prev.filter(id => id !== unitId)
        : [...prev, unitId]
    );
  };
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [employeeSearchOpen, setEmployeeSearchOpen] = useState(false);
  const [employeeSearchTerm, setEmployeeSearchTerm] = useState("");
  const [showAllRecords, setShowAllRecords] = useState(false);
  const [managerToDelete, setManagerToDelete] = useState<EmpManager | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [showTeamMembers, setShowTeamMembers] = useState(false);
  const [selectedManagerForTeam, setSelectedManagerForTeam] = useState<EmpManager | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Fetch all assigned managers (including extinct if showAllRecords is true)
  const { data: managersResponse, isLoading, refetch, error } = useQuery<{ success: boolean; data: EmpManager[]; message?: string }>({
    queryKey: ["/api/emp-manager", showAllRecords],
    queryFn: async () => {
      const url = showAllRecords ? "/api/emp-manager/all" : "/api/emp-manager";
      const res = await fetch(url, {
        headers: { "X-Session-Id": `${localStorage.getItem("gms_token") || ""}` },
      });
      
      // Parse JSON response (even on error, server returns JSON with error details)
      const data = await res.json();
      
      // Check if response indicates failure
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to fetch managers");
      }
      
      return data;
    },
  });

  // Fetch departments
  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ["/api/departments"],
    queryFn: async () => {
      const res = await fetch("/api/departments", {
        headers: { "X-Session-Id": `${localStorage.getItem("gms_token") || ""}` },
      });
      if (!res.ok) throw new Error("Failed to fetch departments");
      return res.json();
    },
  });

  // Fetch designations
  const { data: designations = [] } = useQuery<Designation[]>({
    queryKey: ["/api/designations"],
    queryFn: async () => {
      const res = await fetch("/api/designations", {
        headers: { "X-Session-Id": `${localStorage.getItem("gms_token") || ""}` },
      });
      if (!res.ok) throw new Error("Failed to fetch designations");
      return res.json();
    },
  });

  // Fetch org units
  const { data: orgUnits = [] } = useQuery<OrgUnit[]>({
    queryKey: ["/api/org-units"],
    queryFn: async () => {
      const res = await fetch("/api/org-units", {
        headers: { "X-Session-Id": `${localStorage.getItem("gms_token") || ""}` },
      });
      if (!res.ok) throw new Error("Failed to fetch org units");
      return res.json();
    },
  });

  // Debounced search term for better performance
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(employeeSearchTerm);
    }, 300); // 300ms debounce
    
    return () => clearTimeout(timer);
  }, [employeeSearchTerm]);

  // Search employees with debounced search
  const { data: employeesResponse, isLoading: searchingEmployees } = useQuery({
    queryKey: ["/api/employees", debouncedSearchTerm],
    queryFn: () => employeesApi.getAll({ search: debouncedSearchTerm, limit: 50 }),
    enabled: employeeSearchOpen && debouncedSearchTerm.length > 0,
  });

  const employees = employeesResponse?.data || [];

  const managers = managersResponse?.data || [];

  // Mutation for assigning manager (supports multiple employees, departments, designations, org units)
  const assignManagerMutation = useMutation({
    mutationFn: async (employees: Employee[]) => {
      const results = [];
      const errors = [];
      
      // Generate all combinations of departments, designations, and org units
      // If arrays are empty, use [null] to create one row with null values
      const deptIds = selectedDepartmentIds.length > 0 ? selectedDepartmentIds : [null];
      const desigIds = selectedDesignationIds.length > 0 ? selectedDesignationIds : [null];
      const unitIds = selectedOrgUnitIds.length > 0 ? selectedOrgUnitIds : [null];
      
      // Create all combinations (Cartesian product)
      const combinations: Array<{ deptId: string | null; desigId: string | null; unitId: string | null }> = [];
      for (const deptId of deptIds) {
        for (const desigId of desigIds) {
          for (const unitId of unitIds) {
            combinations.push({ deptId, desigId, unitId });
          }
        }
      }
      
      // For each employee, create assignments for all combinations
      for (const employee of employees) {
        for (const combo of combinations) {
          try {
            const res = await fetch("/api/emp-manager", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Session-Id": `${localStorage.getItem("gms_token") || ""}`,
              },
              body: JSON.stringify({
                mcardno: employee.cardNumber || "",
                mdepartmentId: combo.deptId || undefined,
                mdesignationId: combo.desigId || undefined,
                morgUnitId: combo.unitId || undefined,
              }),
            });
            
            const contentType = res.headers.get("content-type");
            if (!contentType || !contentType.includes("application/json")) {
              const text = await res.text();
              throw new Error(`Server returned non-JSON response. Status: ${res.status}`);
            }
            
            const result = await res.json();
            if (!res.ok || !result.success) {
              throw new Error(result.message || "Failed to assign manager");
            }
            results.push({ employee, combo, success: true });
          } catch (error: any) {
            errors.push({ employee, combo, error: error.message || "Failed to assign manager" });
          }
        }
      }
      
      if (errors.length > 0) {
        throw new Error(`${errors.length} of ${results.length + errors.length} assignments failed`);
      }
      
      return results;
    },
    onSuccess: (results, employees) => {
      const totalAssignments = results.length;
      toast({
        title: "Success",
        description: `${totalAssignments} manager assignment${totalAssignments > 1 ? 's' : ''} created successfully`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/emp-manager"] });
      // Reset form
      setSelectedEmployees([]);
      setSelectedDepartmentIds([]);
      setSelectedDesignationIds([]);
      setSelectedOrgUnitIds([]);
      setIsSubmitting(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to assign managers. Please try again.",
        variant: "destructive",
      });
      setIsSubmitting(false);
    },
  });

  // Mutation for deleting manager
  const deleteManagerMutation = useMutation({
    mutationFn: async (mid: string) => {
      try {
        const res = await fetch(`/api/emp-manager/${mid}`, {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            "X-Session-Id": `${localStorage.getItem("gms_token") || ""}`,
          },
        });
        
        // Check content type before parsing
        const contentType = res.headers.get("content-type") || "";
        
        if (!contentType.includes("application/json")) {
          // If it's HTML, it means the route wasn't found (404 page)
          if (contentType.includes("text/html")) {
            throw new Error(`Route not found. Please restart the server to load the DELETE endpoint.`);
          }
          const text = await res.text();
          throw new Error(`Server returned unexpected response type. Status: ${res.status}`);
        }
        
        const data = await res.json();
        
        if (!res.ok || !data.success) {
          throw new Error(data.message || "Failed to delete manager");
        }
        
        return data;
      } catch (error: any) {
        // Re-throw with better error message
        if (error.message) {
          throw error;
        }
        throw new Error("Failed to delete manager. Please check if the server is running and restart it if needed.");
      }
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Manager removed successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/emp-manager"] });
      setDeleteDialogOpen(false);
      setManagerToDelete(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to remove manager. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleDeleteClick = (manager: EmpManager) => {
    setManagerToDelete(manager);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (managerToDelete) {
      deleteManagerMutation.mutate(managerToDelete.mid);
    }
  };

  const handleToggleEmployee = (employee: Employee) => {
    setSelectedEmployees(prev => {
      const exists = prev.find(emp => emp.id === employee.id);
      if (exists) {
        // Remove employee
        return prev.filter(emp => emp.id !== employee.id);
      } else {
        // Add employee
        return [...prev, employee];
      }
    });
  };

  const handleRemoveEmployee = (employeeId: string) => {
    setSelectedEmployees(prev => prev.filter(emp => emp.id !== employeeId));
  };

  const isEmployeeSelected = (employeeId: string) => {
    return selectedEmployees.some(emp => emp.id === employeeId);
  };

  const handleCloseSearch = () => {
    setEmployeeSearchOpen(false);
    setEmployeeSearchTerm("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedEmployees.length === 0) {
      toast({
        title: "Validation Error",
        description: "Please select at least one employee",
        variant: "destructive",
      });
      return;
    }

    if (isSubmitting) {
      return; // Prevent double submission
    }

    setIsSubmitting(true);
    assignManagerMutation.mutate(selectedEmployees);
  };

  // Get display names for IDs in the table (without shortforms)
  const getDepartmentName = (id: string | null) => {
    if (!id) return "—";
    const dept = departments.find(d => d.id === id);
    return dept ? dept.name : id;
  };

  const getDesignationName = (id: string | null) => {
    if (!id) return "—";
    const desig = designations.find(d => d.id === id);
    return desig ? desig.name : id;
  };

  const getOrgUnitName = (id: string | null) => {
    if (!id) return "—";
    const unit = orgUnits.find(u => u.id === id);
    return unit ? unit.name : id;
  };

  const handleShowTeam = (manager: EmpManager) => {
    setSelectedManagerForTeam(manager);
    setShowTeamMembers(true);
  };

  // If showing team members, render that page instead
  if (showTeamMembers && selectedManagerForTeam) {
    return (
      <TeamMembersPage
        manager={selectedManagerForTeam}
        departmentName={selectedManagerForTeam.mdepartmentId ? getDepartmentName(selectedManagerForTeam.mdepartmentId) : undefined}
        designationName={selectedManagerForTeam.mdesignationId ? getDesignationName(selectedManagerForTeam.mdesignationId) : undefined}
        orgUnitName={selectedManagerForTeam.morgUnitId ? getOrgUnitName(selectedManagerForTeam.morgUnitId) : undefined}
        onBack={() => {
          setShowTeamMembers(false);
          setSelectedManagerForTeam(null);
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-indigo-500 flex items-center justify-center">
            <UserCheck className="h-5 w-5 text-white" />
          </div>
          Assigned Manager
        </h1>
        <p className="text-slate-500 mt-1">
          Assign managers to departments, designations, or org units
        </p>
      </div>

      {/* Form Card */}
      <Card>
        <CardHeader>
          <CardTitle>Assign Manager</CardTitle>
          <CardDescription>
            Select one or more members and choose their management scope (department, designation, or org unit)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Employee Selection */}
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="employee">
                  Select Members <span className="text-red-500">*</span>
                </Label>
                {selectedEmployees.length > 0 ? (
                  <div className="space-y-2">
                    {selectedEmployees.map((employee) => (
                      <div key={employee.id} className="flex items-center gap-3 p-3 border rounded-lg bg-slate-50">
                        <div className="h-10 w-10 rounded-full bg-indigo-500 flex items-center justify-center text-white font-semibold">
                          {employee.firstName.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1">
                          <p className="font-medium text-slate-800">
                            {encodeFullName(employee.firstName, employee.lastName)}
                          </p>
                          <p className="text-sm text-slate-500 font-mono">
                            Card: {employee.cardNumber || "N/A"}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveEmployee(employee.id)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full justify-start"
                      onClick={() => setEmployeeSearchOpen(true)}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add more members...
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => setEmployeeSearchOpen(true)}
                  >
                    <Search className="h-4 w-4 mr-2" />
                    Search and select members...
                  </Button>
                )}
              </div>

              {/* Department Multi-Select */}
              <div className="space-y-2">
                <Label>Department</Label>
                <div className="space-y-2 max-h-[200px] overflow-y-auto border border-border rounded-lg p-3 bg-muted/30">
                  {departments.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No departments available</p>
                  ) : (
                    departments.map((dept) => (
                      <div
                        key={dept.id}
                        className="flex items-center space-x-2 p-2 rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        <Checkbox
                          id={`dept-${dept.id}`}
                          checked={selectedDepartmentIds.includes(dept.id)}
                          onCheckedChange={() => handleDepartmentToggle(dept.id)}
                        />
                        <Label
                          htmlFor={`dept-${dept.id}`}
                          className="flex-1 cursor-pointer font-normal"
                        >
                          {dept.name}
                        </Label>
                      </div>
                    ))
                  )}
                </div>
                {selectedDepartmentIds.length > 0 && (
                  <p className="text-sm text-muted-foreground">
                    {selectedDepartmentIds.length} department(s) selected
                  </p>
                )}
              </div>

              {/* Designation Multi-Select */}
              <div className="space-y-2">
                <Label>Designation</Label>
                <div className="space-y-2 max-h-[200px] overflow-y-auto border border-border rounded-lg p-3 bg-muted/30">
                  {designations.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No designations available</p>
                  ) : (
                    designations.map((desig) => (
                      <div
                        key={desig.id}
                        className="flex items-center space-x-2 p-2 rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        <Checkbox
                          id={`desig-${desig.id}`}
                          checked={selectedDesignationIds.includes(desig.id)}
                          onCheckedChange={() => handleDesignationToggle(desig.id)}
                        />
                        <Label
                          htmlFor={`desig-${desig.id}`}
                          className="flex-1 cursor-pointer font-normal"
                        >
                          {desig.name}
                        </Label>
                      </div>
                    ))
                  )}
                </div>
                {selectedDesignationIds.length > 0 && (
                  <p className="text-sm text-muted-foreground">
                    {selectedDesignationIds.length} designation(s) selected
                  </p>
                )}
              </div>

              {/* Org Unit Multi-Select */}
              <div className="space-y-2">
                <Label>Org Unit</Label>
                <div className="space-y-2 max-h-[200px] overflow-y-auto border border-border rounded-lg p-3 bg-muted/30">
                  {orgUnits.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No org units available</p>
                  ) : (
                    orgUnits.map((unit) => (
                      <div
                        key={unit.id}
                        className="flex items-center space-x-2 p-2 rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        <Checkbox
                          id={`unit-${unit.id}`}
                          checked={selectedOrgUnitIds.includes(unit.id)}
                          onCheckedChange={() => handleOrgUnitToggle(unit.id)}
                        />
                        <Label
                          htmlFor={`unit-${unit.id}`}
                          className="flex-1 cursor-pointer font-normal"
                        >
                          {unit.name}
                        </Label>
                      </div>
                    ))
                  )}
                </div>
                {selectedOrgUnitIds.length > 0 && (
                  <p className="text-sm text-muted-foreground">
                    {selectedOrgUnitIds.length} org unit(s) selected
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              {/* Show how many assignments will be created */}
              {selectedEmployees.length > 0 && (() => {
                const deptCount = selectedDepartmentIds.length > 0 ? selectedDepartmentIds.length : 1;
                const desigCount = selectedDesignationIds.length > 0 ? selectedDesignationIds.length : 1;
                const unitCount = selectedOrgUnitIds.length > 0 ? selectedOrgUnitIds.length : 1;
                const totalCombinations = deptCount * desigCount * unitCount;
                const totalAssignments = selectedEmployees.length * totalCombinations;
                return (
                  <div className="text-sm text-muted-foreground bg-slate-50 p-3 rounded-lg border border-slate-200">
                    <p className="font-medium text-slate-700">
                      Will create {totalAssignments} assignment{totalAssignments > 1 ? 's' : ''}{" "}
                      ({selectedEmployees.length} employee{selectedEmployees.length > 1 ? 's' : ''} × {totalCombinations} combination{totalCombinations > 1 ? 's' : ''})
                    </p>
                  </div>
                );
              })()}
              <div className="flex gap-2">
                <Button
                  type="submit"
                  disabled={isSubmitting || assignManagerMutation.isPending || selectedEmployees.length === 0}
                  className="bg-indigo-600 hover:bg-indigo-700"
                >
                  {(isSubmitting || assignManagerMutation.isPending) ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating assignments...
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4 mr-2" />
                      Create Assignments
                    </>
                  )}
                </Button>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Employee Search Dialog */}
      <Dialog open={employeeSearchOpen} onOpenChange={handleCloseSearch}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Search and Select Members</DialogTitle>
            <DialogDescription>
              Search by card number, name, or phone number. Select multiple members.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Type to search members..."
                value={employeeSearchTerm}
                onChange={(e) => setEmployeeSearchTerm(e.target.value)}
                className="pl-9"
                autoFocus
              />
            </div>
            {selectedEmployees.length > 0 && (
              <div className="flex items-center gap-2 text-sm text-indigo-600 bg-indigo-50 p-2 rounded-lg">
                <Check className="h-4 w-4" />
                <span>{selectedEmployees.length} member{selectedEmployees.length > 1 ? 's' : ''} selected</span>
              </div>
            )}
            <div className="max-h-[400px] overflow-y-auto border rounded-lg">
              {searchingEmployees ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
                </div>
              ) : employees.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  {employeeSearchTerm ? "No members found" : "Start typing to search..."}
                </div>
              ) : (
                <div className="divide-y">
                  {employees.map((employee: any) => {
                    const isSelected = isEmployeeSelected(employee.id);
                    return (
                      <div
                        key={employee.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => handleToggleEmployee(employee)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            handleToggleEmployee(employee);
                          }
                        }}
                        className="w-full p-3 text-left hover:bg-slate-50 transition-colors flex items-center gap-3"
                      >
                        <div className="flex items-center">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => handleToggleEmployee(employee)}
                            className="mr-2"
                          />
                        </div>
                        <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-semibold">
                          {employee.firstName.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1">
                          <p className="font-medium text-slate-800">
                            {encodeFullName(employee.firstName, employee.lastName)}
                          </p>
                          <div className="flex items-center gap-3 text-sm text-slate-500">
                            {employee.cardNumber && (
                              <span className="font-mono">Card: {employee.cardNumber}</span>
                            )}
                            {employee.phone && <span>Phone: {employee.phone}</span>}
                          </div>
                          {(employee.department || employee.designation || employee.orgUnit) && (
                            <div className="flex items-center gap-2 mt-1 text-xs text-slate-400">
                              {employee.department && (
                                <span>Dept: {employee.department.name}</span>
                              )}
                              {employee.designation && (
                                <span>Desig: {employee.designation.name}</span>
                              )}
                              {employee.orgUnit && (
                                <span>Unit: {employee.orgUnit.name}</span>
                              )}
                            </div>
                          )}
                        </div>
                        {isSelected && (
                          <Check className="h-5 w-5 text-indigo-600" />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleCloseSearch}>
                Cancel
              </Button>
              <Button onClick={handleCloseSearch}>
                Done ({selectedEmployees.length})
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Database Statistics */}
      {managers.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-slate-800">{managers.length}</div>
              <div className="text-sm text-slate-500">Total Records</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-emerald-600">
                {managers.filter(m => !m.mis_extinct).length}
              </div>
              <div className="text-sm text-slate-500">Active</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-red-600">
                {managers.filter(m => m.mis_extinct).length}
              </div>
              <div className="text-sm text-slate-500">Extinct</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-indigo-600">
                {new Set(managers.map(m => m.mcardno)).size}
              </div>
              <div className="text-sm text-slate-500">Unique Managers</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Managers List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Database: emp_manager Table</CardTitle>
              <CardDescription>
                {showAllRecords 
                  ? "All manager assignments (including extinct records)" 
                  : "Active manager assignments only"}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAllRecords(!showAllRecords)}
              >
                {showAllRecords ? "Show Active Only" : "Show All Records"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isLoading}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <div className="text-red-500 mb-4">
                <p className="text-lg font-medium">Error loading managers</p>
                <p className="text-sm mt-1 text-red-400">
                  {error instanceof Error ? error.message : "Unknown error occurred"}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry
              </Button>
            </div>
          ) : managers.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <UserCheck className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-lg font-medium">No managers assigned</p>
              <p className="text-sm mt-1">Use the form above to assign a manager</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>S.No</TableHead>
                    <TableHead>Card Number</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Designation</TableHead>
                    <TableHead>Org Unit</TableHead>
                    <TableHead className="w-[50px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {managers.map((manager, index) => (
                    <TableRow key={manager.mid}>
                      <TableCell className="text-slate-500">
                        {index + 1}
                      </TableCell>
                      <TableCell className="font-mono font-medium">
                        {manager.mcardno}
                      </TableCell>
                      <TableCell>
                        {manager.mdepartmentId ? (
                          <span className="text-slate-700">{getDepartmentName(manager.mdepartmentId)}</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {manager.mdesignationId ? (
                          <span className="text-slate-700">{getDesignationName(manager.mdesignationId)}</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {manager.morgUnitId ? (
                          <span className="text-slate-700">{getOrgUnitName(manager.morgUnitId)}</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => handleShowTeam(manager)}
                            >
                              <Users className="h-4 w-4 mr-2" />
                              Show Teams
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleDeleteClick(manager)}
                              className="text-red-600 focus:text-red-600 focus:bg-red-50"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Remove Manager
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Manager?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this manager assignment? This action cannot be undone.
              {managerToDelete && (
                <div className="mt-2 p-2 bg-slate-100 rounded text-sm">
                  <p><strong>Card Number:</strong> {managerToDelete.mcardno}</p>
                  {managerToDelete.mdepartmentId && (
                    <p><strong>Department:</strong> {getDepartmentName(managerToDelete.mdepartmentId)}</p>
                  )}
                  {managerToDelete.mdesignationId && (
                    <p><strong>Designation:</strong> {getDesignationName(managerToDelete.mdesignationId)}</p>
                  )}
                  {managerToDelete.morgUnitId && (
                    <p><strong>Org Unit:</strong> {getOrgUnitName(managerToDelete.morgUnitId)}</p>
                  )}
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteManagerMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={deleteManagerMutation.isPending}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              {deleteManagerMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Removing...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Remove
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
