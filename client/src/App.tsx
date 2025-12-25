import { Switch, Route, useLocation } from "wouter";
import { lazy, Suspense, useEffect } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { ThemeProvider } from "@/lib/theme-context";
import MainLayout from "@/components/MainLayout";

// Lazy load all page components
const NotFound = lazy(() => import("@/pages/not-found"));
const Dashboard = lazy(() => import("@/pages/dashboard"));
const LoginPage = lazy(() => import("@/pages/login"));
const ApplyPage = lazy(() => import("@/pages/apply"));
const AuthCallbackPage = lazy(() => import("@/pages/auth-callback"));
const AttendancePage = lazy(() => import("@/pages/attendance"));
const TodayAttendancePage = lazy(() => import("@/pages/attendance/today"));
const FillAttendancePage = lazy(() => import("@/pages/attendance/fill"));
const AttendanceHistoryPage = lazy(() => import("@/pages/attendance/history"));
const TrainingPage = lazy(() => import("@/pages/training"));
const UsersListPage = lazy(() => import("@/pages/users/index"));
const CreateUserPage = lazy(() => import("@/pages/users/create"));
const RolesPage = lazy(() => import("@/pages/roles/index"));
const EditRolePage = lazy(() => import("@/pages/roles/[id]"));
const AssignManagerPage = lazy(() => import("@/pages/roles/manager/assign"));
const EmployeesPage = lazy(() => import("@/pages/employees/index"));
const CreateEmployeePage = lazy(() => import("@/pages/employees/create"));
const SettingsPage = lazy(() => import("@/pages/settings"));
const ApiRoutingPage = lazy(() => import("@/pages/admin/routing"));
const MasterSettingsPage = lazy(() => import("@/pages/admin/master-settings"));
const MyTargetsPage = lazy(() => import("@/pages/targets/my"));
const TeamTargetsPage = lazy(() => import("@/pages/targets/team"));
const MyTasksPage = lazy(() => import("@/pages/tasks/my"));
const TeamTasksPage = lazy(() => import("@/pages/tasks/team"));
const MyClaimsPage = lazy(() => import("@/pages/claims/my"));
const TeamClaimsPage = lazy(() => import("@/pages/claims/team"));
const MyAnnouncementsPage = lazy(() => import("@/pages/announcements/my"));
const TeamAnnouncementsPage = lazy(() => import("@/pages/announcements/team"));
const FetchedDataPage = lazy(() => import("@/pages/integrations/fetched-data"));
const SalesPage = lazy(() => import("@/pages/sales/index"));
const SalesUnitPage = lazy(() => import("@/pages/sales/unit"));
const SalesStaffPage = lazy(() => import("@/pages/sales-staff"));

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
  isSMDesignationOnly = false
}: { 
  component: React.ComponentType<any>; 
  isMDOOnly?: boolean;
  isSalesmanOnly?: boolean;
  isSMDesignationOnly?: boolean;
}) {
  const { user, hasRole } = useAuth();
  const [, setLocation] = useLocation();
  const isMember = user?.loginType === "employee";
  const isMDO = user?.loginType === "mdo";
  const isSalesman = hasRole("Salesman");
  const isSMDesignation = user?.employee?.designationCode?.toUpperCase() === "SM";

  useEffect(() => {
    if (isMDOOnly && isMember) {
      // Redirect members trying to access MDO-only routes to dashboard
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
  }, [isMDOOnly, isSalesmanOnly, isSMDesignationOnly, isMember, isMDO, isSalesman, isSMDesignation, setLocation]);

  // Don't render component for unauthorized access
  if (isMDOOnly && isMember) {
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
  const { user, hasRole } = useAuth();
  const [location] = useLocation();
  const isMDO = user?.loginType === "mdo";
  const isEmployee = user?.loginType === "employee";

  return (
    <MainLayout>
      <Suspense fallback={<PageLoader />}>
        <Switch>
          {/* Hide dashboard for employees temporarily - only show for MDO users */}
          {!isEmployee && (
            <>
              <Route path="/" component={Dashboard} />
              <Route path="/dashboard" component={Dashboard} />
            </>
          )}
          
          <Route path="/users" component={UsersListPage} />
          <Route path="/users/create" component={CreateUserPage} />
          <Route path="/roles" component={RolesPage} />
          <Route path="/roles/:id" component={EditRolePage} />
          <Route path="/roles/manager/assign" component={AssignManagerPage} />
          
          <Route path="/employees" component={EmployeesPage} />
          <Route path="/employees/create" component={CreateEmployeePage} />
          
          {/* MDO-only routes - redirect members */}
          <Route path="/targets/my">
            {() => <ProtectedRoute component={MyTargetsPage} isMDOOnly={true} />}
          </Route>
          <Route path="/targets/team">
            {() => <ProtectedRoute component={TeamTargetsPage} isMDOOnly={true} />}
          </Route>
          
          {/* Work Log routes - MDO only, redirect members */}
          <Route path="/attendance">
            {() => <ProtectedRoute component={AttendancePage} isMDOOnly={true} />}
          </Route>
          <Route path="/attendance/today">
            {() => <ProtectedRoute component={TodayAttendancePage} isMDOOnly={true} />}
          </Route>
          <Route path="/attendance/fill">
            {() => <ProtectedRoute component={FillAttendancePage} isMDOOnly={true} />}
          </Route>
          {/* Task History is accessible to both members and MDO */}
          <Route path="/attendance/history" component={AttendanceHistoryPage} />
          {/* Work Log route - alias for attendance history */}
          <Route path="/work-log" component={AttendanceHistoryPage} />
          
          {/* MDO-only routes - redirect members */}
          <Route path="/tasks/my">
            {() => <ProtectedRoute component={MyTasksPage} isMDOOnly={true} />}
          </Route>
          <Route path="/tasks/team">
            {() => <ProtectedRoute component={TeamTasksPage} isMDOOnly={true} />}
          </Route>
          
          {/* MDO-only routes - redirect members */}
          <Route path="/claims/my">
            {() => <ProtectedRoute component={MyClaimsPage} isMDOOnly={true} />}
          </Route>
          <Route path="/claims/team">
            {() => <ProtectedRoute component={TeamClaimsPage} isMDOOnly={true} />}
          </Route>
          
          {/* MDO-only routes - redirect members */}
          <Route path="/announcements/my">
            {() => <ProtectedRoute component={MyAnnouncementsPage} isMDOOnly={true} />}
          </Route>
          <Route path="/announcements/team">
            {() => <ProtectedRoute component={TeamAnnouncementsPage} isMDOOnly={true} />}
          </Route>
          
          <Route path="/integrations/fetched-data" component={FetchedDataPage} />
          
          <Route path="/sales" component={SalesPage} />
          <Route path="/sales/unit/:unitName" component={SalesUnitPage} />
          {/* Sales Staff route - accessible to all members and MDO */}
          <Route path="/sales-staff" component={SalesStaffPage} />
          
          {isMDO && <Route path="/settings" component={SettingsPage} />}
          <Route path="/admin/routing" component={ApiRoutingPage} />
          <Route path="/admin/master-settings" component={MasterSettingsPage} />
          
          {/* MDO-only route - redirect members */}
          <Route path="/training">
            {() => <ProtectedRoute component={TrainingPage} isMDOOnly={true} />}
          </Route>
          <Route component={NotFound} />
        </Switch>
      </Suspense>
    </MainLayout>
  );
}

function Router() {
  const [location, setLocation] = useLocation();
  const { user, isLoading, hasRole } = useAuth();
  
  // Always allow these public routes
  if (location === "/login") {
    return (
      <Suspense fallback={<FullPageLoader />}>
        <LoginPage />
      </Suspense>
    );
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
  
  // Show loading while checking auth status
  if (isLoading) {
    return <FullPageLoader />;
  }
  
  // If not authenticated, redirect to login
  if (!user) {
    setLocation("/login");
    return (
      <Suspense fallback={<FullPageLoader />}>
        <LoginPage />
      </Suspense>
    );
  }
  
  // Role-based redirect on page load (only for root/dashboard routes)
  // Check if user has "sales_staff" role and redirect accordingly
  useEffect(() => {
    // Only redirect if we're on root or dashboard route
    if (location === "/" || location === "/dashboard") {
      const isSalesStaff = hasRole("sales_staff") || hasRole("Sales Staff");
      
      if (isSalesStaff) {
        // Redirect to sales staff page
        setLocation("/sales-staff");
      } else if (user?.loginType === "employee") {
        // For other employees, redirect to work log page
        setLocation("/work-log");
      }
      // MDO users can access dashboard normally
    }
  }, [location, user, hasRole, setLocation]);
  
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
