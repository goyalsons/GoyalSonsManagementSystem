import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Shield, UserPlus, Loader2, Search, CheckSquare, Building2, Briefcase, MapPin, X, Trash2, Plus, Edit, KeyRound, RefreshCw, CreditCard, Settings2, Eye, EyeOff } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { employeesApi, rolesApi, policiesApi, apiPost, apiDelete, orgUnitsApi, departmentsApi, designationsApi, usersApi } from "@/lib/api";
import { GroupedPolicySelector } from "@/components/GroupedPolicySelector";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Employee {
  id: string;
  firstName: string;
  lastName: string | null;
  employeeCode: string | null;
  cardNumber: string | null;
  phone: string | null;
  status: string;
  orgUnit?: { id: string; name: string; code: string } | null;
  department?: { id: string; name: string; code: string } | null;
  designation?: { id: string; name: string; code: string } | null;
  user?: { id: string; roles: Array<{ role: { id: string; name: string } }> } | null;
  users?: Array<{ id: string; roles: Array<{ role: { id: string; name: string } }> }>;
}

interface Role {
  id: string;
  name: string;
  description: string;
  userCount: number;
  activeEmployeeCount?: number;
  policies?: Policy[]; // Role's default policies
}

interface Policy {
  id: string;
  key: string;
  description: string;
  category: string;
}

interface OrgUnit {
  id: string;
  name: string;
  code: string;
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

export default function RolesAssignedPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [selectedEmployees, setSelectedEmployees] = useState<Set<string>>(new Set());
  const [selectedPolicies, setSelectedPolicies] = useState<Set<string>>(new Set()); // Selected policies for role
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [policySearchQuery, setPolicySearchQuery] = useState<string>(""); // Search for policies
  const [viewMode, setViewMode] = useState<"policies" | "members">("policies"); // "policies" or "members"
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  /** Default true: one role per user in DB; replacing avoids P2002 when switching Director → Employee. */
  const [replaceExistingRoles, setReplaceExistingRoles] = useState(true);
  
  // Add Role Dialog State
  const [addRoleDialogOpen, setAddRoleDialogOpen] = useState(false);
  const [newRoleName, setNewRoleName] = useState<string>("");
  const [newRoleDescription, setNewRoleDescription] = useState<string>("");
  const [newRolePolicies, setNewRolePolicies] = useState<Set<string>>(new Set());
  const [newRolePolicySearch, setNewRolePolicySearch] = useState<string>("");

  // Configuration List Dialog State
  const [configListOpen, setConfigListOpen] = useState(false);
  const [configListSearch, setConfigListSearch] = useState("");

  // Edit Configuration Dialog State
  const [editConfigOpen, setEditConfigOpen] = useState(false);
  const [editConfigUserId, setEditConfigUserId] = useState("");
  const [editConfigName, setEditConfigName] = useState("");
  const [editConfigEmail, setEditConfigEmail] = useState("");
  const [editConfigPassword, setEditConfigPassword] = useState("");
  const [editConfigRoleId, setEditConfigRoleId] = useState("");
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [editConfigCardNo, setEditConfigCardNo] = useState("");
  const [editCardSearch, setEditCardSearch] = useState("");
  const [editCardDropdownOpen, setEditCardDropdownOpen] = useState(false);

  // Add Configuration Dialog State
  const [addConfigOpen, setAddConfigOpen] = useState(false);
  const [configEmail, setConfigEmail] = useState("");
  const [configPassword, setConfigPassword] = useState("");
  const [configConfirmPassword, setConfigConfirmPassword] = useState("");
  const [configName, setConfigName] = useState("");
  const [configRoleId, setConfigRoleId] = useState<string>("");
  const [configEmployeeCardNo, setConfigEmployeeCardNo] = useState<string>("");
  const [configCardSearch, setConfigCardSearch] = useState("");
  const [configCardDropdownOpen, setConfigCardDropdownOpen] = useState(false);
  const [showConfigPassword, setShowConfigPassword] = useState(false);
  const [showConfigConfirmPassword, setShowConfigConfirmPassword] = useState(false);
  
  // Filter states
  const [selectedUnits, setSelectedUnits] = useState<Set<string>>(new Set());
  const [selectedDepartments, setSelectedDepartments] = useState<Set<string>>(new Set());
  const [selectedDesignations, setSelectedDesignations] = useState<Set<string>>(new Set());

  // Fetch all roles - with caching
  const { data: roles = [], isLoading: rolesLoading } = useQuery({
    queryKey: ["roles"],
    queryFn: () => rolesApi.getAll(),
    staleTime: 30000, // Cache for 30 seconds
    refetchOnWindowFocus: false, // Don't refetch on window focus
  });

  // Fetch role details with policies when a role is selected
  const { data: roleDetails } = useQuery({
    queryKey: ["role", selectedRole?.id],
    queryFn: () => rolesApi.getById(selectedRole!.id),
    enabled: !!selectedRole && viewMode === "policies",
    staleTime: 30000, // Cache for 30 seconds
    refetchOnWindowFocus: false,
  });

  // Sync selected policies when role details load
  useEffect(() => {
    if (roleDetails?.policies && viewMode === "policies") {
      setSelectedPolicies(new Set(roleDetails.policies.map((p: Policy) => p.id)));
    }
  }, [roleDetails, viewMode]);

  // Fetch all policies for edit mode - with caching
  const { data: allPolicies = [] } = useQuery({
    queryKey: ["policies"],
    queryFn: () => policiesApi.getAll(),
    staleTime: 60000, // Cache for 1 minute (policies don't change often)
    refetchOnWindowFocus: false,
  });

  // Fetch all active employees - single query for both counting and member selection
  const { data: employeesResponse, isLoading: employeesLoading } = useQuery({
    queryKey: ["employees", "all-active"],
    queryFn: () => employeesApi.getAll({
      statusFilter: "ACTIVE",
    }),
    staleTime: 30000, // Cache for 30 seconds
    refetchOnWindowFocus: false, // Don't refetch on window focus
  });

  // Backend now returns Employee.users (array). Keep backward compatibility with existing UI
  // logic by normalizing a synthetic `user` from users[0].
  const allEmployees = (employeesResponse?.data || []).map((e: any) => ({
    ...e,
    user: e?.user ?? (Array.isArray(e?.users) ? e.users[0] : null),
  }));
  const allActiveEmployees = allEmployees; // Reuse same data

  // Calculate active employee count for each role - optimized
  const rolesWithActiveCount = useMemo(() => {
    if (!allActiveEmployees.length || !roles.length) return roles;
    
    // Create a map for faster lookup: roleId -> count
    const roleCountMap = new Map<string, number>();
    
    // Initialize all roles with 0
    roles.forEach((role: Role) => {
      roleCountMap.set(role.id, 0);
    });
    
    // Count employees per role in a single pass
    allActiveEmployees.forEach((emp: Employee) => {
      if (emp.user?.roles) {
        emp.user.roles.forEach((userRole: any) => {
          const roleId = userRole.role?.id;
          if (roleId && roleCountMap.has(roleId)) {
            roleCountMap.set(roleId, (roleCountMap.get(roleId) || 0) + 1);
          }
        });
      }
    });
    
    // Map roles with counts
    return roles.map((role: Role) => ({
      ...role,
      activeEmployeeCount: roleCountMap.get(role.id) || 0,
    }));
  }, [roles, allActiveEmployees]);

  // Fetch org units, departments, designations - with caching
  const { data: orgUnits = [] } = useQuery({
    queryKey: ["org-units"],
    queryFn: () => orgUnitsApi.getAll(),
    staleTime: 60000, // Cache for 1 minute
    refetchOnWindowFocus: false,
  });

  const { data: departments = [] } = useQuery({
    queryKey: ["departments"],
    queryFn: () => departmentsApi.getAll(),
    staleTime: 60000, // Cache for 1 minute
    refetchOnWindowFocus: false,
  });

  const { data: designations = [] } = useQuery({
    queryKey: ["designations"],
    queryFn: () => designationsApi.getAll(),
    staleTime: 60000, // Cache for 1 minute
    refetchOnWindowFocus: false,
  });

  // Filter employees based on selected filters
  const filteredEmployees = useMemo(() => {
    const filtered = allEmployees.filter((employee: Employee) => {
      // Unit filter
      if (selectedUnits.size > 0) {
        if (!employee.orgUnit?.id || !selectedUnits.has(employee.orgUnit.id)) {
          return false;
        }
      }
      // Department filter
      if (selectedDepartments.size > 0) {
        if (!employee.department?.id || !selectedDepartments.has(employee.department.id)) {
          return false;
        }
      }
      // Designation filter
      if (selectedDesignations.size > 0) {
        if (!employee.designation?.id || !selectedDesignations.has(employee.designation.id)) {
          return false;
        }
      }
      // Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const fullName = `${employee.firstName} ${employee.lastName || ""}`.toLowerCase();
        if (
          !fullName.includes(query) &&
          !employee.employeeCode?.toLowerCase().includes(query) &&
          !employee.cardNumber?.toLowerCase().includes(query)
        ) {
          return false;
        }
      }
      return true;
    });

    // Sort employees: those with the selected role appear first
    if (selectedRole && viewMode === "members") {
      return filtered.sort((a: Employee, b: Employee) => {
        const aHasRole = a.user?.roles?.some((r: any) => r.role?.id === selectedRole.id) || false;
        const bHasRole = b.user?.roles?.some((r: any) => r.role?.id === selectedRole.id) || false;
        
        // Employees with the role come first
        if (aHasRole && !bHasRole) return -1;
        if (!aHasRole && bHasRole) return 1;
        
        // If both have or both don't have the role, maintain original order
        return 0;
      });
    }

    return filtered;
  }, [allEmployees, selectedUnits, selectedDepartments, selectedDesignations, searchQuery, selectedRole, viewMode]);

  // Filter all policies by search and group by category
  const filteredAllPolicies = useMemo(() => {
    if (!policySearchQuery.trim()) return allPolicies;
    const query = policySearchQuery.toLowerCase();
    return allPolicies.filter((policy: Policy) => 
      policy.key.toLowerCase().includes(query) ||
      policy.description?.toLowerCase().includes(query) ||
      policy.category?.toLowerCase().includes(query)
    );
  }, [allPolicies, policySearchQuery]);

  const policiesByCategory = useMemo(() => {
    return filteredAllPolicies.reduce((acc: any, policy: Policy) => {
      const category = policy.category || "Other";
      if (!acc[category]) acc[category] = [];
      acc[category].push(policy);
      return acc;
    }, {});
  }, [filteredAllPolicies]);

  // Get all policy IDs for select all functionality
  const allPolicyIds = filteredAllPolicies.map((p: Policy) => p.id);
  const allSelected = allPolicyIds.length > 0 && allPolicyIds.every((id) => selectedPolicies.has(id));

  // Handle role card click - show policies first
  const handleRoleClick = (role: Role) => {
    setSelectedRole(role);
    setSelectedEmployees(new Set());
    setSearchQuery("");
    setPolicySearchQuery("");
    setSelectedUnits(new Set());
    setSelectedDepartments(new Set());
    setSelectedDesignations(new Set());
    setViewMode("policies");
    setReplaceExistingRoles(true);
    setRoleDialogOpen(true);
    // Reset selected policies - will be set when roleDetails loads
    setSelectedPolicies(new Set());
  };

  // Handle Edit Policies - open dialog in edit mode
  const handleEditPolicies = (role: Role, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedRole(role);
    setSelectedEmployees(new Set());
    setSearchQuery("");
    setPolicySearchQuery("");
    setSelectedUnits(new Set());
    setSelectedDepartments(new Set());
    setSelectedDesignations(new Set());
    setViewMode("policies");
    setReplaceExistingRoles(true);
    setRoleDialogOpen(true);
    // Reset selected policies - will be set when roleDetails loads
    setSelectedPolicies(new Set());
  };

  // Handle policy toggle
  const handlePolicyToggle = (policyId: string) => {
    setSelectedPolicies((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(policyId)) {
        newSet.delete(policyId);
      } else {
        newSet.add(policyId);
      }
      return newSet;
    });
  };

  // Handle select all policies
  const handleSelectAllPolicies = () => {
    if (allSelected) {
      setSelectedPolicies(new Set());
    } else {
      setSelectedPolicies(new Set(allPolicyIds));
    }
  };

  // Handle save role policies
  const saveRolePoliciesMutation = useMutation({
    mutationFn: async (data: { roleId: string; policyIds: string[] }) => {
      return rolesApi.update(data.roleId, {
        policyIds: data.policyIds,
      });
    },
    onSuccess: () => {
      toast({
        title: "Policies updated",
        description: `Policies for ${selectedRole?.name} have been saved successfully.`,
      });
      queryClient.invalidateQueries({ queryKey: ["role", selectedRole?.id] });
      queryClient.invalidateQueries({ queryKey: ["roles"] });
      setRoleDialogOpen(false);
      setSelectedRole(null);
      setSelectedPolicies(new Set());
      setPolicySearchQuery("");
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update policies",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  // Handle save policies
  const handleSavePolicies = () => {
    if (!selectedRole) return;
    saveRolePoliciesMutation.mutate({
      roleId: selectedRole.id,
      policyIds: Array.from(selectedPolicies),
    });
  };

  // Handle Add Members - switch to members view
  const handleAddMembers = (role: Role, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedRole(role);
    setSelectedEmployees(new Set());
    setSearchQuery("");
    setPolicySearchQuery("");
    setSelectedUnits(new Set());
    setSelectedDepartments(new Set());
    setSelectedDesignations(new Set());
    setViewMode("members");
    setReplaceExistingRoles(true);
    setRoleDialogOpen(true);
  };

  // Handle employee toggle (multiple selection)
  const handleEmployeeToggle = (employeeId: string) => {
    setSelectedEmployees((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(employeeId)) {
        newSet.delete(employeeId);
      } else {
        newSet.add(employeeId);
      }
      return newSet;
    });
  };

  // Handle select all employees
  const handleSelectAllEmployees = () => {
    if (selectedEmployees.size === filteredEmployees.length) {
      setSelectedEmployees(new Set());
    } else {
      setSelectedEmployees(new Set(filteredEmployees.map((e: Employee) => e.id)));
    }
  };

  // Handle assign roles to employees - automatically assign role's default policies
  const assignRoleMutation = useMutation({
    mutationFn: async (data: { employeeIds: string[]; roleId: string; replaceExisting: boolean }) => {
      const results = [];
      
      // Get role's default policies
      const roleData = await rolesApi.getById(data.roleId);
      const rolePolicyIds = roleData.policies?.map((p: Policy) => p.id) || [];
      
      for (const employeeId of data.employeeIds) {
        const employee = allEmployees.find((e: Employee) => e.id === employeeId);
        if (!employee) continue;

        try {
          if (employee.user) {
            // Employee has user account — add or replace role via backend
            await apiPost<any>("/users/assign-role", {
              userId: employee.user.id,
              roleId: data.roleId,
              replaceExisting: data.replaceExisting,
              policyIds: rolePolicyIds.length > 0 ? rolePolicyIds : undefined,
            });
          } else {
            // Create user account and assign role with role's default policies
            await apiPost<any>("/employees/assign-role", {
              employeeId: employeeId,
              roleId: data.roleId,
              tempPassword: "TempPass123!",
              policyIds: rolePolicyIds.length > 0 ? rolePolicyIds : undefined,
            });
          }
          results.push({ employeeId, success: true });
        } catch (error: any) {
          results.push({ employeeId, success: false, error: error.message });
        }
      }
      return results;
    },
    onSuccess: (results) => {
      const successCount = results.filter((r) => r.success).length;
      const failCount = results.length - successCount;
      const failMessages = results
        .filter((r): r is { employeeId: string; success: false; error: string } => !r.success)
        .map((r) => r.error)
        .filter(Boolean);
      const policyNote =
        successCount > 0
          ? " Role policies were applied for successful assignments."
          : "";

      toast({
        title: failCount > 0 && successCount === 0 ? "Role assignment failed" : "Roles assigned",
        description: `${successCount} employee(s) assigned successfully.${failCount > 0 ? ` ${failCount} failed.` : ""}${policyNote}${
          failMessages.length > 0 ? ` ${failMessages.join(" ")}` : ""
        }`,
        variant: failCount > 0 && successCount === 0 ? "destructive" : undefined,
      });
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      queryClient.invalidateQueries({ queryKey: ["employees", "all-active"] });
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["roles"] });
      queryClient.invalidateQueries({ queryKey: ["all-active-employees"] });
      setRoleDialogOpen(false);
      setSelectedRole(null);
      setSelectedEmployees(new Set());
      setViewMode("policies");
      setSearchQuery("");
      setSelectedUnits(new Set());
      setSelectedDepartments(new Set());
      setSelectedDesignations(new Set());
      setReplaceExistingRoles(true);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to assign roles",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  // Handle final submit
  const handleSubmit = () => {
    if (!selectedRole || selectedEmployees.size === 0) {
      toast({
        title: "Validation Error",
        description: "Please select at least one employee",
        variant: "destructive",
      });
      return;
    }

    assignRoleMutation.mutate({
      employeeIds: Array.from(selectedEmployees),
      roleId: selectedRole.id,
      replaceExisting: replaceExistingRoles,
    });
  };

  // Handle delete role
  const deleteRoleMutation = useMutation({
    mutationFn: async (roleId: string) => {
      await rolesApi.delete(roleId);
    },
    onSuccess: () => {
      toast({
        title: "Role deleted",
        description: "Role has been deleted successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["roles"] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to delete role",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  // Handle remove role from employee
  const removeRoleFromEmployeeMutation = useMutation({
    mutationFn: async (data: { userId: string; roleId: string; employeeName: string; roleName: string }) => {
      await usersApi.removeRole(data.userId, data.roleId);
    },
    onSuccess: (_, variables) => {
      toast({
        title: "Role removed",
        description: `Role "${variables.roleName}" has been removed from ${variables.employeeName}.`,
      });
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      queryClient.invalidateQueries({ queryKey: ["employees", "all-active"] });
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["roles"] });
      queryClient.invalidateQueries({ queryKey: ["all-active-employees"] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to remove role",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  // Handle add role - open dialog
  const handleAddRole = () => {
    setNewRoleName("");
    setNewRoleDescription("");
    setNewRolePolicies(new Set());
    setNewRolePolicySearch("");
    setAddRoleDialogOpen(true);
  };

  // Filter policies for new role dialog
  const filteredNewRolePolicies = useMemo(() => {
    if (!newRolePolicySearch.trim()) return allPolicies;
    const query = newRolePolicySearch.toLowerCase();
    return allPolicies.filter((policy: Policy) => 
      policy.key.toLowerCase().includes(query) ||
      policy.description?.toLowerCase().includes(query) ||
      policy.category?.toLowerCase().includes(query)
    );
  }, [allPolicies, newRolePolicySearch]);

  const newRolePoliciesByCategory = useMemo(() => {
    return filteredNewRolePolicies.reduce((acc: any, policy: Policy) => {
      const category = policy.category || "Other";
      if (!acc[category]) acc[category] = [];
      acc[category].push(policy);
      return acc;
    }, {});
  }, [filteredNewRolePolicies]);

  const configCardFilteredEmployees = useMemo(() => {
    if (!allActiveEmployees.length) return [];
    const q = configCardSearch.toLowerCase().trim();
    return allActiveEmployees
      .filter((emp: Employee) => !!emp.cardNumber)
      .filter((emp: Employee) => {
        if (!q) return true;
        const fullName = `${emp.firstName} ${emp.lastName || ""}`.toLowerCase();
        return (
          emp.cardNumber!.toLowerCase().includes(q) ||
          fullName.includes(q)
        );
      })
      .slice(0, 50);
  }, [allActiveEmployees, configCardSearch]);

  const editCardFilteredEmployees = useMemo(() => {
    if (!allActiveEmployees.length) return [];
    const q = editCardSearch.toLowerCase().trim();
    return allActiveEmployees
      .filter((emp: Employee) => !!emp.cardNumber)
      .filter((emp: Employee) => {
        if (!q) return true;
        const fullName = `${emp.firstName} ${emp.lastName || ""}`.toLowerCase();
        return (
          emp.cardNumber!.toLowerCase().includes(q) ||
          fullName.includes(q)
        );
      })
      .slice(0, 50);
  }, [allActiveEmployees, editCardSearch]);

  const allNewRolePolicyIds = filteredNewRolePolicies.map((p: Policy) => p.id);
  const allNewRolePoliciesSelected = allNewRolePolicyIds.length > 0 && allNewRolePolicyIds.every((id) => newRolePolicies.has(id));

  // Handle toggle policy for new role
  const handleNewRolePolicyToggle = (policyId: string) => {
    setNewRolePolicies((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(policyId)) {
        newSet.delete(policyId);
      } else {
        newSet.add(policyId);
      }
      return newSet;
    });
  };

  // Handle select all policies for new role
  const handleSelectAllNewRolePolicies = () => {
    if (allNewRolePoliciesSelected) {
      setNewRolePolicies(new Set());
    } else {
      setNewRolePolicies(new Set(allNewRolePolicyIds));
    }
  };

  // Create role mutation
  const createRoleMutation = useMutation({
    mutationFn: async (data: { name: string; description?: string; policyIds: string[] }) => {
      return rolesApi.create({
        name: data.name,
        description: data.description || undefined,
        policyIds: data.policyIds,
      });
    },
    onSuccess: () => {
      toast({
        title: "Role created",
        description: `Role "${newRoleName}" has been created successfully.`,
      });
      queryClient.invalidateQueries({ queryKey: ["roles"] });
      queryClient.invalidateQueries({ queryKey: ["all-active-employees"] });
      setAddRoleDialogOpen(false);
      setNewRoleName("");
      setNewRoleDescription("");
      setNewRolePolicies(new Set());
      setNewRolePolicySearch("");
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create role",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  // Handle save new role
  const handleSaveNewRole = () => {
    if (!newRoleName.trim()) {
      toast({
        title: "Validation Error",
        description: "Please enter a role name",
        variant: "destructive",
      });
      return;
    }

    createRoleMutation.mutate({
      name: newRoleName.trim(),
      description: newRoleDescription.trim() || undefined,
      policyIds: Array.from(newRolePolicies),
    });
  };

  // Create credentials (ID/password user) mutation
  const createCredentialsMutation = useMutation({
    mutationFn: (data: { email: string; password: string; name?: string; roleId: string; employeeCardNo?: string }) =>
      usersApi.createCredentials(data),
    onSuccess: (data) => {
      const linkedMsg = data.linkedEmployee ? ` Linked to employee card: ${data.linkedEmployee.cardNumber}` : "";
      toast({
        title: "Configuration created",
        description: `${data.user.email} can now login with role: ${data.role.name}.${linkedMsg}`,
      });
      queryClient.invalidateQueries({ queryKey: ["roles"] });
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["employees", "all-active"] });
      setAddConfigOpen(false);
      setConfigEmail("");
      setConfigPassword("");
      setConfigConfirmPassword("");
      setConfigName("");
      setConfigRoleId("");
      setConfigEmployeeCardNo("");
      setConfigCardSearch("");
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create configuration",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Configuration list: fetch credential-based users
  const { data: configUsersData, isLoading: configUsersLoading } = useQuery({
    // Do NOT use `credentialsOnly: true` here.
    // Some users may be linked via employeeId but have `email/passwordHash` null.
    // We still need them to appear when searching by `cardNumber`, otherwise conflicts
    // like "card already linked" cannot be resolved from the UI.
    queryKey: ["users", "all", configListSearch],
    queryFn: () => usersApi.getList({ limit: 200, credentialsOnly: false, search: configListSearch || undefined }),
    enabled: configListOpen,
    staleTime: 10000,
  });

  const configUsers = configUsersData?.users || [];

  // Toggle user status (active <-> disabled)
  const toggleUserStatusMutation = useMutation({
    mutationFn: async ({ userId, newStatus }: { userId: string; newStatus: string }) => {
      return usersApi.update(userId, { status: newStatus });
    },
    onSuccess: (_data, variables) => {
      toast({
        title: variables.newStatus === "active" ? "User enabled" : "User disabled",
        description: variables.newStatus === "active"
          ? "The user can now login with ID/password."
          : "The user can no longer login with ID/password.",
      });
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update status",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Edit configuration user mutation
  const editConfigMutation = useMutation({
    mutationFn: async ({
      userId,
      name,
      password,
      roleId,
      employeeCardNo,
      email,
    }: {
      userId: string;
      name?: string;
      password?: string;
      roleId?: string;
      employeeCardNo?: string;
      email?: string | null;
    }) => {
      const promises: Promise<any>[] = [];
      const updateData: any = {};
      if (name) updateData.name = name;
      if (employeeCardNo !== undefined) updateData.employeeCardNo = employeeCardNo;
      if (email !== undefined) updateData.email = email;
      if (Object.keys(updateData).length > 0) promises.push(usersApi.update(userId, updateData));
      if (password) promises.push(usersApi.resetPassword(userId, password));
      if (roleId) promises.push(usersApi.updateRole(userId, roleId));
      return Promise.all(promises);
    },
    onSuccess: () => {
      toast({ title: "Configuration updated", description: "User details have been saved." });
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setEditConfigOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update", description: error.message, variant: "destructive" });
    },
  });

  const handleEditConfigOpen = (user: any) => {
    setEditConfigUserId(user.id);
    setEditConfigName(user.name || "");
    setEditConfigEmail(user.email || "");
    setEditConfigPassword("");
    setEditConfigRoleId(user.role?.id || "");
    setEditConfigCardNo(user.cardNumber || "");
    setEditCardSearch("");
    setShowEditPassword(false);
    setEditConfigOpen(true);
  };

  const handleEditConfigSubmit = () => {
    if (!editConfigUserId) return;
    const trimmedEmail = editConfigEmail.trim();
    editConfigMutation.mutate({
      userId: editConfigUserId,
      name: editConfigName || undefined,
      password: editConfigPassword || undefined,
      roleId: editConfigRoleId || undefined,
      employeeCardNo: editConfigCardNo,
      email: trimmedEmail ? trimmedEmail : undefined,
    });
  };

  // Backfill: Create User + Employee role for employees without a linked user
  const backfillMutation = useMutation({
    mutationFn: () => usersApi.backfillEmployeeUsers(),
    onSuccess: (data) => {
      toast({
        title: "Backfill complete",
        description: data.message,
      });
      queryClient.invalidateQueries({ queryKey: ["roles"] });
      queryClient.invalidateQueries({ queryKey: ["employees", "all-active"] });
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Backfill failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const employeesWithoutUserCount = useMemo(
    () => allActiveEmployees.filter((e: Employee) => !e.user).length,
    [allActiveEmployees]
  );

  const handleAddConfigSubmit = () => {
    if (!configEmail.trim()) {
      toast({ title: "Email is required", variant: "destructive" });
      return;
    }
    if (!configPassword) {
      toast({ title: "Password is required", variant: "destructive" });
      return;
    }
    if (configPassword.length < 8) {
      toast({ title: "Password must be at least 8 characters", variant: "destructive" });
      return;
    }
    if (configPassword !== configConfirmPassword) {
      toast({ title: "Passwords do not match", variant: "destructive" });
      return;
    }
    if (!configRoleId) {
      toast({ title: "Please select a role", variant: "destructive" });
      return;
    }
    createCredentialsMutation.mutate({
      email: configEmail.trim(),
      password: configPassword,
      name: configName.trim() || undefined,
      roleId: configRoleId,
      employeeCardNo: configEmployeeCardNo || undefined,
    });
  };

  // Handle delete role
  const handleDeleteRole = (role: Role) => {
    const activeCount = role.activeEmployeeCount ?? role.userCount ?? 0;
    if (activeCount > 0) {
      toast({
        title: "Cannot delete role",
        description: `This role has ${activeCount} active employee(s) assigned. Please remove all assignments before deleting.`,
        variant: "destructive",
      });
      return;
    }
    
    if (window.confirm(`Are you sure you want to delete the role "${role.name}"? This action cannot be undone.`)) {
      deleteRoleMutation.mutate(role.id);
    }
  };

  if (rolesLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Add/Delete Role Buttons - responsive for mobile */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Link href="/employees" className="shrink-0">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Roles Assigned</h1>
            <p className="text-muted-foreground mt-1 text-sm sm:text-base">
              Assign roles to employees and customize their permissions
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto shrink-0">
          {employeesWithoutUserCount > 0 && (
            <Button
              variant="outline"
              onClick={() => backfillMutation.mutate()}
              disabled={backfillMutation.isPending}
              className="gap-2"
              title={`Assign Employee role to ${employeesWithoutUserCount} employees without User`}
            >
              {backfillMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Backfill ({employeesWithoutUserCount})
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => setConfigListOpen(true)}
            className="gap-2"
          >
            <Settings2 className="h-4 w-4 shrink-0" />
            Configuration
          </Button>
          <Button
            variant="outline"
            onClick={() => setAddConfigOpen(true)}
            className="gap-2"
          >
            <KeyRound className="h-4 w-4 shrink-0" />
            Add Configuration
          </Button>
          <Button
            onClick={handleAddRole}
            className="gap-2"
          >
            <Plus className="h-4 w-4 shrink-0" />
            Add Role
          </Button>
        </div>
      </div>

      {/* Roles Cards Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {rolesWithActiveCount.map((role: Role) => (
          <Card
            key={role.id}
            className="flex flex-col hover:shadow-lg transition-shadow relative"
          >
            <CardHeader>
              <div className="flex items-center justify-between mb-2">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                  <Shield className="h-5 w-5" />
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="font-normal">
                    {role.activeEmployeeCount ?? role.userCount} Active
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteRole(role);
                    }}
                    title="Delete Role"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <CardTitle 
                className="cursor-pointer"
                onClick={() => handleRoleClick(role)}
              >
                {role.name}
              </CardTitle>
              <CardDescription>{role.description}</CardDescription>
            </CardHeader>
            <CardContent className="flex-1">
              {/* Content removed as per user request */}
            </CardContent>
            <CardFooter className="border-t pt-4 bg-muted/20">
              <div className="flex flex-col gap-2 w-full sm:flex-row">
                <Button
                  variant="outline"
                  className="flex-1 gap-2 min-w-0"
                  onClick={(e) => handleEditPolicies(role, e)}
                  disabled={role.name === "Director"}
                  title={role.name === "Director" ? "System role (locked)" : undefined}
                >
                  <Edit className="h-3 w-3 shrink-0" />
                  Edit Policies
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 gap-2 min-w-0"
                  onClick={(e) => handleAddMembers(role, e)}
                >
                  <UserPlus className="h-3 w-3 shrink-0" />
                  Add Members
                </Button>
              </div>
            </CardFooter>
          </Card>
        ))}
      </div>

      {/* Role Dialog - Shows Policies or Members based on viewMode */}
      <Dialog 
        open={roleDialogOpen} 
        onOpenChange={(open) => {
          setRoleDialogOpen(open);
          if (!open) {
            // Reset all state when dialog closes
            setSelectedRole(null);
            setSelectedEmployees(new Set());
            setSelectedPolicies(new Set());
            setViewMode("policies");
            setSearchQuery("");
            setPolicySearchQuery("");
            setSelectedUnits(new Set());
            setSelectedDepartments(new Set());
            setSelectedDesignations(new Set());
            setReplaceExistingRoles(true);
          }
        }}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {viewMode === "policies"
                ? selectedRole?.name === "Director"
                  ? "Director – System Role (locked)"
                  : `${selectedRole?.name} - Policies`
                : `Add Members to ${selectedRole?.name}`}
            </DialogTitle>
            <DialogDescription>
              {viewMode === "policies"
                ? selectedRole?.name === "Director"
                  ? "This role has all policies and cannot be edited."
                  : "Edit and manage policies for this role. Select the policies you want to assign."
                : "Select employees to assign this role. All role policies will be automatically assigned."}
            </DialogDescription>
          </DialogHeader>

          {/* Policies View - Grouped UI */}
          {viewMode === "policies" && (
            <div className="space-y-4">
              {selectedRole?.name === "Director" ? (
                <p className="text-sm text-muted-foreground py-4">This role has all policies and cannot be edited.</p>
              ) : roleDetails ? (
                <GroupedPolicySelector
                  policies={(Array.isArray(allPolicies) ? allPolicies : []).map((p: Policy) => ({
                    id: p.id,
                    key: p.key,
                    description: p.description,
                  }))}
                  selectedPolicyIds={selectedPolicies}
                  onSelectionChange={setSelectedPolicies}
                  disabled={selectedRole?.name === "Director"}
                  showTemplates={true}
                />
              ) : (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              )}
            </div>
          )}

          {/* Members View */}
          {viewMode === "members" && (
            <div className="space-y-4">
              {/* Search Bar */}
              <div>
                <Label>Search Member</Label>
                <div className="relative mt-2">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name, code, or card number..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                    autoComplete="off"
                  />
                </div>
              </div>

              {/* Filter Dropdowns */}
              <div className="grid grid-cols-3 gap-4">
                {/* Unit Filter */}
                <div>
                  <Label>Unit</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-between">
                        {selectedUnits.size > 0 ? `${selectedUnits.size} selected` : "All Units"}
                        <Building2 className="h-4 w-4 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[300px] p-0">
                      <Command>
                        <CommandInput placeholder="Search units..." />
                        <CommandList>
                          <CommandEmpty>No units found.</CommandEmpty>
                          <CommandGroup>
                            <CommandItem
                              onSelect={() => {
                                if (selectedUnits.size === orgUnits.length) {
                                  setSelectedUnits(new Set());
                                } else {
                                  setSelectedUnits(new Set(orgUnits.map((u) => u.id)));
                                }
                              }}
                            >
                              <CheckSquare
                                className={`mr-2 h-4 w-4 ${
                                  selectedUnits.size === orgUnits.length ? "opacity-100" : "opacity-0"
                                }`}
                              />
                              Select All
                            </CommandItem>
                            {orgUnits.map((unit) => (
                              <CommandItem
                                key={unit.id}
                                onSelect={() => {
                                  setSelectedUnits((prev) => {
                                    const newSet = new Set(prev);
                                    if (newSet.has(unit.id)) {
                                      newSet.delete(unit.id);
                                    } else {
                                      newSet.add(unit.id);
                                    }
                                    return newSet;
                                  });
                                }}
                              >
                                <Checkbox
                                  checked={selectedUnits.has(unit.id)}
                                  className="mr-2"
                                />
                                {unit.name}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  {selectedUnits.size > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {Array.from(selectedUnits).map((unitId) => {
                        const unit = orgUnits.find((u) => u.id === unitId);
                        return unit ? (
                          <Badge key={unitId} variant="secondary" className="gap-1">
                            {unit.name}
                            <X
                              className="h-3 w-3 cursor-pointer"
                              onClick={() => {
                                setSelectedUnits((prev) => {
                                  const newSet = new Set(prev);
                                  newSet.delete(unitId);
                                  return newSet;
                                });
                              }}
                            />
                          </Badge>
                        ) : null;
                      })}
                    </div>
                  )}
                </div>

                {/* Department Filter */}
                <div>
                  <Label>Department</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-between">
                        {selectedDepartments.size > 0 ? `${selectedDepartments.size} selected` : "All Departments"}
                        <Briefcase className="h-4 w-4 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[300px] p-0">
                      <Command>
                        <CommandInput placeholder="Search departments..." />
                        <CommandList>
                          <CommandEmpty>No departments found.</CommandEmpty>
                          <CommandGroup>
                            <CommandItem
                              onSelect={() => {
                                if (selectedDepartments.size === departments.length) {
                                  setSelectedDepartments(new Set());
                                } else {
                                  setSelectedDepartments(new Set(departments.map((d) => d.id)));
                                }
                              }}
                            >
                              <CheckSquare
                                className={`mr-2 h-4 w-4 ${
                                  selectedDepartments.size === departments.length ? "opacity-100" : "opacity-0"
                                }`}
                              />
                              Select All
                            </CommandItem>
                            {departments.map((dept) => (
                              <CommandItem
                                key={dept.id}
                                onSelect={() => {
                                  setSelectedDepartments((prev) => {
                                    const newSet = new Set(prev);
                                    if (newSet.has(dept.id)) {
                                      newSet.delete(dept.id);
                                    } else {
                                      newSet.add(dept.id);
                                    }
                                    return newSet;
                                  });
                                }}
                              >
                                <Checkbox
                                  checked={selectedDepartments.has(dept.id)}
                                  className="mr-2"
                                />
                                {dept.name}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  {selectedDepartments.size > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {Array.from(selectedDepartments).map((deptId) => {
                        const dept = departments.find((d) => d.id === deptId);
                        return dept ? (
                          <Badge key={deptId} variant="secondary" className="gap-1">
                            {dept.name}
                            <X
                              className="h-3 w-3 cursor-pointer"
                              onClick={() => {
                                setSelectedDepartments((prev) => {
                                  const newSet = new Set(prev);
                                  newSet.delete(deptId);
                                  return newSet;
                                });
                              }}
                            />
                          </Badge>
                        ) : null;
                      })}
                    </div>
                  )}
                </div>

                {/* Designation Filter */}
                <div>
                  <Label>Designation</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-between">
                        {selectedDesignations.size > 0 ? `${selectedDesignations.size} selected` : "All Designations"}
                        <MapPin className="h-4 w-4 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[300px] p-0">
                      <Command>
                        <CommandInput placeholder="Search designations..." />
                        <CommandList>
                          <CommandEmpty>No designations found.</CommandEmpty>
                          <CommandGroup>
                            <CommandItem
                              onSelect={() => {
                                if (selectedDesignations.size === designations.length) {
                                  setSelectedDesignations(new Set());
                                } else {
                                  setSelectedDesignations(new Set(designations.map((d) => d.id)));
                                }
                              }}
                            >
                              <CheckSquare
                                className={`mr-2 h-4 w-4 ${
                                  selectedDesignations.size === designations.length ? "opacity-100" : "opacity-0"
                                }`}
                              />
                              Select All
                            </CommandItem>
                            {designations.map((desg) => (
                              <CommandItem
                                key={desg.id}
                                onSelect={() => {
                                  setSelectedDesignations((prev) => {
                                    const newSet = new Set(prev);
                                    if (newSet.has(desg.id)) {
                                      newSet.delete(desg.id);
                                    } else {
                                      newSet.add(desg.id);
                                    }
                                    return newSet;
                                  });
                                }}
                              >
                                <Checkbox
                                  checked={selectedDesignations.has(desg.id)}
                                  className="mr-2"
                                />
                                {desg.name}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  {selectedDesignations.size > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {Array.from(selectedDesignations).map((desgId) => {
                        const desg = designations.find((d) => d.id === desgId);
                        return desg ? (
                          <Badge key={desgId} variant="secondary" className="gap-1">
                            {desg.name}
                            <X
                              className="h-3 w-3 cursor-pointer"
                              onClick={() => {
                                setSelectedDesignations((prev) => {
                                  const newSet = new Set(prev);
                                  newSet.delete(desgId);
                                  return newSet;
                                });
                              }}
                            />
                          </Badge>
                        ) : null;
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Employee Selection with Multiple Selection */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Select Employees ({selectedEmployees.size} selected)</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleSelectAllEmployees}
                    className="gap-2"
                  >
                    <CheckSquare className="h-4 w-4" />
                    {selectedEmployees.size === filteredEmployees.length ? "Deselect All" : "Select All"}
                  </Button>
                </div>
                <div className="mt-2 space-y-2 max-h-[400px] overflow-y-auto border rounded-lg p-2">
                  {employeesLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin" />
                    </div>
                  ) : filteredEmployees.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No employees found
                    </div>
                  ) : (
                    filteredEmployees.map((employee: Employee) => {
                      const isSelected = selectedEmployees.has(employee.id);
                      const hasUser = !!employee.user;
                      const existingRoles = employee.user?.roles || [];

                      return (
                        <div
                          key={employee.id}
                          className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                            isSelected
                              ? "border-primary bg-primary/5"
                              : "border-border hover:bg-muted/50"
                          }`}
                          onClick={() => handleEmployeeToggle(employee.id)}
                        >
                          <div className="flex items-start gap-3">
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => handleEmployeeToggle(employee.id)}
                              onClick={(e) => e.stopPropagation()}
                            />
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <div className="font-medium">
                                  {employee.firstName} {employee.lastName || ""}
                                </div>
                                {hasUser && (
                                  <Badge variant="outline" className="text-xs">
                                    Has Account
                                  </Badge>
                                )}
                              </div>
                              <div className="text-sm text-muted-foreground mt-1 space-y-1">
                                {employee.employeeCode && (
                                  <div>Code: {employee.employeeCode}</div>
                                )}
                                {employee.orgUnit && (
                                  <div className="flex items-center gap-1">
                                    <Building2 className="h-3 w-3" />
                                    Unit: {employee.orgUnit.name}
                                  </div>
                                )}
                                {employee.department && (
                                  <div className="flex items-center gap-1">
                                    <Briefcase className="h-3 w-3" />
                                    Dept: {employee.department.name}
                                  </div>
                                )}
                                {employee.designation && (
                                  <div className="flex items-center gap-1">
                                    <MapPin className="h-3 w-3" />
                                    Designation: {employee.designation.name}
                                  </div>
                                )}
                                {existingRoles.length > 0 && (
                                  <div className="mt-2">
                                    <span className="text-xs font-medium">Current Roles: </span>
                                    <div className="flex flex-wrap gap-1 mt-1">
                                      {existingRoles.map((r: any) => (
                                        <Badge 
                                          key={r.role.id} 
                                          variant="secondary" 
                                          className="text-xs flex items-center gap-1 pr-1"
                                        >
                                          {r.role.name}
                                          {employee.user && (
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                if (window.confirm(`Are you sure you want to remove the role "${r.role.name}" from ${employee.firstName} ${employee.lastName || ""}?`)) {
                                                  removeRoleFromEmployeeMutation.mutate({
                                                    userId: employee.user!.id,
                                                    roleId: r.role.id,
                                                    employeeName: `${employee.firstName} ${employee.lastName || ""}`,
                                                    roleName: r.role.name,
                                                  });
                                                }
                                              }}
                                              disabled={removeRoleFromEmployeeMutation.isPending}
                                              className="hover:bg-destructive/20 rounded-full p-0.5 transition-colors disabled:opacity-50"
                                              title="Remove role"
                                            >
                                              <X className="h-3 w-3" />
                                            </button>
                                          )}
                                        </Badge>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Replace Existing Roles Option */}
              <div className="flex items-center space-x-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                <Checkbox
                  id="replace-existing"
                  checked={replaceExistingRoles}
                  onCheckedChange={(checked) => setReplaceExistingRoles(checked as boolean)}
                />
                <Label
                  htmlFor="replace-existing"
                  className="text-sm font-medium cursor-pointer"
                >
                  Replace existing roles (remove all current roles before assigning this role)
                </Label>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRoleDialogOpen(false);
                setSelectedRole(null);
                setSelectedEmployees(new Set());
                setSelectedPolicies(new Set());
                setViewMode("policies");
                setSearchQuery("");
                setPolicySearchQuery("");
                setSelectedUnits(new Set());
                setSelectedDepartments(new Set());
                setSelectedDesignations(new Set());
              }}
            >
              {viewMode === "policies" ? "Cancel" : "Cancel"}
            </Button>
            {viewMode === "policies" && (
              <>
                <Button
                  onClick={() => {
                    setReplaceExistingRoles(true);
                    setViewMode("members");
                  }}
                  variant="outline"
                  className="gap-2"
                >
                  <UserPlus className="h-4 w-4" />
                  Add Members
                </Button>
                {selectedRole?.name !== "Director" && (
                  <Button
                    onClick={handleSavePolicies}
                    disabled={saveRolePoliciesMutation.isPending}
                    className="gap-2"
                  >
                    {saveRolePoliciesMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Shield className="h-4 w-4" />
                        Save Policies
                      </>
                    )}
                  </Button>
                )}
              </>
            )}
            {viewMode === "members" && (
              <Button
                onClick={handleSubmit}
                disabled={assignRoleMutation.isPending || selectedEmployees.size === 0}
                className="gap-2"
              >
                {assignRoleMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Assigning...
                  </>
                ) : (
                  <>
                    <Shield className="h-4 w-4" />
                    Assign Role to {selectedEmployees.size} Member{selectedEmployees.size !== 1 ? "s" : ""}
                  </>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Role Dialog */}
      <Dialog open={addRoleDialogOpen} onOpenChange={setAddRoleDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Role</DialogTitle>
            <DialogDescription>
              Enter role details and select policies to assign to this role.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Role Name */}
            <div>
              <Label htmlFor="role-name">Role Name *</Label>
              <Input
                id="role-name"
                placeholder="e.g., Manager, Admin, HR"
                value={newRoleName}
                onChange={(e) => setNewRoleName(e.target.value)}
                className="mt-2"
              />
            </div>

            {/* Role Description */}
            <div>
              <Label htmlFor="role-description">Description (Optional)</Label>
              <Input
                id="role-description"
                placeholder="Brief description of this role"
                value={newRoleDescription}
                onChange={(e) => setNewRoleDescription(e.target.value)}
                className="mt-2"
              />
            </div>

            {/* Policies Selection */}
            <div className="space-y-4">
              <div>
                <Label>Select Policies</Label>
                <div className="relative mt-2">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search policies by name, description, or category..."
                    value={newRolePolicySearch}
                    onChange={(e) => setNewRolePolicySearch(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              {Object.keys(newRolePoliciesByCategory).length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {newRolePolicySearch.trim() 
                    ? "No policies found matching your search."
                    : "No policies available."}
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Policy Count and Select All */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="font-normal">
                        {newRolePolicies.size} of {filteredNewRolePolicies.length} Selected
                      </Badge>
                      <Badge variant="outline" className="font-normal">
                        {Object.keys(newRolePoliciesByCategory).length} Categor{Object.keys(newRolePoliciesByCategory).length !== 1 ? "ies" : "y"}
                      </Badge>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleSelectAllNewRolePolicies}
                      className="gap-2"
                      disabled={allNewRolePolicyIds.length === 0}
                    >
                      <CheckSquare className="h-4 w-4" />
                      {allNewRolePoliciesSelected ? "Deselect All" : "Select All"}
                    </Button>
                  </div>

                  {/* Policies by Category */}
                  <div className="space-y-3 max-h-[500px] overflow-y-auto border rounded-lg p-4">
                    {Object.entries(newRolePoliciesByCategory).map(([category, categoryPolicies]: [string, any]) => (
                      <div key={category} className="space-y-2">
                        <h4 className="text-sm font-semibold uppercase text-muted-foreground sticky top-0 bg-background py-2 border-b">
                          {category} ({categoryPolicies.length})
                        </h4>
                        <div className="space-y-1 pl-2">
                          {categoryPolicies.map((policy: Policy) => (
                            <div
                              key={policy.id}
                              className="flex items-start space-x-3 p-3 rounded-lg hover:bg-muted/50 border border-transparent hover:border-border transition-colors"
                            >
                              <Checkbox
                                id={`new-policy-${policy.id}`}
                                checked={newRolePolicies.has(policy.id)}
                                onCheckedChange={() => handleNewRolePolicyToggle(policy.id)}
                              />
                              <div className="flex-1">
                                <Label
                                  htmlFor={`new-policy-${policy.id}`}
                                  className="text-sm font-medium cursor-pointer"
                                >
                                  {policy.key}
                                </Label>
                                {policy.description && (
                                  <p className="text-xs text-muted-foreground mt-1">{policy.description}</p>
                                )}
                              </div>
                              <Badge variant="outline" className="text-xs">
                                {policy.category}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setAddRoleDialogOpen(false);
                setNewRoleName("");
                setNewRoleDescription("");
                setNewRolePolicies(new Set());
                setNewRolePolicySearch("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveNewRole}
              disabled={createRoleMutation.isPending || !newRoleName.trim()}
              className="gap-2"
            >
              {createRoleMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  Create Role
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Configuration Dialog */}
      <Dialog open={addConfigOpen} onOpenChange={setAddConfigOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Configuration</DialogTitle>
            <DialogDescription>
              Create an ID/password login user and assign a role. The user can sign in via email and password.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Employee Card No (optional)</Label>
              <Popover open={configCardDropdownOpen} onOpenChange={setConfigCardDropdownOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-between font-normal">
                    {configEmployeeCardNo ? (
                      <span className="truncate">
                        {configEmployeeCardNo}
                        {(() => {
                          const emp = allActiveEmployees.find((e: Employee) => e.cardNumber === configEmployeeCardNo);
                          return emp ? ` — ${emp.firstName} ${emp.lastName || ""}` : "";
                        })()}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Search & select card no</span>
                    )}
                    <CreditCard className="h-4 w-4 opacity-50 shrink-0 ml-2" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[350px] p-0" align="start">
                  <Command shouldFilter={false}>
                    <CommandInput
                      placeholder="Search by card no or name..."
                      value={configCardSearch}
                      onValueChange={setConfigCardSearch}
                    />
                    <CommandList>
                      <CommandEmpty>No employees found.</CommandEmpty>
                      <CommandGroup>
                        {configEmployeeCardNo && (
                          <CommandItem
                            onSelect={() => {
                              setConfigEmployeeCardNo("");
                              setConfigCardSearch("");
                              setConfigCardDropdownOpen(false);
                            }}
                          >
                            <X className="mr-2 h-4 w-4 text-muted-foreground" />
                            <span className="text-muted-foreground">Clear selection</span>
                          </CommandItem>
                        )}
                        {configCardFilteredEmployees.map((emp: Employee) => (
                          <CommandItem
                            key={emp.id}
                            onSelect={() => {
                              setConfigEmployeeCardNo(emp.cardNumber!);
                              if (!configName.trim()) {
                                setConfigName(`${emp.firstName} ${emp.lastName || ""}`.trim());
                              }
                              setConfigCardSearch("");
                              setConfigCardDropdownOpen(false);
                            }}
                          >
                            <CreditCard className="mr-2 h-4 w-4 text-muted-foreground shrink-0" />
                            <div className="flex flex-col min-w-0">
                              <span className="font-medium truncate">{emp.cardNumber}</span>
                              <span className="text-xs text-muted-foreground truncate">
                                {emp.firstName} {emp.lastName || ""}
                                {emp.department ? ` · ${emp.department.name}` : ""}
                              </span>
                            </div>
                            {configEmployeeCardNo === emp.cardNumber && (
                              <CheckSquare className="ml-auto h-4 w-4 text-primary shrink-0" />
                            )}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {configEmployeeCardNo && (
                <p className="text-xs text-muted-foreground">
                  This login ID will be linked to employee card {configEmployeeCardNo}
                </p>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="config-email">ID (Email)</Label>
              <Input
                id="config-email"
                type="email"
                placeholder="user@example.com"
                value={configEmail}
                onChange={(e) => setConfigEmail(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="config-password">Password</Label>
              <div className="relative">
                <Input
                  id="config-password"
                  type={showConfigPassword ? "text" : "password"}
                  placeholder="Min 8 characters"
                  value={configPassword}
                  onChange={(e) => setConfigPassword(e.target.value)}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowConfigPassword(!showConfigPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showConfigPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="config-confirm">Confirm Password</Label>
              <div className="relative">
                <Input
                  id="config-confirm"
                  type={showConfigConfirmPassword ? "text" : "password"}
                  placeholder="Repeat password"
                  value={configConfirmPassword}
                  onChange={(e) => setConfigConfirmPassword(e.target.value)}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowConfigConfirmPassword(!showConfigConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showConfigConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="config-name">Display Name (optional)</Label>
              <Input
                id="config-name"
                placeholder="Full name"
                value={configName}
                onChange={(e) => setConfigName(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Role</Label>
              <Select value={configRoleId} onValueChange={setConfigRoleId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  {roles
                    .filter((r: { name: string }) => r.name !== "Manager")
                    .map((role: { id: string; name: string }) => (
                      <SelectItem key={role.id} value={role.id}>
                        {role.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddConfigOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddConfigSubmit}
              disabled={createCredentialsMutation.isPending}
            >
              {createCredentialsMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Creating...
                </>
              ) : (
                "Create"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Configuration List Dialog */}
      <Dialog open={configListOpen} onOpenChange={setConfigListOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Configuration</DialogTitle>
            <DialogDescription>
              Manage ID/password login users added via Add Configuration.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, or card no..."
                value={configListSearch}
                onChange={(e) => setConfigListSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex-1 overflow-y-auto border rounded-lg divide-y">
              {configUsersLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : configUsers.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  {configListSearch ? "No users found matching your search." : "No configuration users found. Use 'Add Configuration' to create one."}
                </div>
              ) : (
                configUsers.map((user) => {
                  const isActive = user.status === "active";
                  return (
                    <div
                      key={user.id}
                      className={`flex items-center gap-4 px-4 py-3 transition-colors ${!isActive ? "bg-muted/40 opacity-70" : ""}`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium truncate">{user.name}</span>
                          {user.cardNumber && (
                            <Badge variant="outline" className="text-xs shrink-0 gap-1">
                              <CreditCard className="h-3 w-3" />
                              {user.cardNumber}
                            </Badge>
                          )}
                          {user.role && (
                            <Badge variant="secondary" className="text-xs shrink-0">
                              {user.role.name}
                            </Badge>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground mt-0.5">
                          {user.email ? (
                            <span className="truncate">{user.email}</span>
                          ) : (
                            <span className="text-muted-foreground/50 italic">No email</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1"
                          onClick={() => handleEditConfigOpen(user)}
                        >
                          <Edit className="h-3.5 w-3.5" />
                          Edit
                        </Button>
                        <Button
                          variant={isActive ? "destructive" : "default"}
                          size="sm"
                          className="h-8"
                          disabled={toggleUserStatusMutation.isPending}
                          onClick={() => {
                            toggleUserStatusMutation.mutate({
                              userId: user.id,
                              newStatus: isActive ? "disabled" : "active",
                            });
                          }}
                        >
                          {isActive ? "Disable" : "Enable"}
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            {configUsersData && configUsersData.total > 0 && (
              <p className="text-xs text-muted-foreground text-center">
                Showing {configUsers.length} of {configUsersData.total} configuration user(s)
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfigListOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Configuration Dialog */}
      <Dialog open={editConfigOpen} onOpenChange={setEditConfigOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Configuration</DialogTitle>
            <DialogDescription>
              Update user details. Leave password empty to keep unchanged.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Employee Card No</Label>
              <Popover open={editCardDropdownOpen} onOpenChange={setEditCardDropdownOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-between font-normal mt-1">
                    {editConfigCardNo ? (
                      <span className="truncate">
                        {editConfigCardNo}
                        {(() => {
                          const emp = allActiveEmployees.find((e: Employee) => e.cardNumber === editConfigCardNo);
                          return emp ? ` — ${emp.firstName} ${emp.lastName || ""}` : "";
                        })()}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Search & select card no</span>
                    )}
                    <CreditCard className="h-4 w-4 opacity-50 shrink-0 ml-2" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[350px] p-0" align="start">
                  <Command shouldFilter={false}>
                    <CommandInput
                      placeholder="Search by card no or name..."
                      value={editCardSearch}
                      onValueChange={setEditCardSearch}
                    />
                    <CommandList>
                      <CommandEmpty>No employees found.</CommandEmpty>
                      <CommandGroup>
                        {editConfigCardNo && (
                          <CommandItem
                            onSelect={() => {
                              setEditConfigCardNo("");
                              setEditCardSearch("");
                              setEditCardDropdownOpen(false);
                            }}
                          >
                            <X className="mr-2 h-4 w-4 text-muted-foreground" />
                            <span className="text-muted-foreground">Clear selection</span>
                          </CommandItem>
                        )}
                        {editCardFilteredEmployees.map((emp: Employee) => (
                          <CommandItem
                            key={emp.id}
                            onSelect={() => {
                              setEditConfigCardNo(emp.cardNumber!);
                              if (!editConfigName.trim()) {
                                setEditConfigName(`${emp.firstName} ${emp.lastName || ""}`.trim());
                              }
                              setEditCardSearch("");
                              setEditCardDropdownOpen(false);
                            }}
                          >
                            <CreditCard className="mr-2 h-4 w-4 text-muted-foreground shrink-0" />
                            <div className="flex flex-col min-w-0">
                              <span className="font-medium truncate">{emp.cardNumber}</span>
                              <span className="text-xs text-muted-foreground truncate">
                                {emp.firstName} {emp.lastName || ""}
                                {emp.department ? ` · ${emp.department.name}` : ""}
                              </span>
                            </div>
                            {editConfigCardNo === emp.cardNumber && (
                              <CheckSquare className="ml-auto h-4 w-4 text-primary shrink-0" />
                            )}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label>Email (ID)</Label>
              <Input
                value={editConfigEmail}
                onChange={(e) => setEditConfigEmail(e.target.value)}
                placeholder="Enter email"
                className="mt-1"
              />
            </div>
            <div>
              <Label>Display Name</Label>
              <Input
                value={editConfigName}
                onChange={(e) => setEditConfigName(e.target.value)}
                placeholder="Enter display name"
                className="mt-1"
              />
            </div>
            <div>
              <Label>New Password (optional)</Label>
              <div className="relative mt-1">
                <Input
                  type={showEditPassword ? "text" : "password"}
                  value={editConfigPassword}
                  onChange={(e) => setEditConfigPassword(e.target.value)}
                  placeholder="Leave empty to keep current password"
                  className="pr-10"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowEditPassword(!showEditPassword)}
                >
                  {showEditPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div>
              <Label>Role</Label>
              <Select value={editConfigRoleId} onValueChange={setEditConfigRoleId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  {(roles || []).map((role: any) => (
                    <SelectItem key={role.id} value={role.id}>
                      {role.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditConfigOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleEditConfigSubmit}
              disabled={editConfigMutation.isPending}
            >
              {editConfigMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
