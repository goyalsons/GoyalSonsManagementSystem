import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { rolesApi, policiesApi } from "@/lib/api";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Loader2, Pencil, Shield } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PageGuard } from "@/components/PageGuard";
import { Checkbox } from "@/components/ui/checkbox";

interface Policy {
  id: string;
  key: string;
  description: string | null;
  category: string | null;
}

export default function RolesManagementPage() {
  const [editRole, setEditRole] = useState<{ id: string; name: string; description: string | null } | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [policiesOpen, setPoliciesOpen] = useState<{ id: string; name: string } | null>(null);
  const [selectedPolicyIds, setSelectedPolicyIds] = useState<Set<string>>(new Set());

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: roles = [], isLoading: rolesLoading } = useQuery({
    queryKey: ["roles"],
    queryFn: () => rolesApi.getAll(),
  });

  const { data: allPolicies = [] } = useQuery({
    queryKey: ["policies"],
    queryFn: () => policiesApi.getAll(),
  });

  const { data: roleDetails } = useQuery({
    queryKey: ["role", policiesOpen?.id],
    queryFn: () => rolesApi.getById(policiesOpen!.id),
    enabled: !!policiesOpen?.id,
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({
      id,
      name,
      description,
      policyIds,
    }: {
      id: string;
      name?: string;
      description?: string;
      policyIds?: string[];
    }) => rolesApi.update(id, { name, description, policyIds }),
    onSuccess: () => {
      toast({ title: "Role updated" });
      setEditRole(null);
      setPoliciesOpen(null);
      queryClient.invalidateQueries({ queryKey: ["roles"] });
      queryClient.invalidateQueries({ queryKey: ["role"] });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update role", description: err.message, variant: "destructive" });
    },
  });

  const policiesByGroup = (allPolicies as Policy[]).reduce<Record<string, Policy[]>>((acc, p) => {
    const g = p.category || "other";
    if (!acc[g]) acc[g] = [];
    acc[g].push(p);
    return acc;
  }, {});

  const openPolicies = (role: { id: string; name: string }) => {
    setPoliciesOpen(role);
    setSelectedPolicyIds(new Set());
  };

  useEffect(() => {
    if (policiesOpen && roleDetails && roleDetails.id === policiesOpen.id && roleDetails.policies) {
      setSelectedPolicyIds(new Set(roleDetails.policies.map((p: Policy) => p.id)));
    }
  }, [policiesOpen?.id, roleDetails]);

  return (
    <PageGuard policy="VIEW_ROLES">
      <div className="space-y-6 p-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Roles</h1>
          <p className="text-muted-foreground">Manage roles and their permissions.</p>
        </div>

        <div className="rounded-md border">
          {rolesLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Users</TableHead>
                  <TableHead className="w-[180px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(roles as any[]).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-muted-foreground max-w-md truncate">
                      {r.description ?? "—"}
                    </TableCell>
                    <TableCell>{r.userCount ?? r._count?.users ?? 0}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditRole({ id: r.id, name: r.name, description: r.description ?? null });
                            setEditName(r.name);
                            setEditDescription(r.description ?? "");
                          }}
                        >
                          <Pencil className="h-4 w-4 mr-1" />
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openPolicies({ id: r.id, name: r.name })}
                        >
                          <Shield className="h-4 w-4 mr-1" />
                          Policies
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {/* Edit role name/description */}
        <Dialog open={!!editRole} onOpenChange={(open) => !open && setEditRole(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Role</DialogTitle>
              <DialogDescription>Update role name and description.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label>Name</Label>
                <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label>Description</Label>
                <Input
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Optional"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditRole(null)}>
                Cancel
              </Button>
              <Button
                disabled={updateRoleMutation.isPending || !editName.trim()}
                onClick={() =>
                  editRole &&
                  updateRoleMutation.mutate({
                    id: editRole.id,
                    name: editName.trim(),
                    description: editDescription.trim() || undefined,
                  })
                }
              >
                {updateRoleMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit role policies */}
        <Dialog open={!!policiesOpen} onOpenChange={(open) => !open && setPoliciesOpen(null)}>
          <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit policies: {policiesOpen?.name}</DialogTitle>
              <DialogDescription>Select the policies assigned to this role.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              {Object.entries(policiesByGroup).map(([group, list]) => (
                <div key={group}>
                  <Label className="text-muted-foreground capitalize">{group}</Label>
                  <div className="mt-2 space-y-2 pl-2">
                    {list.map((p) => (
                      <div key={p.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={p.id}
                          checked={selectedPolicyIds.has(p.id)}
                          onCheckedChange={(checked) => {
                            setSelectedPolicyIds((prev) => {
                              const next = new Set(prev);
                              if (checked) next.add(p.id);
                              else next.delete(p.id);
                              return next;
                            });
                          }}
                        />
                        <label
                          htmlFor={p.id}
                          className="text-sm font-medium leading-none cursor-pointer"
                        >
                          {p.key}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPoliciesOpen(null)}>
                Cancel
              </Button>
              <Button
                disabled={updateRoleMutation.isPending || !policiesOpen}
                onClick={() =>
                  policiesOpen &&
                  updateRoleMutation.mutate({
                    id: policiesOpen.id,
                    policyIds: Array.from(selectedPolicyIds),
                  })
                }
              >
                {updateRoleMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PageGuard>
  );
}
