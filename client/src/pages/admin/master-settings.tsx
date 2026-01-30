import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { 
  Loader2, Database, CheckCircle2, AlertCircle, Play, FileJson, Globe, FileSpreadsheet, X
} from "lucide-react";
import { Link } from "wouter";

interface ApiRoute {
  id: string;
  name: string;
  description?: string;
  endpoint?: string;
  sourceType: string;
  csvFilePath?: string;
  isActive: boolean;
  status: string;
  lastTestAt?: string;
  lastTestStatus?: string;
}

interface PreviewData {
  totalRecords: number;
  sampleRecord: Record<string, any> | null;
  fields: string[];
}

export default function MasterSettingsPage() {
  const { token, hasPolicy } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [testingId, setTestingId] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<{ id: string; data: PreviewData } | null>(null);

  const { data: routes, isLoading } = useQuery<ApiRoute[]>({
    queryKey: ["api-routes"],
    queryFn: async () => {
      const res = await fetch("/api/admin/routing", {
        headers: { "X-Session-Id": token },
      });
      if (!res.ok) throw new Error("Failed to fetch routes");
      return res.json();
    },
    enabled: !!token && hasPolicy("admin.master-settings.view"),
  });

  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await fetch(`/api/admin/routing/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Session-Id": token,
        },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed to update status");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Status updated" });
      queryClient.invalidateQueries({ queryKey: ["api-routes"] });
    },
    onError: () => {
      toast({ title: "Failed to update status", variant: "destructive" });
    },
  });

  const handleTest = async (route: ApiRoute) => {
    if (!route.endpoint && route.sourceType === "api") {
      toast({ title: "No API endpoint configured", variant: "destructive" });
      return;
    }

    setTestingId(route.id);
    setPreviewData(null);

    try {
      const res = await fetch(`/api/admin/routing/${route.id}/test`, {
        method: "POST",
        headers: { "X-Session-Id": token },
      });
      
      const result = await res.json();
      
      if (result.success) {
        setPreviewData({
          id: route.id,
          data: {
            totalRecords: result.recordCount || 0,
            sampleRecord: result.sampleRecord || null,
            fields: result.fields || [],
          }
        });
        toast({ title: "Test successful", description: `Found ${result.recordCount || 0} records` });
      } else {
        toast({ title: "Test failed", description: result.message, variant: "destructive" });
      }
      
      queryClient.invalidateQueries({ queryKey: ["api-routes"] });
    } catch (error: any) {
      toast({ title: "Test failed", description: error.message, variant: "destructive" });
    } finally {
      setTestingId(null);
    }
  };

  const handleToggle = (route: ApiRoute, checked: boolean) => {
    const newStatus = checked ? "active" : "tested";
    toggleStatusMutation.mutate({ id: route.id, status: newStatus });
  };

  if (!hasPolicy("admin.master-settings.view")) {
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

  return (
    <>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Master Settings</h1>
          <p className="text-muted-foreground mt-1">
            Test and manage your data sources.
          </p>
        </div>
        <Link href="/admin/routing">
          <Button variant="outline" className="gap-2">
            <Database className="h-4 w-4" />
            Manage API Routes
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Data Sources ({routes?.length || 0})
          </CardTitle>
          <CardDescription>
            Test each data source to see record counts and preview data. Toggle to activate/deactivate.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {routes && routes.length > 0 ? (
            <div className="space-y-4">
              {routes.map((route) => (
                <div key={route.id} className="border rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between p-4 bg-muted/30">
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        {route.sourceType === "api" ? (
                          <Globe className="h-5 w-5 text-primary" />
                        ) : (
                          <FileSpreadsheet className="h-5 w-5 text-primary" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium">{route.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {route.sourceType === "api" ? "API Endpoint" : "CSV File"}
                          {route.lastTestAt && (
                            <span className="ml-2">
                              • Last tested: {new Date(route.lastTestAt).toLocaleString()}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {route.lastTestStatus && (
                        <Badge 
                          className={`${
                            route.lastTestStatus === "success" 
                              ? "bg-emerald-100 text-emerald-700" 
                              : "bg-rose-100 text-rose-700"
                          }`}
                        >
                          {route.lastTestStatus === "success" ? (
                            <><CheckCircle2 className="h-3 w-3 mr-1" /> Passed</>
                          ) : (
                            <><AlertCircle className="h-3 w-3 mr-1" /> Failed</>
                          )}
                        </Badge>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={() => handleTest(route)}
                        disabled={testingId === route.id}
                      >
                        {testingId === route.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Play className="h-4 w-4" />
                        )}
                        Test
                      </Button>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">
                          {route.status === "active" ? "Active" : "Inactive"}
                        </span>
                        <Switch
                          checked={route.status === "active"}
                          onCheckedChange={(checked) => handleToggle(route, checked)}
                          disabled={toggleStatusMutation.isPending}
                        />
                      </div>
                    </div>
                  </div>
                  
                  {previewData && previewData.id === route.id && (
                    <div className="p-4 border-t bg-background space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-3 px-4 py-2 bg-blue-50 rounded-lg border border-blue-200">
                            <FileJson className="h-5 w-5 text-blue-600" />
                            <div>
                              <p className="text-xl font-bold text-blue-900">
                                {previewData.data.totalRecords}
                              </p>
                              <p className="text-xs text-blue-700">Records Found</p>
                            </div>
                          </div>
                        </div>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => setPreviewData(null)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>

                      {previewData.data.fields.length > 0 && (
                        <div>
                          <p className="text-sm text-muted-foreground mb-2">
                            Fields ({previewData.data.fields.length})
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {previewData.data.fields.map((field, index) => (
                              <span 
                                key={index}
                                className="px-2 py-0.5 bg-muted rounded text-xs font-mono"
                              >
                                {field}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {previewData.data.sampleRecord && (
                        <div>
                          <p className="text-sm text-muted-foreground mb-2">Sample Record</p>
                          <div className="bg-muted/50 rounded-lg p-3 overflow-x-auto max-h-64">
                            <pre className="text-xs font-mono whitespace-pre-wrap">
                              {JSON.stringify(previewData.data.sampleRecord, null, 2)}
                            </pre>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <Database className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-lg font-medium mb-2">No Data Sources</p>
              <p className="text-muted-foreground mb-4">
                Add data sources in API Routing to see them here.
              </p>
              <Link href="/admin/routing">
                <Button className="gap-2">
                  <Database className="h-4 w-4" />
                  Add Data Source
                </Button>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
