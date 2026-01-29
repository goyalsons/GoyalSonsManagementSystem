import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { 
  Database, 
  RefreshCw, 
  Clock,
  CheckCircle,
  AlertCircle,
  Users,
  Loader2,
  Globe,
  FileSpreadsheet,
  Calendar,
  History,
  Trash2,
  ArrowRight
} from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import {
  Table as UITable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface DataImportLog {
  id: string;
  sourceName: string;
  sourceUrl?: string;
  status: string;
  recordsTotal: number;
  recordsImported: number;
  recordsFailed: number;
  errorMessage?: string;
  startedAt: string;
  completedAt?: string;
  metadata?: any;
}

interface ApiRoute {
  id: string;
  name: string;
  description?: string;
  endpoint?: string;
  method: string;
  sourceType: string;
  csvFilePath?: string;
  csvUrl?: string;
  headers?: any;
  status: string;
  syncEnabled: boolean;
  syncIntervalHours: number;
  syncIntervalMinutes: number;
  lastSyncAt?: string;
  lastSyncStatus?: string;
  syncProgressCurrent: number;
  syncProgressTotal: number;
  isActive: boolean;
  createdAt: string;
}

export default function FetchedDataPage() {
  const { token, hasPolicy } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("sources");
  const previousSyncStatus = useRef<Record<string, string>>({});

  const { data: allRoutes = [], isLoading: routesLoading } = useQuery<ApiRoute[]>({
    queryKey: ["api-routes"],
    queryFn: async () => {
      const res = await fetch("/api/admin/routing", {
        headers: { "X-Session-Id": token },
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!token && hasPolicy("integrations.fetched-data.view"),
    refetchInterval: (query) => {
      const routes = query.state.data as ApiRoute[] | undefined;
      const hasInProgress = routes?.some(r => r.lastSyncStatus === "in_progress");
      return hasInProgress ? 2000 : false;
    },
  });

  useEffect(() => {
    allRoutes.forEach(route => {
      const prevStatus = previousSyncStatus.current[route.id];
      if (prevStatus === "in_progress" && route.lastSyncStatus === "completed") {
        toast({
          title: "Sync Completed",
          description: `Syncing of "${route.name}" is done`,
        });
        queryClient.invalidateQueries({ queryKey: ["data-import-logs"] });
        queryClient.invalidateQueries({ queryKey: ["employees"] });
      } else if (prevStatus === "in_progress" && route.lastSyncStatus === "failed") {
        toast({
          title: "Sync Failed",
          description: `Syncing of "${route.name}" failed`,
          variant: "destructive",
        });
      }
      previousSyncStatus.current[route.id] = route.lastSyncStatus || "";
    });
  }, [allRoutes, toast, queryClient]);

  const activeRoutes = allRoutes.filter(route => route.status === "active");
  const syncingCount = allRoutes.filter(route => route.lastSyncStatus === "in_progress").length;

  const { data: importLogs = [], isLoading: logsLoading } = useQuery<DataImportLog[]>({
    queryKey: ["data-import-logs"],
    queryFn: async () => {
      const res = await fetch("/api/admin/data-fetcher/logs", {
        headers: { "X-Session-Id": token },
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!token,
  });

  const { data: employees = [] } = useQuery<any[]>({
    queryKey: ["employees"],
    queryFn: async () => {
      const res = await fetch("/api/employees", {
        headers: { "X-Session-Id": token },
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!token,
  });

  const syncRouteMutation = useMutation({
    mutationFn: async (routeId: string) => {
      const res = await fetch(`/api/admin/routing/${routeId}/sync`, {
        method: "POST",
        headers: { "X-Session-Id": token },
      });
      if (!res.ok) throw new Error("Sync failed");
      return res.json();
    },
    onSuccess: (data, routeId) => {
      const route = allRoutes.find(r => r.id === routeId);
      toast({ 
        title: "Sync Started", 
        description: `Syncing "${route?.name || 'data source'}" in background...`
      });
      queryClient.invalidateQueries({ queryKey: ["api-routes"] });
    },
    onError: () => {
      toast({ title: "Failed to start sync", variant: "destructive" });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const res = await fetch(`/api/admin/routing/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Session-Id": token,
        },
        body: JSON.stringify({ status: isActive ? "active" : "draft" }),
      });
      if (!res.ok) throw new Error("Update failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-routes"] });
    },
    onError: () => {
      toast({ title: "Failed to update status", variant: "destructive" });
    },
  });

  const updateScheduleMutation = useMutation({
    mutationFn: async ({ id, syncEnabled, syncIntervalHours, syncIntervalMinutes }: { 
      id: string; 
      syncEnabled?: boolean;
      syncIntervalHours?: number;
      syncIntervalMinutes?: number;
    }) => {
      const body: any = {};
      if (syncEnabled !== undefined) body.syncEnabled = syncEnabled;
      if (syncIntervalHours !== undefined) body.syncIntervalHours = syncIntervalHours;
      if (syncIntervalMinutes !== undefined) body.syncIntervalMinutes = syncIntervalMinutes;
      
      const res = await fetch(`/api/admin/routing/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Session-Id": token,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Update failed");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Schedule updated" });
      queryClient.invalidateQueries({ queryKey: ["api-routes"] });
    },
    onError: () => {
      toast({ title: "Failed to update schedule", variant: "destructive" });
    },
  });

  const clearHistoryMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/data-fetcher/logs", {
        method: "DELETE",
        headers: { "X-Session-Id": token },
      });
      if (!res.ok) throw new Error("Failed to clear history");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Sync history cleared" });
      queryClient.invalidateQueries({ queryKey: ["data-import-logs"] });
    },
    onError: () => {
      toast({ title: "Failed to clear history", variant: "destructive" });
    },
  });

  const formatSyncInterval = (hours: number, minutes: number): string => {
    if (hours > 0 && minutes > 0) {
      return `${hours}h ${minutes}m`;
    } else if (hours > 0) {
      return `${hours}h`;
    } else {
      return `${minutes}m`;
    }
  };

  const formatDuration = (startedAt: string, completedAt?: string) => {
    if (!completedAt) return "In progress...";
    const start = new Date(startedAt).getTime();
    const end = new Date(completedAt).getTime();
    const diff = end - start;
    if (diff < 1000) return `${diff}ms`;
    if (diff < 60000) return `${(diff / 1000).toFixed(1)}s`;
    return `${Math.floor(diff / 60000)}m ${Math.floor((diff % 60000) / 1000)}s`;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (!hasPolicy("integrations.fetched-data.view")) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">You don't have permission to access this page.</p>
      </div>
    );
  }

  return (
    <>
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Fetched Data</h1>
        <p className="text-muted-foreground mt-1">
          Monitor active sources and sync history
        </p>
      </div>

      {syncingCount > 0 && (
        <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-xl">
          <div className="flex items-center gap-3 mb-3">
            <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
            <p className="font-medium text-blue-800">Sync in Progress</p>
          </div>
          <div className="space-y-2">
            {allRoutes.filter(r => r.lastSyncStatus === "in_progress").map(route => (
              <div key={route.id} className="bg-white rounded-lg p-3 border border-blue-100">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-sm">{route.name}</span>
                  <span className="text-sm font-medium text-blue-600">
                    {route.syncProgressCurrent}/{route.syncProgressTotal}
                  </span>
                </div>
                {route.syncProgressTotal > 0 && (
                  <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-blue-500 transition-all duration-300"
                      style={{ 
                        width: `${Math.min(100, (route.syncProgressCurrent / route.syncProgressTotal) * 100)}%` 
                      }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3 mb-6">
        <Card className="rounded-2xl">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <Database className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{activeRoutes.length}</p>
                <p className="text-sm text-muted-foreground">Active Sources</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-emerald-100 flex items-center justify-center">
                <Users className="h-6 w-6 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{employees.length}</p>
                <p className="text-sm text-muted-foreground">Total Employees</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-blue-100 flex items-center justify-center">
                <RefreshCw className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{importLogs.length}</p>
                <p className="text-sm text-muted-foreground">Total Syncs</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="rounded-xl">
          <TabsTrigger value="sources" className="gap-2 rounded-lg">
            <Database className="h-4 w-4" />
            Data Sources
          </TabsTrigger>
          <TabsTrigger value="scheduling" className="gap-2 rounded-lg">
            <Calendar className="h-4 w-4" />
            Sync Scheduling
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2 rounded-lg">
            <History className="h-4 w-4" />
            Sync History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sources">
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                All Data Sources
              </CardTitle>
            </CardHeader>
            <CardContent>
              {routesLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : allRoutes.length === 0 ? (
                <div className="text-center py-12">
                  <Database className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                  <p className="text-muted-foreground mb-2">No data sources configured</p>
                  <p className="text-sm text-muted-foreground">Create a data source in API Routing</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                  {allRoutes.map((route) => (
                    <div 
                      key={route.id} 
                      className={`p-4 border rounded-xl transition-all ${
                        route.status === "active" 
                          ? "bg-white border-primary/20" 
                          : "bg-muted/30 border-muted"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${
                            route.sourceType === "api" ? "bg-blue-100" : "bg-emerald-100"
                          }`}>
                            {route.sourceType === "api" ? (
                              <Globe className="h-5 w-5 text-blue-600" />
                            ) : (
                              <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-medium truncate">{route.name}</p>
                              <Badge variant="outline" className="text-[10px] h-5 shrink-0">
                                {route.sourceType.toUpperCase()}
                              </Badge>
                            </div>
                            {route.lastSyncStatus === "in_progress" ? (
                              <div className="mt-1">
                                <div className="flex items-center gap-2">
                                  <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
                                  <span className="text-xs font-medium text-blue-600">
                                    Syncing: {route.syncProgressCurrent}/{route.syncProgressTotal}
                                  </span>
                                </div>
                                {route.syncProgressTotal > 0 && (
                                  <div className="mt-1 h-1.5 w-full bg-gray-200 rounded-full overflow-hidden">
                                    <div 
                                      className="h-full bg-blue-500 transition-all duration-300"
                                      style={{ 
                                        width: `${Math.min(100, (route.syncProgressCurrent / route.syncProgressTotal) * 100)}%` 
                                      }}
                                    />
                                  </div>
                                )}
                              </div>
                            ) : route.lastSyncAt && (
                              <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                                {route.lastSyncStatus === "completed" ? (
                                  <>
                                    <CheckCircle className="h-3 w-3 text-emerald-500" />
                                    Last sync: {formatDate(route.lastSyncAt)}
                                  </>
                                ) : (
                                  <>
                                    <AlertCircle className="h-3 w-3 text-rose-500" />
                                    Last sync failed
                                  </>
                                )}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1 rounded-lg"
                            onClick={() => syncRouteMutation.mutate(route.id)}
                            disabled={route.lastSyncStatus === "in_progress" || route.status !== "active"}
                          >
                            {route.lastSyncStatus === "in_progress" ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <RefreshCw className="h-4 w-4" />
                            )}
                            Sync
                          </Button>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">Active</span>
                            <Switch
                              checked={route.status === "active"}
                              onCheckedChange={(checked) => 
                                toggleActiveMutation.mutate({ id: route.id, isActive: checked })
                              }
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="scheduling">
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Sync Scheduling
              </CardTitle>
            </CardHeader>
            <CardContent>
              {routesLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : allRoutes.length === 0 ? (
                <div className="text-center py-12">
                  <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                  <p className="text-muted-foreground">No data sources to schedule</p>
                </div>
              ) : (
                <div className="max-h-[500px] overflow-y-auto">
                  <UITable>
                    <TableHeader className="sticky top-0 bg-white z-10">
                      <TableRow>
                        <TableHead>Source Name</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Auto Sync</TableHead>
                        <TableHead>Interval</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {allRoutes.map((route) => (
                        <TableRow key={route.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {route.sourceType === "api" ? (
                                <Globe className="h-4 w-4 text-blue-600" />
                              ) : (
                                <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                              )}
                              <span className="font-medium">{route.name}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {route.sourceType.toUpperCase()}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Switch
                              checked={route.syncEnabled}
                              onCheckedChange={(checked) => 
                                updateScheduleMutation.mutate({ id: route.id, syncEnabled: checked })
                              }
                              disabled={route.status !== "active"}
                            />
                          </TableCell>
                          <TableCell>
                            {route.syncEnabled && route.status === "active" ? (
                              <div className="flex items-center gap-2">
                                <Select
                                  value={route.syncIntervalHours.toString()}
                                  onValueChange={(value) => 
                                    updateScheduleMutation.mutate({ 
                                      id: route.id, 
                                      syncIntervalHours: parseInt(value) 
                                    })
                                  }
                                >
                                  <SelectTrigger className="w-16 h-8">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent className="max-h-48 overflow-y-auto">
                                    {Array.from({ length: 24 }, (_, i) => (
                                      <SelectItem key={i} value={i.toString()}>
                                        {i.toString().padStart(2, "0")}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <span className="text-xs text-muted-foreground">h</span>
                                <Select
                                  value={route.syncIntervalMinutes.toString()}
                                  onValueChange={(value) => 
                                    updateScheduleMutation.mutate({ 
                                      id: route.id, 
                                      syncIntervalMinutes: parseInt(value) 
                                    })
                                  }
                                >
                                  <SelectTrigger className="w-16 h-8">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent className="max-h-48 overflow-y-auto">
                                    {Array.from({ length: 60 }, (_, i) => (
                                      <SelectItem key={i} value={i.toString()}>
                                        {i.toString().padStart(2, "0")}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <span className="text-xs text-muted-foreground">m</span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-sm">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {route.status === "active" ? (
                              <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">
                                Active
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-muted-foreground">
                                Draft
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </UITable>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card className="rounded-2xl">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <History className="h-5 w-5" />
                  Sync History
                </CardTitle>
                {importLogs.length > 0 && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50">
                        <Trash2 className="h-4 w-4" />
                        Clear History
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="rounded-2xl">
                      <AlertDialogHeader>
                        <AlertDialogTitle>Clear Sync History?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will delete all sync history records. This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
                        <AlertDialogAction 
                          onClick={() => clearHistoryMutation.mutate()}
                          className="bg-rose-600 hover:bg-rose-700 rounded-xl"
                        >
                          Clear All
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {logsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : importLogs.length === 0 ? (
                <div className="text-center py-12">
                  <History className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                  <p className="text-muted-foreground">No sync history yet</p>
                  <p className="text-sm text-muted-foreground mt-1">Start syncing data sources to see history</p>
                </div>
              ) : (
                <div className="max-h-[500px] overflow-y-auto">
                  <UITable>
                    <TableHeader className="sticky top-0 bg-white z-10">
                      <TableRow>
                        <TableHead>Source</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Records</TableHead>
                        <TableHead>Duration</TableHead>
                        <TableHead>Date & Time</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {importLogs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell>
                            <span className="font-medium">{log.sourceName}</span>
                          </TableCell>
                          <TableCell>
                            {log.status === "completed" ? (
                              <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 gap-1">
                                <CheckCircle className="h-3 w-3" />
                                Completed
                              </Badge>
                            ) : log.status === "failed" ? (
                              <Badge className="bg-rose-100 text-rose-700 border-rose-200 gap-1">
                                <AlertCircle className="h-3 w-3" />
                                Failed
                              </Badge>
                            ) : (
                              <Badge className="bg-blue-100 text-blue-700 border-blue-200 gap-1">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                In Progress
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <span className="font-semibold text-emerald-600">
                                {log.recordsImported}
                              </span>
                              <span className="text-muted-foreground">/</span>
                              <span className="text-muted-foreground">
                                {log.recordsTotal}
                              </span>
                              {log.recordsFailed > 0 && (
                                <span className="text-rose-500 text-xs ml-1">
                                  ({log.recordsFailed} failed)
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="text-muted-foreground">
                              {formatDuration(log.startedAt, log.completedAt)}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm text-muted-foreground">
                              {formatDate(log.startedAt)}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </UITable>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
