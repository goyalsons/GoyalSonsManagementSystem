import { useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { Loader2 } from "lucide-react";

export default function AuthCallbackPage() {
  const [, setLocation] = useLocation();
  const searchParams = useSearch();
  
  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    const token = params.get("token");
    const error = params.get("error");

    const getDefaultLandingPath = (policies?: string[]) => {
      const p = new Set(policies || []);
      if (p.has("attendance.history.view")) return "/attendance/history";
      if (p.has("staff-sales.view")) return "/sales";
      if (p.has("requests.view")) return "/requests";
      return "/";
    };
    
    if (error) {
      setLocation(`/login?error=${encodeURIComponent(error)}`);
      return;
    }
    
    if (token) {
      localStorage.setItem("gms_token", token);
      
      // Fetch user data to redirect based on policies
      fetch("/api/auth/me", {
        headers: {
          "X-Session-Id": token,
        },
      })
        .then((res) => {
          if (res.ok) {
            return res.json();
          }
          throw new Error("Failed to fetch user");
        })
        .then((userData) => {
          if (userData?.policies?.length === 0) {
            window.location.href = "/no-policy";
            return;
          }
          window.location.href = getDefaultLandingPath(userData?.policies);
        })
        .catch(() => {
          window.location.href = "/";
        });
    } else {
      setLocation("/login?error=No authentication token received");
    }
  }, [searchParams, setLocation]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-600 via-pink-500 to-orange-400">
      <div className="bg-white/95 backdrop-blur-md rounded-2xl p-8 shadow-2xl text-center">
        <Loader2 className="h-10 w-10 animate-spin text-purple-600 mx-auto mb-4" />
        <p className="text-gray-700 font-medium">Completing sign in...</p>
      </div>
    </div>
  );
}
