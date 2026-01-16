import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { 
  Loader2, Plus, Trash2, Edit, Upload, 
  Globe, FileSpreadsheet, Clock,
  ArrowLeft, Save
} from "lucide-react";

interface ApiRoute {
  id: string;
  name: string;
  description?: string;
  endpoint?: string;
  method: string;
  sourceType: string;
  csvFilePath?: string;
  csvUrl?: string;
  headers?: Record<string, string>;
  isActive: boolean;
  status: string;
  syncEnabled: boolean;
  syncIntervalHours: number;
  syncIntervalMinutes: number;
  syncSchedule?: string;
  lastSyncAt?: string;
  lastSyncStatus?: string;
  lastTestAt?: string;
  lastTestStatus?: string;
  createdAt: string;
}

type ViewMode = "list" | "form";

export default function ApiRoutingPage() {
  const { token, hasPolicy } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [editingRoute, setEditingRoute] = useState<ApiRoute | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    endpoint: "",
    method: "GET",
    sourceType: "api",
    csvFilePath: "",
    csvUrl: "",
    headers: "",
    syncEnabled: true,
    syncIntervalHours: "0",
    syncIntervalMinutes: "10",
  });

  const { data: routes, isLoading } = useQuery<ApiRoute[]>({
    queryKey: ["api-routes"],
    queryFn: async () => {
      const res = await fetch("/api/admin/routing", {
        headers: { "X-Session-Id": token },
      });
      if (!res.ok) throw new Error("Failed to fetch routes");
      return res.json();
    },
    enabled: !!token && hasPolicy("admin.panel"),
  });

  const createRouteMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const payload = {
        ...data,
        headers: data.headers ? JSON.parse(data.headers) : null,
        syncIntervalHours: parseInt(data.syncIntervalHours) || 0,
        syncIntervalMinutes: parseInt(data.syncIntervalMinutes) || 10,
      };
      const res = await fetch("/api/admin/routing", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Session-Id": token,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to create route");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Data source created successfully" });
      queryClient.invalidateQueries({ queryKey: ["api-routes"] });
      setViewMode("list");
      resetForm();
    },
    onError: (error: Error) => {
      toast({ title: error.message, variant: "destructive" });
    },
  });

  const updateRouteMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<ApiRoute> }) => {
      const res = await fetch(`/api/admin/routing/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Session-Id": token,
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update route");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Data source updated successfully" });
      queryClient.invalidateQueries({ queryKey: ["api-routes"] });
      setViewMode("list");
      setEditingRoute(null);
      resetForm();
    },
    onError: () => {
      toast({ title: "Failed to update data source", variant: "destructive" });
    },
  });

  const deleteRouteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/routing/${id}`, {
        method: "DELETE",
        headers: { "X-Session-Id": token },
      });
      if (!res.ok) throw new Error("Failed to delete route");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Data source deleted successfully" });
      queryClient.invalidateQueries({ queryKey: ["api-routes"] });
    },
    onError: () => {
      toast({ title: "Failed to delete data source", variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      endpoint: "",
      method: "GET",
      sourceType: "api",
      csvFilePath: "",
      csvUrl: "",
      headers: "",
      syncEnabled: true,
      syncIntervalHours: "0",
      syncIntervalMinutes: "10",
    });
  };

  const handleEdit = (route: ApiRoute) => {
    setEditingRoute(route);
    setFormData({
      name: route.name,
      description: route.description || "",
      endpoint: route.endpoint || "",
      method: route.method,
      sourceType: route.sourceType,
      csvFilePath: route.csvFilePath || "",
      csvUrl: route.csvUrl || "",
      headers: route.headers ? JSON.stringify(route.headers, null, 2) : "",
      syncEnabled: route.syncEnabled,
      syncIntervalHours: route.syncIntervalHours?.toString() || "0",
      syncIntervalMinutes: route.syncIntervalMinutes?.toString() || "10",
    });
    setViewMode("form");
  };

  const handleAddNew = () => {
    setEditingRoute(null);
    resetForm();
    setViewMode("form");
  };

  const handleCancel = () => {
    setViewMode("list");
    setEditingRoute(null);
    resetForm();
  };

  const handleSubmit = () => {
    if (editingRoute) {
      updateRouteMutation.mutate({ 
        id: editingRoute.id, 
        data: {
          ...formData,
          headers: formData.headers ? JSON.parse(formData.headers) : null,
          syncIntervalHours: parseInt(formData.syncIntervalHours) || 0,
          syncIntervalMinutes: parseInt(formData.syncIntervalMinutes) || 10,
        } as any
      });
    } else {
      createRouteMutation.mutate(formData);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const formDataUpload = new FormData();
      formDataUpload.append("file", file);

      const res = await fetch("/api/admin/upload", {
        method: "POST",
        headers: {
          "X-Session-Id": token,
        },
        body: formDataUpload,
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to upload file");
      }

      const result = await res.json();
      setFormData(prev => ({ ...prev, csvFilePath: result.filePath }));
      toast({ title: "File uploaded successfully" });
    } catch (error: any) {
      toast({ title: error.message || "Failed to upload file", variant: "destructive" });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const formatSyncInterval = (hours: number, minutes: number): string => {
    if (hours > 0 && minutes > 0) {
      return `${hours}h ${minutes}m`;
    } else if (hours > 0) {
      return `${hours}h`;
    } else {
      return `${minutes}m`;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge className="bg-emerald-100 text-emerald-700">Active</Badge>;
      case "tested":
        return <Badge className="bg-blue-100 text-blue-700">Tested</Badge>;
      default:
        return <Badge variant="outline">Draft</Badge>;
    }
  };

  if (!hasPolicy("admin.panel")) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">You don't have permission to access this page.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (viewMode === "form") {
    return (
      <>
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" onClick={handleCancel}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              {editingRoute ? "Edit Data Source" : "Add Data Source"}
            </h1>
            <p className="text-muted-foreground mt-1">
              Configure an API endpoint or CSV file as a data source.
            </p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Basic Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="name">Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., Employee Sync"
                  />
                </div>
                
                <div className="grid gap-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="What does this data source do?"
                    rows={2}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Source Configuration</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2">
                  <Label>Source Type *</Label>
                  <div className="grid grid-cols-2 gap-4">
                    <div 
                      className={`p-4 border rounded-lg cursor-pointer transition-all ${
                        formData.sourceType === "api" 
                          ? "border-primary bg-primary/5 ring-2 ring-primary/20" 
                          : "hover:border-muted-foreground/50"
                      }`}
                      onClick={() => setFormData({ ...formData, sourceType: "api" })}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                          formData.sourceType === "api" ? "bg-blue-100 text-blue-600" : "bg-muted"
                        }`}>
                          <Globe className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="font-medium">API Endpoint</p>
                          <p className="text-xs text-muted-foreground">Fetch from REST API</p>
                        </div>
                      </div>
                    </div>
                    <div 
                      className={`p-4 border rounded-lg cursor-pointer transition-all ${
                        formData.sourceType === "csv" 
                          ? "border-primary bg-primary/5 ring-2 ring-primary/20" 
                          : "hover:border-muted-foreground/50"
                      }`}
                      onClick={() => setFormData({ ...formData, sourceType: "csv" })}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                          formData.sourceType === "csv" ? "bg-green-100 text-green-600" : "bg-muted"
                        }`}>
                          <FileSpreadsheet className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="font-medium">CSV File</p>
                          <p className="text-xs text-muted-foreground">Import from CSV</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {formData.sourceType === "api" ? (
                  <>
                    <div className="grid sm:grid-cols-4 gap-4">
                      <div className="sm:col-span-1">
                        <Label>Method</Label>
                        <Select
                          value={formData.method}
                          onValueChange={(value) => setFormData({ ...formData, method: value })}
                        >
                          <SelectTrigger className="mt-2">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="GET">GET</SelectItem>
                            <SelectItem value="POST">POST</SelectItem>
                            <SelectItem value="PUT">PUT</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="sm:col-span-3">
                        <Label>Endpoint URL *</Label>
                        <Input
                          className="mt-2"
                          value={formData.endpoint}
                          onChange={(e) => setFormData({ ...formData, endpoint: e.target.value })}
                          placeholder="https://api.example.com/data"
                        />
                      </div>
                    </div>
                    
                    <div className="grid gap-2">
                      <Label>Headers (JSON)</Label>
                      <Textarea
                        value={formData.headers}
                        onChange={(e) => setFormData({ ...formData, headers: e.target.value })}
                        placeholder='{"X-Session-Id": "session_id_here"}'
                        rows={3}
                        className="font-mono text-sm"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="grid gap-2">
                      <Label>CSV File Path</Label>
                      <div className="flex gap-2">
                        <Input
                          value={formData.csvFilePath}
                          onChange={(e) => setFormData({ ...formData, csvFilePath: e.target.value })}
                          placeholder="/uploads/data.csv"
                        />
                        <input
                          type="file"
                          ref={fileInputRef}
                          onChange={handleFileUpload}
                          accept=".csv,.json,.xlsx,.xls"
                          className="hidden"
                        />
                        <Button 
                          variant="outline" 
                          className="gap-2 shrink-0" 
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={isUploading}
                        >
                          {isUploading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Upload className="h-4 w-4" />
                          )}
                          {isUploading ? "Uploading..." : "Upload"}
                        </Button>
                      </div>
                    </div>
                    
                    <div className="relative">
                      <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t" />
                      </div>
                      <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-background px-2 text-muted-foreground">Or</span>
                      </div>
                    </div>
                    
                    <div className="grid gap-2">
                      <Label>CSV URL</Label>
                      <Input
                        value={formData.csvUrl}
                        onChange={(e) => setFormData({ ...formData, csvUrl: e.target.value })}
                        placeholder="https://example.com/data.csv"
                      />
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Sync Schedule
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Auto Sync</Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Sync automatically
                    </p>
                  </div>
                  <Switch
                    checked={formData.syncEnabled}
                    onCheckedChange={(checked) => setFormData({ ...formData, syncEnabled: checked })}
                  />
                </div>
                
                {formData.syncEnabled && (
                  <div className="space-y-3 pt-4 border-t">
                    <Label>Interval</Label>
                    <div className="flex items-center gap-2">
                      <Select 
                        value={formData.syncIntervalHours} 
                        onValueChange={(value) => setFormData({ ...formData, syncIntervalHours: value })}
                      >
                        <SelectTrigger className="w-20">
                          <SelectValue placeholder="HH" />
                        </SelectTrigger>
                        <SelectContent className="max-h-48 overflow-y-auto">
                          {Array.from({ length: 24 }, (_, i) => (
                            <SelectItem key={i} value={i.toString()}>
                              {i.toString().padStart(2, "0")}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <span className="text-sm text-muted-foreground">h</span>
                      <Select 
                        value={formData.syncIntervalMinutes} 
                        onValueChange={(value) => setFormData({ ...formData, syncIntervalMinutes: value })}
                      >
                        <SelectTrigger className="w-20">
                          <SelectValue placeholder="MM" />
                        </SelectTrigger>
                        <SelectContent className="max-h-48 overflow-y-auto">
                          {Array.from({ length: 60 }, (_, i) => (
                            <SelectItem key={i} value={i.toString()}>
                              {i.toString().padStart(2, "0")}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <span className="text-sm text-muted-foreground">m</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="flex flex-col gap-2">
              <Button 
                onClick={handleSubmit} 
                disabled={createRouteMutation.isPending || updateRouteMutation.isPending || !formData.name}
                className="gap-2"
              >
                {(createRouteMutation.isPending || updateRouteMutation.isPending) ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {editingRoute ? "Update" : "Create"} Data Source
              </Button>
              <Button variant="outline" onClick={handleCancel}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">API Routing</h1>
          <p className="text-muted-foreground mt-1">
            Create data sources here. Test them in Master Settings.
          </p>
        </div>
        <Button className="gap-2" onClick={handleAddNew}>
          <Plus className="h-4 w-4" />
          Add Data Source
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {routes && routes.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="w-[80px]">Type</TableHead>
                  <TableHead className="w-[80px]">Status</TableHead>
                  <TableHead className="w-[100px]">Schedule</TableHead>
                  <TableHead className="w-[80px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {routes.map((route) => (
                  <TableRow key={route.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{route.name}</p>
                        {route.description && (
                          <p className="text-xs text-muted-foreground truncate max-w-[250px]">
                            {route.description}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="gap-1 text-xs">
                        {route.sourceType === "api" ? (
                          <><Globe className="h-3 w-3" /> API</>
                        ) : (
                          <><FileSpreadsheet className="h-3 w-3" /> CSV</>
                        )}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(route.status || "draft")}
                    </TableCell>
                    <TableCell>
                      {route.syncEnabled ? (
                        <div className="flex items-center gap-1 text-xs">
                          <Clock className="h-3 w-3" />
                          {formatSyncInterval(route.syncIntervalHours || 0, route.syncIntervalMinutes || 10)}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Manual</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(route)}
                          title="Edit"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (confirm("Delete this data source?")) {
                              deleteRouteMutation.mutate(route.id);
                            }
                          }}
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="py-16 text-center">
              <Globe className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No Data Sources</h3>
              <p className="text-muted-foreground mb-4">
                Create your first data source to start importing data.
              </p>
              <Button className="gap-2" onClick={handleAddNew}>
                <Plus className="h-4 w-4" />
                Add Data Source
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
