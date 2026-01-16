import { Switch, Route, useLocation } from "wouter";
import { lazy, Suspense, useEffect } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { ThemeProvider } from "@/lib/theme-context";
import MainLayout from "@/components/MainLayout";

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

// Route guard component to redirect users away from restricted routes
function ProtectedRoute({ 
  component: Component, 
  isMDOOnly = false,
  isSalesmanOnly = false,
  isSMDesignationOnly = false,
  allowManagers = false
}: { 
  component: React.ComponentType<any>; 
  isMDOOnly?: boolean;
  isSalesmanOnly?: boolean;
  isSMDesignationOnly?: boolean;
  allowManagers?: boolean; // Allow managers (who are employees) to access
}) {
  const { user, hasRole, isManager } = useAuth();
  const [, setLocation] = useLocation();
  const isMember = user?.loginType === "employee";
  const isMDO = user?.loginType === "mdo";
  const isSalesman = hasRole("Salesman");
  const isSMDesignation = user?.employee?.designationCode?.toUpperCase() === "SM";
  const managerStatus = isManager();

  useEffect(() => {
    // If allowManagers is true, managers (who are employees) can access
    if (isMDOOnly && isMember && !(allowManagers && managerStatus)) {
      // Redirect members trying to access MDO-only routes to dashboard (unless they're managers)
      setLocation("/");
    }
    // For Sales Staff: MDO users can always access, members need Salesman role
    if (isSalesmanOnly && isMember && !isSalesman) {
      // Redirect non-salesman members trying to access Sales Staff to dashboard
      setLocation("/");
    }
    // For Sales Staff with SM designation: MDO users can always access, members need SM designation
    if (isSMDesignationOnly && isMember && !isSMDesignation) {
      // Redirect members without SM designation trying to access Sales Staff to dashboard
      setLocation("/");
    }
  }, [isMDOOnly, isSalesmanOnly, isSMDesignationOnly, isMember, isMDO, isSalesman, isSMDesignation, allowManagers, managerStatus, setLocation]);

  // Don't render component for unauthorized access
  // If allowManagers is true, managers (who are employees) can access
  if (isMDOOnly && isMember && !(allowManagers && managerStatus)) {
    return null;
  }
  // MDO users can always access Sales Staff, but members need Salesman role
  if (isSalesmanOnly && isMember && !isSalesman) {
    return null;
  }
  // MDO users can always access Sales Staff, but members need SM designation
  if (isSMDesignationOnly && isMember && !isSMDesignation) {
    return null;
  }

  return <Component />;
}

function AuthenticatedRoutes() {
  const { user } = useAuth();
  const [location] = useLocation();
  const isMDO = user?.loginType === "mdo";
  const isEmployee = user?.loginType === "employee";
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

          {!isEmployee && (
            <>
              <Route path="/" component={Dashboard} />
              <Route path="/dashboard" component={Dashboard} />
              <Route path="/mdo/dashboard" component={Dashboard} />
            </>
          )}

          <Route path="/roles-assigned" component={RolesAssignedPage} />
          <Route path="/roles" component={RolesPage} />
          <Route path="/roles/:id" component={EditRolePage} />
          <Route path="/roles/manager/assign" component={AssignManagerPage} />

          <Route path="/employees" component={EmployeesPage} />
          <Route path="/employees/create" component={CreateEmployeePage} />

          <Route path="/attendance" component={AttendancePage} />
          <Route path="/attendance/today" component={TodayAttendancePage} />
          <Route path="/attendance/fill" component={FillAttendancePage} />
          <Route path="/attendance/history" component={AttendanceHistoryPage} />
          <Route path="/work-log" component={AttendanceHistoryPage} />

          <Route path="/integrations/fetched-data" component={FetchedDataPage} />

          <Route path="/sales" component={SalesPage} />
          <Route path="/sales/unit/:unitName" component={SalesUnitPage} />
          <Route path="/sales-staff" component={SalesStaffPage} />
          <Route path="/assigned-manager" component={AssignedManagerPage} />
          <Route path="/manager/dashboard" component={ManagerDashboardPage} />
          <Route path="/manager/team-task-history" component={TeamTaskHistoryPage} />
          <Route path="/manager/team-sales-staff" component={TeamSalesStaffPage} />
          <Route path="/requests" component={RequestsPage} />
          <Route path="/salary" component={SalaryPage} />

          {isMDO && <Route path="/settings" component={SettingsPage} />}
          <Route path="/admin/routing" component={ApiRoutingPage} />
          <Route path="/admin/master-settings" component={MasterSettingsPage} />
          <Route path="/training" component={TrainingPage} />
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
