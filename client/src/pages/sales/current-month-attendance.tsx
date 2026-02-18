/**
 * Current Month Sales & Attendance - Combined view.
 * Requires: sales.attendance.current-month.view
 */
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { TrendingUp, CalendarCheck, ChevronRight, Loader2, IndianRupee, Store } from "lucide-react";
import { apiGet } from "@/lib/api";

function formatCurrency(n: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
}

function getMonthKey(v: unknown): string | null {
  if (!v) return null;
  const s = String(v);
  const m = s.match(/^(\d{4})-(\d{2})/);
  if (!m) return null;
  return `${m[1]}-${m[2]}`;
}

export default function CurrentMonthSalesAttendancePage() {
  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const currentMonthLabel = format(new Date(currentMonthKey + "-01"), "MMMM yyyy");

  const { data: monthlyData, isLoading } = useQuery({
    queryKey: ["/api/sales/monthly"],
    queryFn: async () => {
      const res = await fetch("/api/sales/monthly", {
        headers: { "X-Session-Id": `${localStorage.getItem("gms_token") || ""}` },
      });
      return res.json();
    },
    staleTime: 60_000,
  });

  const currentMonthSales = useMemo(() => {
    if (!monthlyData?.success || !monthlyData?.data) return null;
    const records = (monthlyData.data as any[]).filter((r: any) => {
      const key = getMonthKey(r.BILL_MONTH || r.billMonth);
      return key === currentMonthKey;
    });
    let totalSale = 0;
    let inhouseSale = 0;
    const unitMap = new Map<string, { total: number; inhouse: number }>();
    for (const r of records) {
      const sale = Number(r.TOTAL_SALE ?? r.totalSale ?? 0) || 0;
      const brand = (r.BRAND ?? r.brand ?? "").toUpperCase();
      totalSale += sale;
      if (brand === "INHOUSE") inhouseSale += sale;
      const unit = r.UNIT_NAME ?? r.unitName ?? "Other";
      if (!unitMap.has(unit)) unitMap.set(unit, { total: 0, inhouse: 0 });
      const u = unitMap.get(unit)!;
      u.total += sale;
      if (brand === "INHOUSE") u.inhouse += sale;
    }
    return {
      totalSale,
      inhouseSale,
      recordsCount: records.length,
      units: Array.from(unitMap.entries()).map(([name, v]) => ({ name, ...v })),
    };
  }, [monthlyData, currentMonthKey]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-emerald-500/20 flex items-center justify-center">
            <TrendingUp className="h-5 w-5 text-emerald-600" />
          </div>
          Current Month Sales & Attendance
        </h1>
        <p className="text-muted-foreground mt-1">
          {currentMonthLabel} – Sales summary and attendance
        </p>
      </div>

      {/* Sales section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <IndianRupee className="h-4 w-4" />
            Sales – {currentMonthLabel}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <div className="py-12 flex items-center justify-center gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="text-muted-foreground">Loading sales...</span>
            </div>
          )}
          {!isLoading && currentMonthSales && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Total Sale</p>
                  <p className="text-xl font-bold text-green-700 dark:text-green-400">
                    {formatCurrency(currentMonthSales.totalSale)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">In-House</p>
                  <p className="text-xl font-bold">{formatCurrency(currentMonthSales.inhouseSale)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Records</p>
                  <p className="text-xl font-bold">{currentMonthSales.recordsCount}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Units</p>
                  <p className="text-xl font-bold">{currentMonthSales.units.length}</p>
                </div>
              </div>
              {currentMonthSales.units.length > 0 && (
                <div className="flex flex-wrap gap-3">
                  {currentMonthSales.units.map((u) => (
                    <div
                      key={u.name}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50"
                    >
                      <Store className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{u.name}</span>
                      <span className="text-green-600 font-semibold">
                        {formatCurrency(u.total)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <Button variant="outline" asChild>
                <Link href="/sales">
                  View full Sales Dashboard
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Link>
              </Button>
            </div>
          )}
          {!isLoading && !currentMonthSales && (
            <p className="text-muted-foreground py-4">No sales data for {currentMonthLabel}.</p>
          )}
        </CardContent>
      </Card>

      {/* Attendance section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarCheck className="h-4 w-4" />
            Attendance – {currentMonthLabel}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm mb-4">
            View work log and task history for current month.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link href="/attendance">
                My Work Log
                <ChevronRight className="h-4 w-4 ml-1" />
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/attendance/history">
                Task History
                <ChevronRight className="h-4 w-4 ml-1" />
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/attendance/today">
                Today Work Log
                <ChevronRight className="h-4 w-4 ml-1" />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
