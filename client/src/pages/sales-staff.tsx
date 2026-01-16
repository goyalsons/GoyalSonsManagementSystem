import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Table2, RefreshCw } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import SalesExcelPivotTable, { type SalesDataRow } from "@/components/SalesExcelPivotTable";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface PivotApiResponse {
  success: boolean;
  data: SalesDataRow[];
  recordCount: number;
  lastApiHit?: string | null;
}

export default function SalesStaffPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const isEmployee = user?.loginType === "employee";
  const employeeCardNo = user?.employeeCardNo;
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastApiHit, setLastApiHit] = useState<string | null>(null);

  const { data: pivotResponse, isLoading, isError } = useQuery<PivotApiResponse>({
    queryKey: ["/api/sales/pivot"],
    queryFn: async () => {
      const res = await fetch("/api/sales/pivot", {
        headers: { "X-Session-Id": `${localStorage.getItem("gms_token") || ""}` },
      });
      const result = await res.json();
      if (!res.ok || result.success === false) {
        throw new Error(result.message || `HTTP ${res.status}: Failed to load pivot data`);
      }
      return result;
    },
    staleTime: 5 * 60 * 1000,
    refetchInterval: 2 * 60 * 60 * 1000,
    retry: 1,
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch("/api/sales/pivot/refresh", {
        method: "POST",
        headers: { "X-Session-Id": `${localStorage.getItem("gms_token") || ""}` },
      });
      const result = await res.json();
      if (!res.ok || result.success === false) {
        throw new Error(result.message || `HTTP ${res.status}: Failed to refresh pivot data`);
      }
      if (result.lastApiHit) {
        setLastApiHit(result.lastApiHit);
      }
      // Refetch the pivot data to show updated results
      await queryClient.invalidateQueries({ queryKey: ["/api/sales/pivot"] });
      
      // Check if there's a warning (e.g., using cached data due to API failure)
      if (result.warning) {
        toast({
          title: result.fromCache ? "Using Cached Data" : "Data Refreshed",
          description: result.warning,
          variant: result.fromCache ? "default" : undefined,
        });
      } else {
        toast({
          title: "Data Refreshed",
          description: `Successfully fetched ${result.recordCount || 0} records from the sales API.`,
        });
      }
    } catch (error: any) {
      console.error("Pivot refresh error:", error);
      toast({
        title: "Refresh Failed",
        description: error.message || "Failed to refresh data. Please try again later.",
        variant: "destructive",
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  const pivotData: SalesDataRow[] = useMemo(
    () => (pivotResponse?.success ? pivotResponse.data || [] : []),
    [pivotResponse]
  );

  const lastApiHitDisplay = useMemo(() => {
    const raw = lastApiHit || pivotResponse?.lastApiHit || null;
    if (!raw) return null;
    const parsed = new Date(raw);
    if (isNaN(parsed.getTime())) return raw;
    return format(parsed, "dd MMM yyyy, hh:mm a");
  }, [lastApiHit, pivotResponse]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-10 w-10 animate-spin text-indigo-500" />
          <p className="text-slate-500">Loading pivot data...</p>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md border-red-200 bg-red-50">
          <CardContent className="pt-6 text-center">
            <p className="text-slate-600">Pivot data is temporarily unavailable.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="w-full">
        <Card className="border-slate-200 bg-white">
          <CardHeader className="pb-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <CardTitle className="text-lg font-semibold flex items-center gap-2 text-slate-800">
                <Table2 className="h-5 w-5 text-indigo-500" />
                Division-wise Sales Breakdown
              </CardTitle>
              <div className="flex flex-col items-start sm:items-end gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  className="gap-2"
                >
                  <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
                {lastApiHitDisplay && (
                  <span className="text-xs text-slate-500">
                    Last Refresh: {lastApiHitDisplay}
                  </span>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <SalesExcelPivotTable
              data={pivotData}
              showSalesmanFilter={true}
              defaultSmno={isEmployee && employeeCardNo ? parseInt(employeeCardNo, 10) : null}
              employeeName={user?.name || ""}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
