import { useQuery } from "@tanstack/react-query";
import { systemApi } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Activity, RefreshCw } from "lucide-react";

const REFRESH_INTERVAL_MS = 30_000;

export default function SystemHealthPage() {
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["system-health"],
    queryFn: () => systemApi.getHealth(),
    refetchInterval: REFRESH_INTERVAL_MS,
  });

  const hasMissingPolicies = (data?.missingPolicies?.length ?? 0) > 0;
  const statusLabel = hasMissingPolicies ? "Attention Required" : "Healthy";
  const statusVariant = hasMissingPolicies ? "destructive" : "default";

  return (
    <div className="space-y-6 p-4">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-6 w-6" />
              <CardTitle>System Health</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={statusVariant} className={hasMissingPolicies ? "bg-destructive text-destructive-foreground" : "bg-green-600 hover:bg-green-600"}>
                {statusLabel}
              </Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isFetching}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
          </div>
          <CardDescription>Director-only system diagnostics. Auto-refreshes every 30 seconds.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          )}

          {isError && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive">
              <p className="font-medium">Failed to load health data</p>
              <p className="text-sm mt-1">{error instanceof Error ? error.message : "Unknown error"}</p>
            </div>
          )}

          {data && !isError && (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Policy Registry Count</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold">{data.registryPolicyCount}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">DB Policy Count</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold">{data.dbPolicyCount}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Roles Count</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold">{data.rolesCount}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Cache Size</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold">{data.cacheSize}</p>
                  </CardContent>
                </Card>
              </div>

              <Card className={hasMissingPolicies ? "border-destructive/50" : ""}>
                <CardHeader>
                  <CardTitle className="text-base">Missing Policies</CardTitle>
                  <CardDescription>
                    {data.missingPolicies.length === 0
                      ? "All registry policies exist in the database."
                      : "The following registry policies are missing from the database. Run seed or policy sync."}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {data.missingPolicies.length === 0 ? (
                    <p className="text-sm text-muted-foreground">None</p>
                  ) : (
                    <ul className="list-disc list-inside space-y-1 text-sm text-destructive">
                      {data.missingPolicies.map((key) => (
                        <li key={key} className="font-mono">
                          {key}
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>

              <p className="text-sm text-muted-foreground">
                Last updated: {new Date(data.timestamp).toLocaleString()}
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
