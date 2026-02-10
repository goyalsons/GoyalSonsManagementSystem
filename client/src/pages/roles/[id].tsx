import { useLocation, useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowLeft, Shield, Save, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { rolesApi, policiesApi } from "@/lib/api";
import { GroupedPolicySelector } from "@/components/GroupedPolicySelector";

interface Policy {
  id: string;
  key: string;
  description: string | null;
  category: string | null;
  isActive: boolean;
}

export default function EditRolePage() {
  const [, params] = useRoute("/roles/:id");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedPolicyIds, setSelectedPolicyIds] = useState<Set<string>>(new Set());

  const roleId = params?.id;

  // Fetch role data
  const { data: role, isLoading: roleLoading } = useQuery({
    queryKey: ["role", roleId],
    queryFn: () => rolesApi.getById(roleId!),
    enabled: !!roleId,
  });

  // Fetch all policies from DB
  const { data: policies = [], isLoading: policiesLoading } = useQuery<Policy[]>({
    queryKey: ["policies"],
    queryFn: () => policiesApi.getAll(),
  });

  // Initialize selected policies when role data loads
  useEffect(() => {
    if (role?.policies) {
      setSelectedPolicyIds(new Set(role.policies.map((p: Policy) => p.id)));
    }
  }, [role]);

  // Update role mutation
  const updateRoleMutation = useMutation({
    mutationFn: (policyIds: string[]) =>
      rolesApi.update(roleId!, { policyIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["role", roleId] });
      queryClient.invalidateQueries({ queryKey: ["roles"] });
      toast({
        title: "Permissions updated",
        description: `Policies for ${role?.name} have been saved.`,
      });
      setLocation("/roles");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update role permissions",
        variant: "destructive",
      });
    },
  });

  const handlePolicyToggle = (policyId: string) => {
    setSelectedPolicyIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(policyId)) {
        newSet.delete(policyId);
      } else {
        newSet.add(policyId);
      }
      return newSet;
    });
  };

  const handleSave = () => {
    if (!roleId) return;
    updateRoleMutation.mutate(Array.from(selectedPolicyIds));
  };

  if (roleLoading || policiesLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!role) {
    return (
      <div className="max-w-3xl mx-auto">
        <Card>
          <CardContent className="pt-6">
            <p>Role not found</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isDirectorLocked = role.name === "Director";
  const policyOptions = policies.map((p) => ({
    id: p.id,
    key: p.key,
    description: p.description,
  }));

  return (
    <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/roles")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {isDirectorLocked ? `${role.name} – System Role (locked)` : `Edit Permissions: ${role.name}`}
            </h1>
            <p className="text-muted-foreground text-sm">
              {isDirectorLocked
                ? "This role has all policies and cannot be edited."
                : "Configure what users with this role can access."}
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              <CardTitle>Policy Configuration</CardTitle>
            </div>
            <CardDescription>
              {isDirectorLocked
                ? "Director has full access. Policies are managed by the system."
                : "Use groups and templates to configure access. Expand a group for granular policies."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {!isDirectorLocked && (
              <GroupedPolicySelector
                policies={policyOptions}
                selectedPolicyIds={selectedPolicyIds}
                onSelectionChange={setSelectedPolicyIds}
                disabled={isDirectorLocked}
                showTemplates={true}
              />
            )}

            <div className="flex justify-end gap-4 pt-4 border-t">
              <Button variant="outline" onClick={() => setLocation("/roles")}>
                Cancel
              </Button>
              {!isDirectorLocked && (
                <Button
                  onClick={handleSave}
                  disabled={updateRoleMutation.isPending}
                  className="gap-2"
                >
                  {updateRoleMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Save Changes
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
  );
}
