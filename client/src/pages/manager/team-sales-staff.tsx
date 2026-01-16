import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Calendar, BarChart3, Hash, Loader2,
  AlertCircle, RefreshCw
} from "lucide-react";
import { format, startOfMonth, endOfMonth, isSameMonth } from "date-fns";

interface TableRow {
  brandType: string;
  quantity: number;
  netAmount: number;
}

interface PivotTableRow {
  rowLabel: string;
  today: { qty: number; netSale: number };
  lastDay: { qty: number; netSale: number };
  monthRange: { qty: number; netSale: number };
}

interface PivotTable {
  rows: PivotTableRow[];
}

interface SummaryData {
  success: boolean;
  table: {
    month: string | null;
    rows: TableRow[];
    grandTotal: number;
    grandQty: number;
  };
  pivotTable?: PivotTable;
  dateRange: {
    from: string | null;
    to: string | null;
  };
  lastRefreshTime?: string | null;
  availableUnits?: string[];
  availableDivisions?: string[];
}

function formatCurrency(value: number) {
  if (Math.abs(value) >= 10000000) {
    return `₹${(value / 10000000).toFixed(2)} Cr`;
  } else if (Math.abs(value) >= 100000) {
    return `₹${(value / 100000).toFixed(2)} L`;
  } else if (Math.abs(value) >= 1000) {
    return `₹${(value / 1000).toFixed(1)} K`;
  }
  return new Intl.NumberFormat("en-IN", { 
    style: "currency", 
    currency: "INR", 
    maximumFractionDigits: 0 
  }).format(value);
}

function formatDateRangeForPivot(monthKey: string | null): string {
  if (!monthKey) return "N/A";
  const [year, month] = monthKey.split("-");
  const date = new Date(parseInt(year), parseInt(month) - 1, 1);
  const now = new Date();
  const isCurrentMonth = isSameMonth(date, now);
  
  if (isCurrentMonth) {
    const monthStart = startOfMonth(now);
    const today = now;
    const startStr = format(monthStart, "d MMM");
    const endStr = format(today, "d MMM");
    return `${startStr} to ${endStr}`;
  }
  
  // For past months, show full month range
  const monthStart = startOfMonth(date);
  const monthEnd = endOfMonth(date);
  const startStr = format(monthStart, "d MMM");
  const endStr = format(monthEnd, "d MMM");
  return `${startStr} to ${endStr}`;
}

function PivotTableComponent({ 
  pivotTable, 
  memberName, 
  memberCard,
  monthRange
}: { 
  pivotTable: PivotTable;
  memberName?: string | null;
  memberCard?: string | null;
  monthRange?: string | null;
}) {
  if (!pivotTable || !pivotTable.rows || pivotTable.rows.length === 0) {
    return (
      <div className="text-center py-12 bg-slate-50 rounded-xl border border-slate-200">
        <BarChart3 className="h-12 w-12 mx-auto mb-3 text-slate-300" />
        <p className="text-slate-500">No pivot table data available</p>
      </div>
    );
  }

  const todayDateLabel = format(new Date(), "d MMM");
  // Calculate last day date (most recent date before today)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const lastDayDateLabel = format(yesterday, "d MMM");

  // Normalize rows to ensure they have the expected structure
  const validRows = pivotTable.rows
    .filter(row => row && row.rowLabel)
    .map(row => ({
      rowLabel: row.rowLabel || '',
      today: (row.today && typeof row.today === 'object' && ('qty' in row.today || 'netSale' in row.today))
        ? { qty: Number(row.today.qty) || 0, netSale: Number(row.today.netSale) || 0 }
        : { qty: 0, netSale: 0 },
      lastDay: (row.lastDay && typeof row.lastDay === 'object' && ('qty' in row.lastDay || 'netSale' in row.lastDay))
        ? { qty: Number(row.lastDay.qty) || 0, netSale: Number(row.lastDay.netSale) || 0 }
        : { qty: 0, netSale: 0 },
      monthRange: (row.monthRange && typeof row.monthRange === 'object' && ('qty' in row.monthRange || 'netSale' in row.monthRange))
        ? { qty: Number(row.monthRange.qty) || 0, netSale: Number(row.monthRange.netSale) || 0 }
        : { qty: 0, netSale: 0 },
    }));

  if (validRows.length === 0) {
    return (
      <div className="text-center py-12 bg-slate-50 rounded-xl border border-slate-200">
        <BarChart3 className="h-12 w-12 mx-auto mb-3 text-slate-300" />
        <p className="text-slate-500">No valid pivot table data available</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Member Info Header */}
      {(memberName || memberCard) && (
        <div className="flex items-center gap-4 pb-3 border-b border-slate-200">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg">
            {memberName?.charAt(0).toUpperCase() || "?"}
          </div>
          <div>
            {memberName && (
              <h3 className="text-lg font-bold text-slate-800">{memberName}</h3>
            )}
            {memberCard && (
              <div className="flex items-center gap-2 text-sm text-slate-500 mt-0.5">
                <Hash className="h-3.5 w-3.5" />
                <span className="font-mono">{memberCard}</span>
              </div>
            )}
          </div>
        </div>
      )}
    <div className="overflow-x-auto">
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-blue-50">
              <th rowSpan={2} className="border border-slate-300 py-3 px-4 text-left font-semibold text-slate-700 text-sm bg-blue-100">
                Row Labels
              </th>
              <th colSpan={2} className="border border-slate-300 py-2 px-3 text-center font-semibold text-slate-700 text-sm bg-emerald-100">
                Today ({todayDateLabel})
              </th>
              <th colSpan={2} className="border border-slate-300 py-2 px-3 text-center font-semibold text-slate-700 text-sm bg-amber-100">
                Last Day ({lastDayDateLabel})
              </th>
              <th colSpan={2} className="border border-slate-300 py-2 px-3 text-center font-semibold text-slate-700 text-sm bg-indigo-100">
                {monthRange || "Month Range"}
              </th>
            </tr>
            <tr className="bg-blue-50">
              <th className="border border-slate-300 py-2 px-3 text-center font-medium text-slate-600 text-xs bg-emerald-50">
                Sum of QTY
              </th>
              <th className="border border-slate-300 py-2 px-3 text-center font-medium text-slate-600 text-xs bg-emerald-50">
                Sum of NETSALE
              </th>
              <th className="border border-slate-300 py-2 px-3 text-center font-medium text-slate-600 text-xs bg-amber-50">
                Sum of QTY
              </th>
              <th className="border border-slate-300 py-2 px-3 text-center font-medium text-slate-600 text-xs bg-amber-50">
                Sum of NETSALE
              </th>
              <th className="border border-slate-300 py-2 px-3 text-center font-medium text-slate-600 text-xs bg-indigo-50">
                Sum of QTY
              </th>
              <th className="border border-slate-300 py-2 px-3 text-center font-medium text-slate-600 text-xs bg-indigo-50">
                Sum of NETSALE
              </th>
            </tr>
          </thead>
          <tbody>
            {validRows.map((row, rowIdx) => {
              // Check if this is a division header (it's not InHouse, SOR)
              const isDivisionHeader = row.rowLabel !== "InHouse" && row.rowLabel !== "SOR";
              
              // Data is already normalized in validRows above
              const todayData = row.today;
              const lastDayData = row.lastDay;
              const monthRangeData = row.monthRange;
              
              return (
                <tr 
                  key={rowIdx}
                  className={
                    isDivisionHeader 
                      ? "bg-blue-50 font-semibold" 
                      : "hover:bg-slate-50"
                  }
                >
                  <td className={`border border-slate-300 py-3 px-4 text-sm ${
                    isDivisionHeader 
                      ? "text-slate-800 bg-blue-100 font-semibold" 
                      : "text-slate-700"
                  }`}>
                    {row.rowLabel}
                  </td>
                  {/* Today */}
                  <td className={`border border-slate-300 py-3 px-3 text-center text-sm ${
                    isDivisionHeader 
                      ? "text-slate-800 bg-blue-50 font-semibold" 
                      : "text-slate-700"
                  }`}>
                    {todayData.qty.toLocaleString("en-IN")}
                  </td>
                  <td className={`border border-slate-300 py-3 px-3 text-right text-sm ${
                    isDivisionHeader 
                      ? "text-slate-800 bg-blue-50 font-semibold" 
                      : "text-slate-700"
                  }`}>
                    {formatCurrency(todayData.netSale)}
                  </td>
                  {/* Last Day */}
                  <td className={`border border-slate-300 py-3 px-3 text-center text-sm ${
                    isDivisionHeader 
                      ? "text-slate-800 bg-blue-50 font-semibold" 
                      : "text-slate-700"
                  }`}>
                    {lastDayData.qty.toLocaleString("en-IN")}
                  </td>
                  <td className={`border border-slate-300 py-3 px-3 text-right text-sm ${
                    isDivisionHeader 
                      ? "text-slate-800 bg-blue-50 font-semibold" 
                      : "text-slate-700"
                  }`}>
                    {formatCurrency(lastDayData.netSale)}
                  </td>
                  {/* Month Range */}
                  <td className={`border border-slate-300 py-3 px-3 text-center text-sm font-semibold ${
                    isDivisionHeader 
                      ? "text-slate-800 bg-blue-100" 
                      : "text-slate-700"
                  }`}>
                    {monthRangeData.qty.toLocaleString("en-IN")}
                  </td>
                  <td className={`border border-slate-300 py-3 px-3 text-right text-sm font-semibold ${
                    isDivisionHeader 
                      ? "text-slate-800 bg-blue-100" 
                      : "text-slate-700"
                  }`}>
                    {formatCurrency(monthRangeData.netSale)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
    </div>
  );
}

function DetailTable({ 
  month, 
  pivotTable,
  selectedMonth,
}: { 
  card: null;
  month: string | null; 
  rows: TableRow[]; 
  grandTotal: number;
  grandQty: number;
  pivotTable?: PivotTable;
  selectedMonth?: string | null;
  availableUnits?: string[];
  availableDivisions?: string[];
}) {
  // Show pivot table
  if (pivotTable) {
    return (
      <div className="space-y-6">
        {/* Date Range Header */}
        {(selectedMonth || month) && (
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-indigo-500" />
            <span className="font-semibold text-lg text-slate-700">
              {formatDateRangeForPivot(selectedMonth || month)}
            </span>
          </div>
        )}

        {/* Pivot Table */}
        <PivotTableComponent 
          pivotTable={pivotTable}
          memberName={null}
          memberCard={null}
          monthRange={formatDateRangeForPivot(selectedMonth || month)}
        />
      </div>
    );
  }

  // No pivot table available
  return (
    <div className="text-center py-12 bg-slate-50 rounded-xl border border-slate-200">
      <BarChart3 className="h-12 w-12 mx-auto mb-3 text-slate-300" />
      <p className="text-slate-500">No pivot table data available</p>
    </div>
  );
}

export default function TeamSalesStaffPage() {
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedMonth] = useState<string>(format(new Date(), "yyyy-MM"));

  const { data, isLoading, isError, error } = useQuery<SummaryData>({
    queryKey: ["/api/manager/team/sales-staff", null, selectedMonth, null, null],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("month", selectedMonth);
      const token = localStorage.getItem("gms_token");
      const res = await fetch(`/api/manager/team/sales-staff?${params}`, {
        headers: { 
          "X-Session-Id": token,
          "Content-Type": "application/json",
        },
        credentials: "include",
      });
      const result = await res.json();
      if (!res.ok || result.success === false) {
        throw new Error(result.message || `HTTP ${res.status}: Failed to load sales data`);
      }
      return result;
    },
    staleTime: 5 * 60 * 1000,
    refetchInterval: 2 * 60 * 60 * 1000, // Auto-refresh every 2 hours
    retry: 1,
    retryDelay: 2000,
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      // Force refresh by fetching with forceRefresh parameter
      const params = new URLSearchParams();
      params.set("month", selectedMonth);
      params.set("forceRefresh", "true");
      
      const token = localStorage.getItem("gms_token");
      const res = await fetch(`/api/manager/team/sales-staff?${params}`, {
        headers: { 
          "X-Session-Id": token,
          "Content-Type": "application/json",
        },
        credentials: "include",
      });
      const result = await res.json();
      
      if (!res.ok || result.success === false) {
        throw new Error(result.message || `HTTP ${res.status}: Failed to refresh data`);
      }
      
      // Update the query cache with fresh data
      queryClient.setQueryData(["/api/manager/team/sales-staff", null, selectedMonth, null, null], result);
    } catch (error: any) {
      console.error("Refresh error:", error);
      alert(`Failed to refresh: ${error.message}`);
    } finally {
      setIsRefreshing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-10 w-10 animate-spin text-indigo-500" />
          <p className="text-slate-500">Loading team sales staff data...</p>
        </div>
      </div>
    );
  }

  if (isError || data?.success === false) {
    const errorMessage = error instanceof Error 
      ? error.message 
      : (data?.success === false ? (data as any).message : "Team sales staff data is temporarily unavailable");
    
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md border-red-200 bg-red-50">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h3 className="font-semibold text-lg text-slate-800 mb-2">Unable to Load Data</h3>
            <p className="text-slate-600 mb-4">{errorMessage}</p>
            <Button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
              {isRefreshing ? "Refreshing..." : "Try Refresh"}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-indigo-500 flex items-center justify-center">
              <BarChart3 className="h-5 w-5 text-white" />
            </div>
            Team Sales Staff
          </h1>
          <p className="text-slate-500 mt-1">
            View and analyze your team's sales performance
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
            {isRefreshing ? "Refreshing..." : "Refresh Data"}
          </Button>
          {data?.lastRefreshTime && (
            <p className="text-xs text-slate-400 flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              Last Refresh: {format(new Date(data.lastRefreshTime), "dd MMM yyyy, hh:mm a")}
            </p>
          )}
        </div>
      </div>

      {/* Pivot Table Only */}
      <Card className="border-slate-200 bg-white">
        <CardContent className="p-6">
          <DetailTable
            card={null}
            month={data?.table?.month ?? null}
            rows={data?.table?.rows ?? []}
            grandTotal={data?.table?.grandTotal ?? 0}
            grandQty={data?.table?.grandQty ?? 0}
            pivotTable={data?.pivotTable}
            selectedMonth={selectedMonth}
            availableUnits={data?.availableUnits}
            availableDivisions={data?.availableDivisions}
          />
        </CardContent>
      </Card>
    </div>
  );
}
