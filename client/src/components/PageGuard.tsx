/**
 * PageGuard Component
 * 
 * Protects routes by checking if user has the required policy.
 * 
 * Usage:
 * <PageGuard policy="dashboard.view">
 *   <DashboardPage />
 * </PageGuard>
 */

import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { getPolicyForPath } from "@/config/nav.config";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldX, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PageGuardProps {
  children: React.ReactNode;
  policy?: string; // Optional explicit policy, otherwise uses path from location
  fallback?: React.ReactNode; // Custom fallback UI
}

export function PageGuard({ children, policy, fallback }: PageGuardProps) {
  const [location] = useLocation();
  const { user, hasPolicy, isLoading } = useAuth();

  // Wait for auth to load
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  // No user = not authenticated (will be handled by useRequireAuth in App)
  if (!user) {
    return null;
  }

  // If user has zero policies, redirect to No Policy page
  if (!user.policies || user.policies.length === 0) {
    if (location !== "/no-policy") {
      window.location.href = "/no-policy";
      return null;
    }
    return <>{children}</>;
  }

  // SuperAdmin bypasses all checks
  if (user.isSuperAdmin) {
    return <>{children}</>;
  }

  // Determine policy to check
  const requiredPolicy = policy || getPolicyForPath(location);

  // If no policy required (null), allow access
  if (requiredPolicy === null) {
    return <>{children}</>;
  }

  // Check if user has the required policy
  if (!hasPolicy(requiredPolicy)) {
    // Use custom fallback if provided
    if (fallback) {
      return <>{fallback}</>;
    }

    // Default access denied UI
    return (
      <div className="flex items-center justify-center min-h-[400px] p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex items-center gap-3 mb-2">
              <ShieldX className="h-8 w-8 text-destructive" />
              <CardTitle>Access Denied</CardTitle>
            </div>
            <CardDescription>
              You don't have permission to access this page.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-start gap-2 p-3 bg-muted rounded-lg">
                <AlertCircle className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
                <div className="text-sm text-muted-foreground">
                  <p className="font-medium mb-1">Required Policy:</p>
                  <code className="text-xs bg-background px-2 py-1 rounded">{requiredPolicy}</code>
                </div>
              </div>
              <Button 
                onClick={() => window.history.back()} 
                variant="outline" 
                className="w-full"
              >
                Go Back
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // User has required policy, render children
  return <>{children}</>;
}

/**
 * Hook to check if current page requires a policy and if user has it
 */
export function usePagePolicy() {
  const [location] = useLocation();
  const { hasPolicy } = useAuth();
  const policy = getPolicyForPath(location);
  
  return {
    policy,
    hasAccess: policy === null || hasPolicy(policy),
    hasPolicy: (p: string) => hasPolicy(p),
  };
}
