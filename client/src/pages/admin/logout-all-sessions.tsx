import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LogOut, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

export default function LogoutAllSessionsPage() {
  const { user, token } = useAuth();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ count: number; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isDirector = user?.roles?.some((r) => r.name === "Director");

  const handleLogoutAll = async () => {
    if (!isDirector || !token) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/admin/logout-all-sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Session-Id": token,
        },
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Failed to logout all sessions");
      }

      setResult({ count: data.count, message: data.message });
      // Redirect to login after a short delay (Director's session is also logged out)
      setTimeout(() => {
        window.location.href = "/login?error=Session+expired";
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  if (!isDirector) {
    return (
      <div className="container max-w-2xl py-8">
        <Card>
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>Only Director can access this page.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-2xl py-8">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LogOut className="h-5 w-5" />
            Logout All Sessions
          </CardTitle>
          <CardDescription>
            Log out all users from the system at once. Everyone will be redirected to the login page in real time.
            Use this to force a system-wide logout (e.g. security incident or end of day).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="rounded-lg bg-destructive/10 px-4 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
          {result && (
            <div className="rounded-lg bg-green-500/10 px-4 py-2 text-sm text-green-700 dark:text-green-400">
              {result.message}
            </div>
          )}
          <Button
            variant="destructive"
            size="lg"
            onClick={handleLogoutAll}
            disabled={loading}
            className="gap-2"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <LogOut className="h-4 w-4" />
            )}
            {loading ? "Logging out all users..." : "Logout All Users"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
