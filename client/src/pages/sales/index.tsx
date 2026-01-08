import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  TrendingUp, Users, Building2, IndianRupee, ChevronRight, Store, 
  ArrowUpRight, ArrowDownRight, Calendar, RefreshCw, Clock
} from "lucide-react";
import { PieChart, Pie, Cell, BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { format } from "date-fns";

interface DashboardData {
  success: boolean;
  kpis: {
    totalSale: number;
    inhouseSale: number;
    externalSale: number;
    totalStaff: number;
    totalUnits: number;
  };
  units: Array<{
    name: string;
    totalSale: number;
    inhouseSale: number;
    staffCount: number;
    departmentCount: number;
  }>;
  topStaff: Array<{ name: string; totalSale: number; unit: string }>;
  trendData: Array<{ month: string; sale: number }>;
  availableMonths: Array<{ monthKey: string; display: string; count: number }>;
  selectedMonth: string | null;
  lastUpdateTime?: number;
  dataMonthRange?: {
    from: string | null;
    to: string | null;
  };
}

const CHART_COLORS = ['#10b981', '#6366f1', '#f59e0b', '#ef4444', '#8b5cf6'];
const GLASS_STYLE = "backdrop-blur-xl bg-card/70 border border-border shadow-xl";

// Helper function to parse BILL_MONTH and extract monthKey (yyyy-MM)
// Handles multiple formats: DD-MON-YYYY, yyyy-MM-DD, ISO date strings
function getMonthKey(billMonth: string | null | undefined): string | null {
  if (!billMonth) return null;
  try {
    let monthDate: Date | null = null;
    
    // Handle DD-MON-YYYY format (e.g., "01-JAN-2026")
    if (typeof billMonth === 'string' && billMonth.includes('-')) {
      const parts = billMonth.split('-');
      if (parts.length === 3) {
        const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
        const monthIndex = monthNames.indexOf(parts[1].toUpperCase());
        const year = parseInt(parts[2], 10);
        if (monthIndex !== -1 && !isNaN(year)) {
          // BILL_MONTH represents the 1st day of the month
          monthDate = new Date(year, monthIndex, 1);
        }
      }
    }
    
    // Handle yyyy-MM-DD format (ignore day, treat as month)
    if (!monthDate) {
      const dateObj = new Date(billMonth);
      if (!isNaN(dateObj.getTime())) {
        // Normalize to 1st day of month (ignore day component)
        monthDate = new Date(dateObj.getFullYear(), dateObj.getMonth(), 1);
      }
    }
    
    if (!monthDate || isNaN(monthDate.getTime())) return null;
    
    // Normalize to monthKey (yyyy-MM)
    return format(monthDate, 'yyyy-MM');
  } catch {
    return null;
  }
}

// Helper function to format month display (MMM yyyy)
function formatMonthDisplay(billMonth: string | null | undefined): string | null {
  if (!billMonth) return null;
  const monthKey = getMonthKey(billMonth);
  if (!monthKey) return null;
  const monthDate = new Date(monthKey + '-01');
  return format(monthDate, 'MMM yyyy');
}

function formatCurrency(value: number) {
  if (Math.abs(value) >= 10000000) {
    return `₹${(value / 10000000).toFixed(2)}Cr`;
  } else if (Math.abs(value) >= 100000) {
    return `₹${(value / 100000).toFixed(2)}L`;
  }
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);
}

function KPICard({ title, value, icon: Icon, color, trend, isCurrency = true }: { title: string; value: string | number; icon: any; color: string; trend?: number; isCurrency?: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`${GLASS_STYLE} rounded-2xl p-6 hover:scale-[1.02] transition-transform cursor-default`}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground font-medium">{title}</p>
          <p className={`text-2xl font-bold ${color} dark:text-opacity-90`}>
            {typeof value === 'number' ? (isCurrency ? formatCurrency(value) : value.toLocaleString()) : value}
          </p>
          {trend !== undefined && (
            <div className={`flex items-center gap-1 text-xs mt-1 ${trend >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {trend >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
              {Math.abs(trend).toFixed(1)}%
            </div>
          )}
        </div>
        <div className={`h-14 w-14 rounded-2xl bg-gradient-to-br ${color.includes('green') ? 'from-green-100 to-emerald-100 dark:from-green-500/20 dark:to-emerald-500/20' : color.includes('blue') ? 'from-blue-100 to-indigo-100 dark:from-blue-500/20 dark:to-indigo-500/20' : color.includes('purple') ? 'from-purple-100 to-violet-100 dark:from-purple-500/20 dark:to-violet-500/20' : 'from-amber-100 to-orange-100 dark:from-amber-500/20 dark:to-orange-500/20'} flex items-center justify-center`}>
          <Icon className={`h-7 w-7 ${color}`} />
        </div>
      </div>
    </motion.div>
  );
}

function UnitCard({ unit, onClick, lastUpdateTime, dataMonthRange }: { 
  unit: DashboardData['units'][0]; 
  onClick: () => void; 
  lastUpdateTime?: number;
  dataMonthRange?: { from: string | null; to: string | null };
}) {
  const inhousePercent = unit.totalSale > 0 ? (unit.inhouseSale / unit.totalSale * 100) : 0;
  
  const formatUnitMonthRange = () => {
    if (!dataMonthRange?.from || !dataMonthRange?.to) return null;
    // dataMonthRange contains monthKey (yyyy-MM)
    const from = format(new Date(dataMonthRange.from + '-01'), 'MMM yyyy');
    const to = format(new Date(dataMonthRange.to + '-01'), 'MMM yyyy');
    // If same month, show only one
    if (from === to) return from;
    return `${from} - ${to}`;
  };
  
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ scale: 1.02, y: -4 }}
      onClick={onClick}
      className={`${GLASS_STYLE} rounded-2xl p-5 cursor-pointer group`}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
            <Store className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">{unit.name}</h3>
            <p className="text-xs text-muted-foreground">{unit.staffCount} staff · {unit.departmentCount} depts</p>
          </div>
        </div>
        <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
      </div>
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-sm text-muted-foreground">Total Sale</span>
          <span className="font-bold text-green-700 dark:text-green-400">{formatCurrency(unit.totalSale)}</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-emerald-400 to-green-500 rounded-full transition-all"
            style={{ width: `${inhousePercent}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>In-House: {inhousePercent.toFixed(0)}%</span>
          <span>{formatCurrency(unit.inhouseSale)}</span>
        </div>
        <div className="pt-1 border-t border-border/50 space-y-1">
          {formatUnitMonthRange() && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Calendar className="h-3 w-3" />
              <span>Data: {formatUnitMonthRange()}</span>
            </div>
          )}
          {lastUpdateTime && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>Updated: {format(new Date(lastUpdateTime), 'dd MMM, HH:mm')}</span>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export default function SalesPage() {
  const [, setLocation] = useLocation();
  const [selectedMonth, setSelectedMonth] = useState<string>('');

  // Fetch monthly sales data
  const { data: monthlyData, isLoading: isLoadingMonthly, isError: isErrorMonthly, refetch: refetchMonthly, isRefetching: isRefetchingMonthly } = useQuery({
    queryKey: ['/api/sales/monthly'],
    queryFn: async () => {
      const res = await fetch('/api/sales/monthly', {
        headers: { Authorization: `Bearer ${localStorage.getItem('gms_token')}` }
      });
      return res.json();
    },
    staleTime: Infinity, // Don't auto-refetch, only on manual refresh
    retry: 1,
  });

  // Process monthly data to create dashboard view
  const dashboardData = useMemo<DashboardData | undefined>(() => {
    if (!monthlyData?.success || !monthlyData?.data) return undefined;

    const allRecords = monthlyData.data; // Keep original unfiltered data
    
    // Use backend-provided availableMonths if available, otherwise calculate from data
    let availableMonths: Array<{ monthKey: string; display: string; count: number }>;
    
    if (monthlyData.availableMonths && Array.isArray(monthlyData.availableMonths)) {
      // Use backend-provided month metadata
      availableMonths = monthlyData.availableMonths;
    } else {
      // Calculate available months from ALL unfiltered data (for dropdown)
      // This ensures the dropdown always shows all months available in the API response
      const monthCountMap = new Map<string, number>();
      allRecords.forEach((r: any) => {
        const billMonth = r.BILL_MONTH || r.billMonth;
        const monthKey = getMonthKey(billMonth);
        if (monthKey) {
          monthCountMap.set(monthKey, (monthCountMap.get(monthKey) || 0) + 1);
        }
      });
      
      // Create available months array with display names
      // Format: MMM yyyy (e.g., "Jan 2026", "Dec 2025")
      availableMonths = Array.from(monthCountMap.entries())
        .map(([monthKey, count]) => {
          const monthDate = new Date(monthKey + '-01');
          return {
            monthKey,
            display: format(monthDate, 'MMM yyyy'), // Format: MMM yyyy (e.g., "Jan 2026")
            count,
          };
        })
        .sort((a, b) => b.monthKey.localeCompare(a.monthKey)); // Sort descending (newest first)
    }

    // Filter records by selected month if provided
    let records = allRecords;
    if (selectedMonth && selectedMonth !== 'all') {
      records = records.filter((r: any) => {
        const billMonth = r.BILL_MONTH || r.billMonth;
        const monthKey = getMonthKey(billMonth);
        return monthKey === selectedMonth;
      });
    }
    
    // Calculate KPIs
    let totalSale = 0;
    let inhouseSale = 0;
    const staffSet = new Set<string>();
    const unitSet = new Set<string>();
    
    records.forEach((r: any) => {
      totalSale += parseFloat(r.TOTAL_SALE || r.totalSale || '0') || 0;
      inhouseSale += parseFloat(r.INHOUSE_SAL || r.inhouseSal || '0') || 0;
      if (r.SMNO || r.smno) staffSet.add(r.SMNO || r.smno);
      if (r.SHRTNAME || r.shrtname) unitSet.add(r.SHRTNAME || r.shrtname);
    });

    // Aggregate by unit
    const unitMap: Record<string, { totalSale: number; inhouseSale: number; staffCount: number; deptSet: Set<string> }> = {};
    records.forEach((r: any) => {
      const unit = r.SHRTNAME || r.shrtname || 'Unknown';
      if (!unitMap[unit]) {
        unitMap[unit] = { totalSale: 0, inhouseSale: 0, staffCount: 0, deptSet: new Set() };
      }
      unitMap[unit].totalSale += parseFloat(r.TOTAL_SALE || r.totalSale || '0') || 0;
      unitMap[unit].inhouseSale += parseFloat(r.INHOUSE_SAL || r.inhouseSal || '0') || 0;
      if (r.DEPT || r.dept) unitMap[unit].deptSet.add(r.DEPT || r.dept);
    });

    // Count unique staff per unit
    const staffByUnit: Record<string, Set<string>> = {};
    records.forEach((r: any) => {
      const unit = r.SHRTNAME || r.shrtname || 'Unknown';
      if (!staffByUnit[unit]) staffByUnit[unit] = new Set();
      if (r.SMNO || r.smno) staffByUnit[unit].add(r.SMNO || r.smno);
    });

    const units = Object.entries(unitMap).map(([name, stats]) => ({
      name,
      totalSale: stats.totalSale,
      inhouseSale: stats.inhouseSale,
      staffCount: staffByUnit[name]?.size || 0,
      departmentCount: stats.deptSet.size,
    })).sort((a, b) => b.totalSale - a.totalSale);

    // Top 5 staff
    const staffSales: Record<string, { name: string; totalSale: number; unit: string }> = {};
    records.forEach((r: any) => {
      const smno = r.SMNO || r.smno || 'unknown';
      if (!staffSales[smno]) {
        staffSales[smno] = { name: r.SM || r.sm || r.SHRTNAME || r.shrtname || smno, totalSale: 0, unit: r.SHRTNAME || r.shrtname || '' };
      }
      staffSales[smno].totalSale += parseFloat(r.TOTAL_SALE || r.totalSale || '0') || 0;
    });
    const topStaff = Object.values(staffSales).sort((a, b) => b.totalSale - a.totalSale).slice(0, 5);

    // Monthly trend
    const monthlyTrend: Record<string, number> = {};
    records.forEach((r: any) => {
      const billMonth = r.BILL_MONTH || r.billMonth;
      const monthKey = getMonthKey(billMonth);
      if (monthKey) {
        monthlyTrend[monthKey] = (monthlyTrend[monthKey] || 0) + (parseFloat(r.TOTAL_SALE || r.totalSale || '0') || 0);
      }
    });
    const trendData = Object.entries(monthlyTrend)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-6)
      .map(([month, sale]) => ({ month, sale }));

    // Calculate data month range
    let minMonthKey: string | null = null;
    let maxMonthKey: string | null = null;
    records.forEach((r: any) => {
      const billMonth = r.BILL_MONTH || r.billMonth;
      const monthKey = getMonthKey(billMonth);
      if (monthKey) {
        if (!minMonthKey || monthKey < minMonthKey) minMonthKey = monthKey;
        if (!maxMonthKey || monthKey > maxMonthKey) maxMonthKey = monthKey;
      }
    });

    return {
      success: true,
      kpis: {
        totalSale,
        inhouseSale,
        externalSale: totalSale - inhouseSale,
        totalStaff: staffSet.size,
        totalUnits: unitSet.size,
      },
      units,
      topStaff,
      trendData,
      availableMonths,
      selectedMonth: selectedMonth || null,
      dataMonthRange: {
        from: minMonthKey,
        to: maxMonthKey,
      },
    };
  }, [monthlyData, selectedMonth]);

  const isLoading = isLoadingMonthly;
  const isError = isErrorMonthly;
  const refetch = refetchMonthly;
  const isRefetching = isRefetchingMonthly;

  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      // Call monthly refresh endpoint to fetch from API and update DB
      const refreshRes = await fetch('/api/sales/monthly/refresh', {
        method: 'POST',
        headers: { 
          Authorization: `Bearer ${localStorage.getItem('gms_token')}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!refreshRes.ok) {
        const errorText = await refreshRes.text();
        let errorMessage = `API returned status ${refreshRes.status}`;
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.message || errorMessage;
        } catch {
          errorMessage = errorText || errorMessage;
        }
        throw new Error(errorMessage);
      }
      
      const refreshData = await refreshRes.json();
      
      if (refreshData.success) {
        // After successful refresh, refetch monthly data
        await refetchMonthly();
      } else {
        throw new Error(refreshData.message || 'Refresh failed');
      }
    } catch (error: any) {
      console.error('Refresh error:', error);
      const errorMessage = error?.message || 'Failed to refresh data. Please try again.';
      alert(`Failed to refresh data: ${errorMessage}`);
    } finally {
      setIsRefreshing(false);
    }
  };

  const pieData = useMemo(() => {
    if (!dashboardData?.kpis) return [];
    return [
      { name: 'In-House', value: dashboardData.kpis.inhouseSale },
      { name: 'External', value: dashboardData.kpis.externalSale },
    ];
  }, [dashboardData]);

  const hasApiError = isError || dashboardData?.success === false;

  const handleUnitClick = (unitName: string) => {
    setLocation(`/sales/unit/${encodeURIComponent(unitName)}`);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-muted-foreground animate-pulse">Loading sales data...</div>
      </div>
    );
  }

  const formatMonthRange = () => {
    if (!dashboardData?.dataMonthRange?.from || !dashboardData?.dataMonthRange?.to) return null;
    // dataMonthRange contains monthKey (yyyy-MM)
    const from = format(new Date(dashboardData.dataMonthRange.from + '-01'), 'MMM yyyy');
    const to = format(new Date(dashboardData.dataMonthRange.to + '-01'), 'MMM yyyy');
    // If same month, show only one
    if (from === to) return { from, to, full: from };
    return { from, to, full: `${from} to ${to}` };
  };

  const monthRange = formatMonthRange();

  return (
    <div className="p-4 sm:p-6 space-y-6 bg-background min-h-screen">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex-1">
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Sales Dashboard</h1>
          <p className="text-muted-foreground text-sm sm:text-base">Executive overview of sales performance</p>
          {(dashboardData?.lastUpdateTime || monthRange) && (
            <div className="flex flex-wrap items-center gap-3 mt-3">
               {monthRange && (
                 <div className={`${GLASS_STYLE} rounded-lg px-3 py-1.5 flex items-center gap-2`}>
                   <Calendar className="h-4 w-4 text-primary" />
                   <div className="flex flex-col">
                     <span className="text-xs text-muted-foreground">Data Period</span>
                     <span className="text-sm font-semibold text-foreground">
                       {monthRange.from} to {monthRange.to}
                       {dashboardData?.lastUpdateTime && ` • ${format(new Date(dashboardData.lastUpdateTime), 'HH:mm')}`}
                     </span>
                   </div>
                 </div>
               )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={isRefreshing || isRefetching}
            className={`${GLASS_STYLE} rounded-xl px-4 py-2 flex items-center gap-2 hover:scale-105 transition-transform disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <RefreshCw className={`h-4 w-4 ${(isRefreshing || isRefetching) ? 'animate-spin' : ''}`} />
            <span className="text-sm font-medium">Refresh</span>
          </button>
          <Select 
            value={selectedMonth || "all"} 
            onValueChange={(v) => {
              setSelectedMonth(v === "all" ? "" : v);
            }}
          >
            <SelectTrigger className={`w-full sm:w-[200px] ${GLASS_STYLE}`}>
              <div className="flex items-center">
                <Calendar className="h-4 w-4 mr-2" />
                <SelectValue placeholder="All Months">
                  {selectedMonth && selectedMonth !== "all" && dashboardData?.availableMonths ? (
                    dashboardData.availableMonths.find(m => m.monthKey === selectedMonth)?.display || "All Months"
                  ) : (
                    "All Months"
                  )}
                </SelectValue>
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                All Months {dashboardData && `(${monthlyData?.data?.length || 0} records)`}
              </SelectItem>
              {dashboardData?.availableMonths && dashboardData.availableMonths.length > 0 ? (
                dashboardData.availableMonths.map(m => (
                  <SelectItem key={m.monthKey} value={m.monthKey}>
                    {m.display} ({m.count} records)
                  </SelectItem>
                ))
              ) : (
                <SelectItem value="no-data" disabled>No months available</SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>
      </motion.div>

        {hasApiError && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center">
            <TrendingUp className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <p className="font-medium text-amber-800">Sales data temporarily unavailable</p>
            <p className="text-sm text-amber-600">The vendor API is not responding. Data will refresh automatically when available.</p>
          </div>
        </motion.div>
      )}


      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard title="Total Sale" value={dashboardData?.kpis?.totalSale || 0} icon={IndianRupee} color="text-green-600" />
        <KPICard title="In-House Sale" value={dashboardData?.kpis?.inhouseSale || 0} icon={TrendingUp} color="text-blue-600" />
        <KPICard title="Total Staff" value={dashboardData?.kpis?.totalStaff || 0} icon={Users} color="text-purple-600" isCurrency={false} />
        <KPICard title="Total Units" value={dashboardData?.kpis?.totalUnits || 0} icon={Building2} color="text-amber-600" isCurrency={false} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }} className="lg:col-span-2">
          <Card className={GLASS_STYLE}>
            <CardHeader><CardTitle className="text-foreground">Units Overview</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {dashboardData?.units?.map((unit) => (
                  <UnitCard 
                    key={unit.name} 
                    unit={unit} 
                    onClick={() => handleUnitClick(unit.name)}
                    lastUpdateTime={dashboardData?.lastUpdateTime}
                    dataMonthRange={dashboardData?.dataMonthRange}
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }} className="space-y-6">
          <Card className={GLASS_STYLE}>
            <CardHeader><CardTitle className="text-foreground text-base">Sale Distribution</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={5} dataKey="value">
                    {pieData.map((_, idx) => <Cell key={idx} fill={CHART_COLORS[idx]} />)}
                  </Pie>
                   <Tooltip formatter={(v: number | undefined) => v !== undefined ? formatCurrency(v) : ''} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className={GLASS_STYLE}>
            <CardHeader><CardTitle className="text-foreground text-base">Top 5 Performers</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={dashboardData?.topStaff || []} layout="vertical">
                  <XAxis type="number" tickFormatter={(v) => `₹${(v/100000).toFixed(0)}L`} />
                  <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 11 }} />
                   <Tooltip formatter={(v: number | undefined) => v !== undefined ? formatCurrency(v) : ''} />
                  <Bar dataKey="totalSale" fill="#10b981" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
        <Card className={GLASS_STYLE}>
          <CardHeader><CardTitle className="text-foreground">Monthly Trend</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={dashboardData?.trendData || []}>
                <XAxis dataKey="month" tickFormatter={(v) => format(new Date(v + '-01'), 'MMM')} />
                <YAxis tickFormatter={(v) => `₹${(v/10000000).toFixed(1)}Cr`} />
                <Tooltip formatter={(v: number | undefined) => v !== undefined ? formatCurrency(v) : ''} labelFormatter={(v) => format(new Date(v + '-01'), 'MMM yyyy')} />
                <Line type="monotone" dataKey="sale" stroke="#6366f1" strokeWidth={3} dot={{ fill: '#6366f1', r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

