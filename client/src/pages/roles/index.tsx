import { useState, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { ArrowLeft, Shield, Users, Lock, Edit, KeyRound, Loader2, CreditCard, X, CheckSquare, Settings2, Search, Eye, EyeOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { rolesApi, usersApi, employeesApi } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

export default function RolesPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [configListOpen, setConfigListOpen] = useState(false);
  const [configListSearch, setConfigListSearch] = useState("");
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

  // Fetch roles from API
  const { data: roles = [], isLoading: rolesLoading } = useQuery({
    queryKey: ["roles"],
    queryFn: () => rolesApi.getAll(),
  });

  const { data: employeesResponse } = useQuery({
    queryKey: ["employees", "all-active-for-config"],
    queryFn: () => employeesApi.getAll({ statusFilter: "ACTIVE" }),
    staleTime: 60000,
    enabled: addConfigOpen,
  });

  const allActiveEmployees = employeesResponse?.data || [];

  const configCardFilteredEmployees = useMemo(() => {
    if (!allActiveEmployees.length) return [];
    const q = configCardSearch.toLowerCase().trim();
    return allActiveEmployees
      .filter((emp: any) => !!emp.cardNumber)
      .filter((emp: any) => {
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
      .filter((emp: any) => !!emp.cardNumber)
      .filter((emp: any) => {
        if (!q) return true;
        const fullName = `${emp.firstName} ${emp.lastName || ""}`.toLowerCase();
        return (
          emp.cardNumber!.toLowerCase().includes(q) ||
          fullName.includes(q)
        );
      })
      .slice(0, 50);
  }, [allActiveEmployees, editCardSearch]);

  // Configuration list: fetch credential-based users
  const { data: configUsersData, isLoading: configUsersLoading } = useQuery({
    queryKey: ["users", "credentials", configListSearch],
    queryFn: () => usersApi.getList({ limit: 100, credentialsOnly: true, search: configListSearch || undefined }),
    enabled: configListOpen,
    staleTime: 10000,
  });

  const configUsers = configUsersData?.users || [];

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

  const editConfigMutation = useMutation({
    mutationFn: async ({ userId, name, password, roleId, employeeCardNo }: { userId: string; name?: string; password?: string; roleId?: string; employeeCardNo?: string }) => {
      const promises: Promise<any>[] = [];
      const updateData: any = {};
      if (name) updateData.name = name;
      if (employeeCardNo !== undefined) updateData.employeeCardNo = employeeCardNo;
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
    editConfigMutation.mutate({
      userId: editConfigUserId,
      name: editConfigName || undefined,
      password: editConfigPassword || undefined,
      roleId: editConfigRoleId || undefined,
      employeeCardNo: editConfigCardNo,
    });
  };

  const createCredentialsMutation = useMutation({
    mutationFn: (data: { email: string; password: string; name?: string; roleId: string; employeeCardNo?: string }) =>
      usersApi.createCredentials(data),
    onSuccess: (data) => {
      const linkedMsg = data.linkedEmployee ? ` Linked to employee card: ${data.linkedEmployee.cardNumber}` : "";
      toast({
        title: "Configuration created",
        description: `${data.user.email} can now login with the selected role (${data.role.name}).${linkedMsg}`,
      });
      queryClient.invalidateQueries({ queryKey: ["roles"] });
      queryClient.invalidateQueries({ queryKey: ["users"] });
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

  const handleRoleCardClick = (roleName: string) => {
    if (roleName === "Manager") {
      setLocation("/roles/manager/assign");
    }
  };

  return (
    <>
      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <Link href="/roles-assigned">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Roles & Permissions</h1>
            <p className="text-muted-foreground mt-1">
              Define what users can see and do in the system.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setConfigListOpen(true)} className="gap-2">
            <Settings2 className="h-4 w-4" />
            Configuration
          </Button>
          <Button onClick={() => setAddConfigOpen(true)} className="gap-2">
            <KeyRound className="h-4 w-4" />
            Add Configuration
          </Button>
        </div>
      </div>

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
                          const emp = allActiveEmployees.find((e: any) => e.cardNumber === configEmployeeCardNo);
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
                        {configCardFilteredEmployees.map((emp: any) => (
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

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {rolesLoading ? (
          <div className="col-span-full text-center py-8 text-muted-foreground">
            Loading roles...
          </div>
        ) : (
          <>
            {roles.map((role: any) => (
              <Card 
                key={role.id} 
                className={`flex flex-col ${role.name === "Manager" ? "cursor-pointer hover:shadow-lg transition-shadow" : ""}`}
                onClick={() => handleRoleCardClick(role.name)}
              >
                <CardHeader>
                  <div className="flex items-center justify-between mb-2">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                      <Shield className="h-5 w-5" />
                    </div>
                    <Badge variant="secondary" className="font-normal">
                      {role.userCount || 0} Users
                    </Badge>
                  </div>
                  <CardTitle>{role.name}</CardTitle>
                  <CardDescription>{role.description || "No description"}</CardDescription>
                </CardHeader>
                <CardContent className="flex-1">
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Lock className="h-3 w-3" />
                      <span>Access Level: {role.name === "Admin" ? "Full" : "Limited"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Users className="h-3 w-3" />
                      <span>Assignable to users</span>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="border-t pt-4 bg-muted/20">
                  {role.name === "Manager" ? (
                    <Button variant="outline" className="w-full gap-2">
                      <Edit className="h-3 w-3" />
                      Assign Manager
                    </Button>
                  ) : (
                    <Link href={`/roles/${role.id}`} className="w-full">
                      <Button variant="outline" className="w-full gap-2">
                        <Edit className="h-3 w-3" />
                        Edit Permissions
                      </Button>
                    </Link>
                  )}
                </CardFooter>
              </Card>
            ))}
            
            <Card className="flex flex-col border-dashed items-center justify-center bg-muted/10 hover:bg-muted/20 transition-colors cursor-pointer min-h-[250px]">
              <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
                 <Shield className="h-6 w-6 text-muted-foreground" />
              </div>
              <h3 className="font-semibold text-lg mb-1">Create Custom Role</h3>
              <p className="text-sm text-muted-foreground text-center px-6">
                Define a new set of permissions for specific use cases.
              </p>
              <Button variant="link" className="mt-2 text-primary">
                + Create Role
              </Button>
            </Card>
          </>
        )}
      </div>

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
                          const emp = allActiveEmployees.find((e: any) => e.cardNumber === editConfigCardNo);
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
                        {editCardFilteredEmployees.map((emp: any) => (
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
              <Input value={editConfigEmail} disabled className="mt-1 bg-muted" />
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
    </>
  );
}
