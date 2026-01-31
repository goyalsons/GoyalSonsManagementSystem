import { useState } from "react";
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
import { ArrowLeft, Shield, Users, Lock, Edit, KeyRound, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { rolesApi, usersApi } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

export default function RolesPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [addConfigOpen, setAddConfigOpen] = useState(false);
  const [configEmail, setConfigEmail] = useState("");
  const [configPassword, setConfigPassword] = useState("");
  const [configConfirmPassword, setConfigConfirmPassword] = useState("");
  const [configName, setConfigName] = useState("");
  const [configRoleId, setConfigRoleId] = useState<string>("");

  // Fetch roles from API
  const { data: roles = [], isLoading: rolesLoading } = useQuery({
    queryKey: ["roles"],
    queryFn: () => rolesApi.getAll(),
  });

  const createCredentialsMutation = useMutation({
    mutationFn: (data: { email: string; password: string; name?: string; roleId: string }) =>
      usersApi.createCredentials(data),
    onSuccess: (data) => {
      toast({
        title: "Configuration created",
        description: `${data.user.email} can now login with the selected role (${data.role.name}).`,
      });
      queryClient.invalidateQueries({ queryKey: ["roles"] });
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setAddConfigOpen(false);
      setConfigEmail("");
      setConfigPassword("");
      setConfigConfirmPassword("");
      setConfigName("");
      setConfigRoleId("");
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
        <Button onClick={() => setAddConfigOpen(true)} className="gap-2">
          <KeyRound className="h-4 w-4" />
          Add Configuration
        </Button>
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
              <Input
                id="config-password"
                type="password"
                placeholder="Min 8 characters"
                value={configPassword}
                onChange={(e) => setConfigPassword(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="config-confirm">Confirm Password</Label>
              <Input
                id="config-confirm"
                type="password"
                placeholder="Repeat password"
                value={configConfirmPassword}
                onChange={(e) => setConfigConfirmPassword(e.target.value)}
              />
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
    </>
  );
}
