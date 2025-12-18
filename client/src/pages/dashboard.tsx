import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Users, 
  Clock, 
  CheckCircle2, 
  CheckSquare, 
  ArrowUpRight, 
  Calendar,
  Building2,
  Shield,
  TrendingUp,
  ArrowRight,
  Activity,
  BarChart3,
  Bell,
  FileText,
  Target
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { dashboardApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

function AnimatedCard({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  return (
    <div 
      className={`transform transition-all duration-500 ease-out ${
        isVisible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
      } ${className}`}
    >
      {children}
    </div>
  );
}

function StatCard({ 
  title, 
  value, 
  subtitle, 
  icon: Icon, 
  iconColor, 
  iconBg,
  trend,
  loading 
}: { 
  title: string;
  value: string | number;
  subtitle: string;
  icon: any;
  iconColor: string;
  iconBg: string;
  trend?: string | null;
  loading?: boolean;
}) {
  return (
    <Card className="bg-white border-slate-200 hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-500">{title}</p>
            {loading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <p className="text-3xl font-bold text-slate-900">{value}</p>
            )}
            <div className="flex items-center gap-2">
              {trend && (
                <span className="flex items-center text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                  <TrendingUp className="h-3 w-3 mr-0.5" />
                  {trend}
                </span>
              )}
              <p className="text-xs text-slate-400">{subtitle}</p>
            </div>
          </div>
          <div className={`h-12 w-12 rounded-xl ${iconBg} flex items-center justify-center shrink-0`}>
            <Icon className={`h-6 w-6 ${iconColor}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { user, isLoading: authLoading, isEmployeeLogin } = useAuth();
  const isEmployee = isEmployeeLogin();
  const [, setLocation] = useLocation();
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!authLoading && !user) {
      setLocation("/login");
    }
  }, [user, authLoading, setLocation]);

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: dashboardApi.getStats,
    enabled: !!user,
    refetchInterval: 30000,
  });

  const { data: recentCheckins, isLoading: checkinsLoading } = useQuery({
    queryKey: ["recent-checkins"],
    queryFn: dashboardApi.getRecentCheckins,
    enabled: !!user,
    refetchInterval: 30000,
  });

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const roleColors: Record<string, string> = {
    CEO: "bg-amber-100 text-amber-700",
    Management: "bg-blue-100 text-blue-700",
    HR: "bg-emerald-100 text-emerald-700",
    Finance: "bg-purple-100 text-purple-700",
    Employee: "bg-slate-100 text-slate-700",
  };

  const getHonorific = () => {
    const gender = (user as any).employee?.gender?.toLowerCase();
    if (gender === "male" || gender === "m") return "Mr.";
    if (gender === "female" || gender === "f") return "Miss";
    return "";
  };

  const getDisplayName = () => {
    const employee = (user as any).employee;
    if (employee?.firstName) {
      return `${employee.firstName}${employee.lastName ? " " + employee.lastName : ""}`;
    }
    return user.name;
  };

  const getInitialsColor = (index: number) => {
    const colors = [
      "bg-blue-100 text-blue-700",
      "bg-purple-100 text-purple-700",
      "bg-emerald-100 text-emerald-700",
      "bg-amber-100 text-amber-700",
      "bg-pink-100 text-pink-700",
    ];
    return colors[index % colors.length];
  };

  const statCards = isEmployee ? [
    {
      title: "My Attendance",
      value: stats?.todayAttendance || "Pending",
      subtitle: "Today's status",
      icon: CheckCircle2,
      iconBg: "bg-emerald-100",
      iconColor: "text-emerald-600",
    },
    {
      title: "My Pending Tasks",
      value: stats?.myPendingTasks || 0,
      subtitle: "Requires your attention",
      icon: CheckSquare,
      iconBg: "bg-amber-100",
      iconColor: "text-amber-600",
    },
    {
      title: "My Targets",
      value: stats?.myTargets || 0,
      subtitle: "Active targets",
      icon: Target,
      iconBg: "bg-purple-100",
      iconColor: "text-purple-600",
    },
    {
      title: "My Claims",
      value: stats?.myClaims || 0,
      subtitle: "Pending claims",
      icon: FileText,
      iconBg: "bg-blue-100",
      iconColor: "text-blue-600",
    },
  ] : [
    {
      title: "Total Members",
      value: stats?.employees?.toLocaleString() || 0,
      subtitle: "In your org scope",
      icon: Users,
      iconBg: "bg-blue-100",
      iconColor: "text-blue-600",
    },
    {
      title: "Attendance Today",
      value: stats?.todayAttendance?.toLocaleString() || 0,
      subtitle: `${stats?.attendanceRate || 0}% attendance rate`,
      icon: CheckCircle2,
      iconBg: "bg-emerald-100",
      iconColor: "text-emerald-600",
      trend: stats?.attendanceRate ? `${stats.attendanceRate}%` : null,
    },
    {
      title: "My Pending Tasks",
      value: stats?.myPendingTasks || 0,
      subtitle: "Requires your attention",
      icon: CheckSquare,
      iconBg: "bg-amber-100",
      iconColor: "text-amber-600",
    },
    {
      title: "Departments",
      value: user.accessibleOrgUnitIds.length,
      subtitle: "Accessible to you",
      icon: Building2,
      iconBg: "bg-purple-100",
      iconColor: "text-purple-600",
    },
  ];

  const quickActions = isEmployee ? [
    { icon: CheckSquare, label: "My Tasks", href: "/tasks/my", color: "text-amber-600" },
    { icon: Target, label: "My Targets", href: "/targets/my", color: "text-emerald-600" },
    { icon: FileText, label: "My Claims", href: "/claims/my", color: "text-purple-600" },
    { icon: Calendar, label: "Attendance", href: "/attendance", color: "text-blue-600" },
  ] : [
    { icon: Users, label: "Members", href: "/employees", color: "text-blue-600" },
    { icon: CheckSquare, label: "My Tasks", href: "/tasks/my", color: "text-amber-600" },
    { icon: Target, label: "Targets", href: "/targets/my", color: "text-emerald-600" },
    { icon: FileText, label: "Claims", href: "/claims/my", color: "text-purple-600" },
  ];

  return (
    <div className="space-y-6">
      <AnimatedCard delay={0}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"}, {getHonorific()} {getDisplayName()}
            </h1>
            <p className="text-slate-500 mt-1">Here's what's happening with your organization today.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {user.roles.map((role) => (
              <span 
                key={role.id} 
                className={`px-3 py-1.5 rounded-full text-xs font-medium ${roleColors[role.name] || "bg-slate-100 text-slate-700"}`}
              >
                {role.name}
              </span>
            ))}
            <div className="hidden lg:flex items-center gap-3 px-4 py-2 rounded-lg bg-white border border-slate-200 shadow-sm">
              <Calendar className="h-4 w-4 text-slate-400" />
              <span className="text-sm text-slate-600">
                {currentTime.toLocaleDateString("en-US", { 
                  weekday: "short",
                  month: "short", 
                  day: "2-digit", 
                  year: "numeric" 
                })}
              </span>
              <div className="w-px h-4 bg-slate-200"></div>
              <Clock className="h-4 w-4 text-slate-400" />
              <span className="text-sm font-medium text-slate-700 tabular-nums">
                {currentTime.toLocaleTimeString("en-US", { 
                  hour: "2-digit", 
                  minute: "2-digit",
                  hour12: true 
                })}
              </span>
            </div>
          </div>
        </div>
      </AnimatedCard>

      {user.isSuperAdmin && (
        <AnimatedCard delay={100}>
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-amber-100 flex items-center justify-center">
              <Shield className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-amber-900">Super Admin Access</p>
              <p className="text-xs text-amber-700">You have full access to all organization data</p>
            </div>
          </div>
        </AnimatedCard>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat, i) => (
          <AnimatedCard key={i} delay={150 + i * 50}>
            <StatCard {...stat} loading={statsLoading} />
          </AnimatedCard>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <AnimatedCard delay={400} className="lg:col-span-2">
          <Card className="bg-white border-slate-200">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-semibold text-slate-900">Recent Check-ins</CardTitle>
                <Link href="/attendance/today">
                  <Button variant="ghost" size="sm" className="text-blue-600 hover:text-blue-700 hover:bg-blue-50">
                    View All
                    <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {checkinsLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="flex items-center gap-3">
                      <Skeleton className="h-10 w-10 rounded-full" />
                      <div className="flex-1">
                        <Skeleton className="h-4 w-32 mb-1" />
                        <Skeleton className="h-3 w-24" />
                      </div>
                      <Skeleton className="h-4 w-16" />
                    </div>
                  ))}
                </div>
              ) : recentCheckins && recentCheckins.length > 0 ? (
                <div className="space-y-3">
                  {recentCheckins.slice(0, 5).map((checkin: any, i: number) => (
                    <div key={i} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 transition-colors">
                      <div className={`h-10 w-10 rounded-full ${getInitialsColor(i)} flex items-center justify-center text-sm font-medium`}>
                        {checkin.employee?.firstName?.charAt(0) || "?"}{checkin.employee?.lastName?.charAt(0) || ""}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">
                          {checkin.employee?.firstName} {checkin.employee?.lastName}
                        </p>
                        <p className="text-xs text-slate-500 truncate">
                          {checkin.employee?.department?.name || "No Department"}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium text-emerald-600">
                          {checkin.checkIn ? new Date(checkin.checkIn).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : "--:--"}
                        </p>
                        <p className="text-xs text-slate-400">Check-in</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Activity className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-500">No check-ins today</p>
                </div>
              )}
            </CardContent>
          </Card>
        </AnimatedCard>

        <AnimatedCard delay={450}>
          <Card className="bg-white border-slate-200 h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-semibold text-slate-900">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                {quickActions.map((action, i) => (
                  <Link key={i} href={action.href}>
                    <div className="p-4 rounded-xl border border-slate-200 hover:border-blue-200 hover:bg-blue-50/50 transition-all cursor-pointer group">
                      <action.icon className={`h-6 w-6 ${action.color} mb-2 group-hover:scale-110 transition-transform`} />
                      <p className="text-sm font-medium text-slate-700">{action.label}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        </AnimatedCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <AnimatedCard delay={500}>
          <Card className="bg-white border-slate-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-semibold text-slate-900">Your Permissions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {user.policies.slice(0, 9).map((policy, i) => (
                  <div 
                    key={i}
                    className="px-3 py-2 rounded-lg bg-slate-50 border border-slate-200"
                  >
                    <p className="text-xs font-medium text-slate-600 truncate">{policy.key}</p>
                  </div>
                ))}
                {user.policies.length > 9 && (
                  <div className="px-3 py-2 rounded-lg bg-blue-50 border border-blue-200">
                    <p className="text-xs font-medium text-blue-600">+{user.policies.length - 9} more</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </AnimatedCard>

        <AnimatedCard delay={550}>
          <Card className="bg-white border-slate-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-semibold text-slate-900">System Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></div>
                    <span className="text-sm font-medium text-emerald-700">All Systems Operational</span>
                  </div>
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="text-sm text-slate-600">Last Sync</span>
                  <span className="text-sm font-medium text-slate-900">Just now</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="text-sm text-slate-600">Active Users</span>
                  <span className="text-sm font-medium text-slate-900">{stats?.activeUsers || 1}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </AnimatedCard>
      </div>
    </div>
  );
}
