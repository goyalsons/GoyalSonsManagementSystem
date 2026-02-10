import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { policiesApi } from "@/lib/api";
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
import { Loader2, Pencil, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PageGuard } from "@/components/PageGuard";
import { useAuth } from "@/lib/auth-context";

interface Policy {
  id: string;
  key: string;
  description: string | null;
  category: string | null;
}

export default function PoliciesManagementPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [editPolicy, setEditPolicy] = useState<Policy | null>(null);
  const [createKey, setCreateKey] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createCategory, setCreateCategory] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editCategory, setEditCategory] = useState("");

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  const { data: policiesData, isLoading } = useQuery({
    queryKey: ["policies"],
    queryFn: () => policiesApi.getAll(),
  });

  const policies = Array.isArray(policiesData) ? policiesData : [];

  const createMutation = useMutation({
    mutationFn: (data: { key: string; description?: string; category?: string }) =>
      policiesApi.create(data),
    onSuccess: () => {
      toast({ title: "Policy created" });
      setCreateOpen(false);
      setCreateKey("");
      setCreateDescription("");
      setCreateCategory("");
      queryClient.invalidateQueries({ queryKey: ["policies"] });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create policy", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, description, category }: { id: string; description?: string; category?: string }) =>
      policiesApi.update(id, { description, category }),
    onSuccess: () => {
      toast({ title: "Policy updated" });
      setEditPolicy(null);
      queryClient.invalidateQueries({ queryKey: ["policies"] });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update policy", description: err.message, variant: "destructive" });
    },
  });

  const canCreate = user?.policies?.includes("CREATE_POLICY") ?? false;
  const canEdit = user?.policies?.includes("EDIT_POLICY") ?? false;

  const byCategory = (policies as Policy[]).reduce<Record<string, Policy[]>>((acc, p) => {
    const g = p.category || "other";
    if (!acc[g]) acc[g] = [];
    acc[g].push(p);
    return acc;
  });

  return (
    <PageGuard policy="VIEW_POLICIES">
      <div className="space-y-6 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Policies</h1>
            <p className="text-muted-foreground">Manage permission policies and assign them to roles.</p>
          </div>
          {canCreate && (
            <Button onClick={() => setCreateOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Create Policy
            </Button>
          )}
        </div>

        <div className="rounded-md border">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Key</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Group</TableHead>
                  {canEdit && <TableHead className="w-[100px]" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(byCategory).map(([group, list]) =>
                  list.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-sm">{p.key}</TableCell>
                      <TableCell className="text-muted-foreground max-w-md truncate">
                        {p.description ?? "—"}
                      </TableCell>
                      <TableCell className="capitalize">{p.category ?? "—"}</TableCell>
                      {canEdit && (
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditPolicy(p);
                              setEditDescription(p.description ?? "");
                              setEditCategory(p.category ?? "");
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </div>

        {/* Create policy - key must be from allowlist on backend */}
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Policy</DialogTitle>
              <DialogDescription>
                Add a new policy key. Key must match allowed format (e.g. resource.action or UPPER_SNAKE).
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label>Key</Label>
                <Input
                  placeholder="e.g. VIEW_REPORTS"
                  value={createKey}
                  onChange={(e) => setCreateKey(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label>Description (optional)</Label>
                <Input
                  value={createDescription}
                  onChange={(e) => setCreateDescription(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label>Category / Group (optional)</Label>
                <Input
                  placeholder="e.g. pages, actions"
                  value={createCategory}
                  onChange={(e) => setCreateCategory(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button
                disabled={!createKey.trim() || createMutation.isPending}
                onClick={() =>
                  createMutation.mutate({
                    key: createKey.trim(),
                    description: createDescription.trim() || undefined,
                    category: createCategory.trim() || undefined,
                  })
                }
              >
                {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit policy */}
        <Dialog open={!!editPolicy} onOpenChange={(open) => !open && setEditPolicy(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Policy</DialogTitle>
              <DialogDescription>Update description and category for {editPolicy?.key}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label>Key (read-only)</Label>
                <Input value={editPolicy?.key ?? ""} disabled className="font-mono" />
              </div>
              <div className="grid gap-2">
                <Label>Description</Label>
                <Input
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label>Category / Group</Label>
                <Input
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditPolicy(null)}>
                Cancel
              </Button>
              <Button
                disabled={updateMutation.isPending}
                onClick={() =>
                  editPolicy &&
                  updateMutation.mutate({
                    id: editPolicy.id,
                    description: editDescription,
                    category: editCategory,
                  })
                }
              >
                {updateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PageGuard>
  );
}
