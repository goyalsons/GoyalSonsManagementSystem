/**
 * Admin Page Management UI
 * 
 * Allows admins to:
 * - Create new UI pages
 * - Auto-generate policies for pages
 * - Manage page visibility and order
 * - Add custom actions to pages
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit, Trash2, Loader2, Eye, EyeOff } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface Page {
  id: string;
  pageKey: string;
  pageName: string;
  path: string;
  policyPrefix: string;
  autoGenerate: boolean;
  icon?: string;
  order: number;
  isActive: boolean;
  policies: Array<{
    id: string;
    key: string;
    description: string;
  }>;
}

export default function PagesManagementPage() {
  const { token, hasPolicy } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    pageKey: "",
    pageName: "",
    path: "",
    policyPrefix: "",
    autoGenerate: true,
    icon: "",
    order: 0,
    actions: [] as Array<{ name: string; policyKey: string; description: string }>,
  });

  // Fetch all pages
  const { data: pages = [], isLoading } = useQuery<Page[]>({
    queryKey: ["pages"],
    queryFn: async () => {
      const res = await fetch("/api/pages", {
        headers: { "X-Session-Id": token },
      });
      if (!res.ok) throw new Error("Failed to fetch pages");
      return res.json();
    },
    enabled: !!token && hasPolicy("admin.panel"),
  });

  // Create page mutation
  const createPageMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch("/api/pages", {
        method: "POST",
        headers: {
          "X-Session-Id": token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to create page");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pages"] });
      setIsCreateDialogOpen(false);
      setFormData({
        pageKey: "",
        pageName: "",
        path: "",
        policyPrefix: "",
        autoGenerate: true,
        icon: "",
        order: 0,
        actions: [],
      });
      toast({
        title: "Page created",
        description: "New page and policies have been created successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create page",
        variant: "destructive",
      });
    },
  });

  // Toggle page active status
  const togglePageStatusMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const res = await fetch(`/api/pages/${id}`, {
        method: "PUT",
        headers: {
          "X-Session-Id": token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ isActive }),
      });
      if (!res.ok) throw new Error("Failed to update page");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pages"] });
      toast({
        title: "Page updated",
        description: "Page status has been updated.",
      });
    },
  });

  const handleCreatePage = () => {
    if (!formData.pageKey || !formData.pageName || !formData.path || !formData.policyPrefix) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    createPageMutation.mutate({
      pageKey: formData.pageKey,
      pageName: formData.pageName,
      path: formData.path,
      policyPrefix: formData.policyPrefix,
      autoGenerate: formData.autoGenerate,
      icon: formData.icon || undefined,
      order: formData.order,
      actions: formData.actions.length > 0 ? formData.actions : undefined,
    });
  };

  const addAction = () => {
    setFormData({
      ...formData,
      actions: [
        ...formData.actions,
        { name: "", policyKey: "", description: "" },
      ],
    });
  };

  const updateAction = (index: number, field: string, value: string) => {
    const newActions = [...formData.actions];
    newActions[index] = { ...newActions[index], [field]: value };
    setFormData({ ...formData, actions: newActions });
  };

  if (!hasPolicy("admin.panel")) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-muted-foreground">You don't have permission to manage pages.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Page Management</h1>
          <p className="text-muted-foreground">
            Manage UI pages and auto-generate policies for them
          </p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Create Page
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Page</DialogTitle>
              <DialogDescription>
                Create a new UI page and auto-generate policies for it
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="pageKey">Page Key *</Label>
                  <Input
                    id="pageKey"
                    placeholder="help-tickets"
                    value={formData.pageKey}
                    onChange={(e) => setFormData({ ...formData, pageKey: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Unique identifier (lowercase, hyphens)
                  </p>
                </div>
                <div>
                  <Label htmlFor="pageName">Page Name *</Label>
                  <Input
                    id="pageName"
                    placeholder="Help Tickets"
                    value={formData.pageName}
                    onChange={(e) => setFormData({ ...formData, pageName: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="path">Path *</Label>
                  <Input
                    id="path"
                    placeholder="/help-tickets"
                    value={formData.path}
                    onChange={(e) => setFormData({ ...formData, path: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="policyPrefix">Policy Prefix *</Label>
                  <Input
                    id="policyPrefix"
                    placeholder="help_tickets"
                    value={formData.policyPrefix}
                    onChange={(e) => setFormData({ ...formData, policyPrefix: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Will generate: {formData.policyPrefix}.view, {formData.policyPrefix}.create, etc.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="icon">Icon</Label>
                  <Input
                    id="icon"
                    placeholder="HelpCircle"
                    value={formData.icon}
                    onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="order">Order</Label>
                  <Input
                    id="order"
                    type="number"
                    value={formData.order}
                    onChange={(e) => setFormData({ ...formData, order: parseInt(e.target.value) || 0 })}
                  />
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="autoGenerate"
                  checked={formData.autoGenerate}
                  onCheckedChange={(checked) => setFormData({ ...formData, autoGenerate: checked })}
                />
                <Label htmlFor="autoGenerate">Auto-generate policies</Label>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Custom Actions (optional)</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addAction}>
                    <Plus className="h-3 w-3 mr-1" />
                    Add Action
                  </Button>
                </div>
                {formData.actions.map((action, index) => (
                  <div key={index} className="grid grid-cols-3 gap-2 mb-2">
                    <Input
                      placeholder="Action name"
                      value={action.name}
                      onChange={(e) => updateAction(index, "name", e.target.value)}
                    />
                    <Input
                      placeholder="Policy key"
                      value={action.policyKey}
                      onChange={(e) => updateAction(index, "policyKey", e.target.value)}
                    />
                    <Input
                      placeholder="Description"
                      value={action.description}
                      onChange={(e) => updateAction(index, "description", e.target.value)}
                    />
                  </div>
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleCreatePage}
                disabled={createPageMutation.isPending}
              >
                {createPageMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : null}
                Create Page
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>All Pages</CardTitle>
            <CardDescription>
              {pages.length} page(s) configured
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Page Name</TableHead>
                  <TableHead>Path</TableHead>
                  <TableHead>Policy Prefix</TableHead>
                  <TableHead>Policies</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pages.map((page) => (
                  <TableRow key={page.id}>
                    <TableCell className="font-medium">{page.pageName}</TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-2 py-1 rounded">{page.path}</code>
                    </TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-2 py-1 rounded">{page.policyPrefix}</code>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {page.policies.slice(0, 3).map((policy) => (
                          <Badge key={policy.id} variant="secondary" className="text-xs">
                            {policy.key}
                          </Badge>
                        ))}
                        {page.policies.length > 3 && (
                          <Badge variant="outline" className="text-xs">
                            +{page.policies.length - 3}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          togglePageStatusMutation.mutate({
                            id: page.id,
                            isActive: !page.isActive,
                          })
                        }
                      >
                        {page.isActive ? (
                          <Eye className="h-4 w-4 text-green-600" />
                        ) : (
                          <EyeOff className="h-4 w-4 text-gray-400" />
                        )}
                      </Button>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm">
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
