import { Switch, Route, useLocation } from "wouter";
import { lazy, Suspense } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth-context";
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

function AuthenticatedRoutes() {
  return (
    <MainLayout>
      <Suspense fallback={<PageLoader />}>
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/dashboard" component={Dashboard} />
          
          <Route path="/users" component={UsersListPage} />
          <Route path="/users/create" component={CreateUserPage} />
          <Route path="/roles" component={RolesPage} />
          <Route path="/roles/:id" component={EditRolePage} />
          
          <Route path="/employees" component={EmployeesPage} />
          <Route path="/employees/create" component={CreateEmployeePage} />
          
          <Route path="/targets/my" component={MyTargetsPage} />
          <Route path="/targets/team" component={TeamTargetsPage} />
          
          <Route path="/attendance" component={AttendancePage} />
          <Route path="/attendance/today" component={TodayAttendancePage} />
          <Route path="/attendance/fill" component={FillAttendancePage} />
          <Route path="/attendance/history" component={AttendanceHistoryPage} />
          
          <Route path="/tasks/my" component={MyTasksPage} />
          <Route path="/tasks/team" component={TeamTasksPage} />
          
          <Route path="/claims/my" component={MyClaimsPage} />
          <Route path="/claims/team" component={TeamClaimsPage} />
          
          <Route path="/announcements/my" component={MyAnnouncementsPage} />
          <Route path="/announcements/team" component={TeamAnnouncementsPage} />
          
          <Route path="/integrations/fetched-data" component={FetchedDataPage} />
          
          <Route path="/sales" component={SalesPage} />
          <Route path="/sales/unit/:unitName" component={SalesUnitPage} />
          <Route path="/sales-staff" component={SalesStaffPage} />
          
          <Route path="/settings" component={SettingsPage} />
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
  
  // User is authenticated, show protected routes
  return <AuthenticatedRoutes />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
