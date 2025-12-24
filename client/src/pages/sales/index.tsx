import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  TrendingUp, Users, Building2, IndianRupee, ChevronRight, Store, 
  ArrowUpRight, ArrowDownRight, Calendar
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
  availableMonths: string[];
  selectedMonth: string | null;
}

const CHART_COLORS = ['#10b981', '#6366f1', '#f59e0b', '#ef4444', '#8b5cf6'];
const GLASS_STYLE = "backdrop-blur-xl bg-card/70 border border-border shadow-xl";

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

function UnitCard({ unit, onClick }: { unit: DashboardData['units'][0]; onClick: () => void }) {
  const inhousePercent = unit.totalSale > 0 ? (unit.inhouseSale / unit.totalSale * 100) : 0;
  
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
      </div>
    </motion.div>
  );
}

export default function SalesPage() {
  const [, setLocation] = useLocation();
  const [selectedMonth, setSelectedMonth] = useState<string>('');

  const { data: dashboardData, isLoading, isError } = useQuery<DashboardData>({
    queryKey: ['/api/sales/dashboard', selectedMonth],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedMonth) params.set('month', selectedMonth);
      const res = await fetch(`/api/sales/dashboard?${params}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('gms_token')}` }
      });
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

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

  return (
    <div className="p-4 sm:p-6 space-y-6 bg-background min-h-screen">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Sales Dashboard</h1>
          <p className="text-muted-foreground text-sm sm:text-base">Executive overview of sales performance</p>
        </div>
        <Select value={selectedMonth || "all"} onValueChange={(v) => setSelectedMonth(v === "all" ? "" : v)}>
          <SelectTrigger className={`w-full sm:w-[180px] ${GLASS_STYLE}`}>
            <div className="flex items-center">
            <Calendar className="h-4 w-4 mr-2" />
            <SelectValue placeholder="All Months" />
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Months</SelectItem>
            {dashboardData?.availableMonths?.map(m => (
              <SelectItem key={m} value={m}>{format(new Date(m + '-01'), 'MMM yyyy')}</SelectItem>
            ))}
          </SelectContent>
        </Select>
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
                  <UnitCard key={unit.name} unit={unit} onClick={() => handleUnitClick(unit.name)} />
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
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
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
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
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
                <Tooltip formatter={(v: number) => formatCurrency(v)} labelFormatter={(v) => format(new Date(v + '-01'), 'MMMM yyyy')} />
                <Line type="monotone" dataKey="sale" stroke="#6366f1" strokeWidth={3} dot={{ fill: '#6366f1', r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
