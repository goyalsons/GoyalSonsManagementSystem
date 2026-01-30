import { Switch, Route, useLocation } from "wouter";
import { lazy, Suspense, useEffect } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { ThemeProvider } from "@/lib/theme-context";
import MainLayout from "@/components/MainLayout";
import { PageGuard } from "@/components/PageGuard";

// Eagerly load critical above-the-fold routes (Login, Dashboard)
import Dashboard from "@/pages/dashboard";
import LoginPage from "@/pages/login";

// Lazy load below-the-fold page components
const NotFound = lazy(() => import("@/pages/not-found"));
const ApplyPage = lazy(() => import("@/pages/apply"));
const AuthCallbackPage = lazy(() => import("@/pages/auth-callback"));
const AttendancePage = lazy(() => import("@/pages/attendance"));
const TodayAttendancePage = lazy(() => import("@/pages/attendance/today"));
const FillAttendancePage = lazy(() => import("@/pages/attendance/fill"));
const AttendanceHistoryPage = lazy(() => import("@/pages/attendance/history"));
const TrainingPage = lazy(() => import("@/pages/training"));
const RolesPage = lazy(() => import("@/pages/roles/index"));
const EditRolePage = lazy(() => import("@/pages/roles/[id]"));
const AssignManagerPage = lazy(() => import("@/pages/roles/manager/assign"));
const RolesAssignedPage = lazy(() => import("@/pages/roles-assigned/index"));
const EmployeesPage = lazy(() => import("@/pages/employees/index"));
const CreateEmployeePage = lazy(() => import("@/pages/employees/create"));
const SettingsPage = lazy(() => import("@/pages/settings"));
const ApiRoutingPage = lazy(() => import("@/pages/admin/routing"));
const MasterSettingsPage = lazy(() => import("@/pages/admin/master-settings"));
const FetchedDataPage = lazy(() => import("@/pages/integrations/fetched-data"));
const SalesPage = lazy(() => import("@/pages/sales/index"));
const SalesUnitPage = lazy(() => import("@/pages/sales/unit"));
const SalesStaffPage = lazy(() => import("@/pages/sales-staff"));
const AssignedManagerPage = lazy(() => import("@/pages/assigned-manager"));
const TeamTaskHistoryPage = lazy(() => import("@/pages/manager/team-task-history"));
const TeamSalesStaffPage = lazy(() => import("@/pages/manager/team-sales-staff"));
const ManagerDashboardPage = lazy(() => import("@/pages/manager/dashboard"));
const RequestsPage = lazy(() => import("@/pages/requests/index"));
const TeamRequestsPage = lazy(() => import("@/pages/requests/team"));
const TeamAttendancePage = lazy(() => import("@/pages/attendance/team"));
const SalaryPage = lazy(() => import("@/pages/salary"));
const NoPolicyPage = lazy(() => import("@/pages/no-policy"));

// Loading spinner component for Suspense fallback
function PageLoader() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-3 border-primary/20 border-t-primary" />
        <p className="text-muted-foreground text-sm">Loading...</p>
      </div>
    </div>
  );
}

// Full page loader for auth checks
function FullPageLoader() {
  return (
    <div className="min-h-screen min-h-[100dvh] flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="flex flex-col items-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/20 border-t-cyan-400" />
        <p className="text-white/60 text-sm">Loading...</p>
      </div>
    </div>
  );
}

function AuthenticatedRoutes() {
  const { user } = useAuth();
  const [location] = useLocation();
  const hasNoPolicies = !user?.policies || user.policies.length === 0;

  // If user has no policies, force them to the No Policy page
  if (hasNoPolicies && location !== "/no-policy") {
    return <NoPolicyPage />;
  }

  return (
    <MainLayout>
      <Suspense fallback={<PageLoader />}>
        <Switch>
          <Route path="/no-policy" component={NoPolicyPage} />

          <Route path="/" component={() => (
            <PageGuard policy="dashboard.view"><Dashboard /></PageGuard>
          )} />
          <Route path="/dashboard" component={() => (
            <PageGuard policy="dashboard.view"><Dashboard /></PageGuard>
          )} />
          <Route path="/mdo/dashboard" component={() => (
            <PageGuard policy="dashboard.view"><Dashboard /></PageGuard>
          )} />

          <Route path="/roles-assigned" component={() => (
            <PageGuard policy="roles-assigned.view"><RolesAssignedPage /></PageGuard>
          )} />
          <Route path="/roles" component={() => (
            <PageGuard policy="roles-assigned.view"><RolesPage /></PageGuard>
          )} />
          <Route path="/roles/:id" component={() => (
            <PageGuard policy="roles-assigned.view"><EditRolePage /></PageGuard>
          )} />
          <Route path="/roles/manager/assign" component={() => (
            <PageGuard policy="roles-assigned.view"><AssignManagerPage /></PageGuard>
          )} />

          <Route path="/employees" component={() => (
            <PageGuard policy="employees.view"><EmployeesPage /></PageGuard>
          )} />
          <Route path="/employees/create" component={() => (
            <PageGuard policy="employees.view"><CreateEmployeePage /></PageGuard>
          )} />

          <Route path="/attendance" component={() => (
            <PageGuard policy="attendance.worklog.view"><AttendancePage /></PageGuard>
          )} />
          <Route path="/attendance/today" component={() => (
            <PageGuard policy="attendance.worklog.view"><TodayAttendancePage /></PageGuard>
          )} />
          <Route path="/attendance/fill" component={() => (
            <PageGuard policy="attendance.worklog.view"><FillAttendancePage /></PageGuard>
          )} />
          <Route path="/attendance/history" component={() => (
            <PageGuard policy="attendance.history.view"><AttendanceHistoryPage /></PageGuard>
          )} />
          <Route path="/work-log" component={() => (
            <PageGuard policy="attendance.history.view"><AttendanceHistoryPage /></PageGuard>
          )} />
          <Route path="/attendance/team" component={() => (
            <PageGuard policy="attendance.team.view"><TeamAttendancePage /></PageGuard>
          )} />

          <Route path="/integrations/fetched-data" component={() => (
            <PageGuard policy="integrations.fetched-data.view"><FetchedDataPage /></PageGuard>
          )} />

          <Route path="/sales" component={() => (
            <PageGuard policy="staff-sales.view"><SalesPage /></PageGuard>
          )} />
          <Route path="/sales/unit/:unitName" component={() => (
            <PageGuard policy="staff-sales.view"><SalesUnitPage /></PageGuard>
          )} />
          <Route path="/sales-staff" component={() => (
            <PageGuard policy="sales-staff.view"><SalesStaffPage /></PageGuard>
          )} />
          <Route path="/assigned-manager" component={() => (
            <PageGuard policy="assigned-manager.view"><AssignedManagerPage /></PageGuard>
          )} />
          <Route path="/manager/dashboard" component={() => (
            <PageGuard policy="assigned-manager.view"><ManagerDashboardPage /></PageGuard>
          )} />
          <Route path="/manager/team-task-history" component={() => (
            <PageGuard policy="assigned-manager.view"><TeamTaskHistoryPage /></PageGuard>
          )} />
          <Route path="/manager/team-sales-staff" component={() => (
            <PageGuard policy="assigned-manager.view"><TeamSalesStaffPage /></PageGuard>
          )} />
          <Route path="/requests" component={() => (
            <PageGuard policy="requests.view"><RequestsPage /></PageGuard>
          )} />
          <Route path="/requests/team" component={() => (
            <PageGuard policy="requests.team.view"><TeamRequestsPage /></PageGuard>
          )} />
          <Route path="/salary" component={() => (
            <PageGuard policy="salary.view"><SalaryPage /></PageGuard>
          )} />

          <Route path="/settings" component={() => (
            <PageGuard policy="settings.view"><SettingsPage /></PageGuard>
          )} />
          <Route path="/admin/routing" component={() => (
            <PageGuard policy="admin.routing.view"><ApiRoutingPage /></PageGuard>
          )} />
          <Route path="/admin/master-settings" component={() => (
            <PageGuard policy="admin.master-settings.view"><MasterSettingsPage /></PageGuard>
          )} />
          <Route path="/training" component={() => (
            <PageGuard policy="trainings.view"><TrainingPage /></PageGuard>
          )} />
          <Route component={NotFound} />
        </Switch>
      </Suspense>
    </MainLayout>
  );
}

function Router() {
  const [location, setLocation] = useLocation();
  const { user, isLoading } = useAuth();
  const hasNoPolicies = user && (!user.policies || user.policies.length === 0);

  // Redirect to /no-policy if user has no policies
  useEffect(() => {
    if (user && hasNoPolicies && location !== "/no-policy") {
      setLocation("/no-policy");
    }
  }, [location, user, hasNoPolicies, setLocation]);

  // Redirect to /login if not authenticated (after loading is complete)
  useEffect(() => {
    if (!isLoading && !user && location !== "/login" && location !== "/apply" && !location.startsWith("/auth-callback")) {
      setLocation("/login");
    }
  }, [isLoading, user, location, setLocation]);
  
  // Always allow these public routes
  if (location === "/login") {
    return <LoginPage />;
  }
  
  if (location === "/apply") {
    return (
      <Suspense fallback={<FullPageLoader />}>
        <ApplyPage />
      </Suspense>
    );
  }
  
  if (location.startsWith("/auth-callback")) {
    return (
      <Suspense fallback={<FullPageLoader />}>
        <AuthCallbackPage />
      </Suspense>
    );
  }

  if (location === "/no-policy") {
    return (
      <Suspense fallback={<FullPageLoader />}>
        <NoPolicyPage />
      </Suspense>
    );
  }
  
  // Show loading while checking auth status
  if (isLoading) {
    return <FullPageLoader />;
  }
  
  // If not authenticated, show login page (redirect is handled by useEffect above)
  if (!user) {
    return <LoginPage />;
  }
  
  // User is authenticated, show protected routes
  return <AuthenticatedRoutes />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ThemeProvider>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
        </ThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
