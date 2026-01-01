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
    
    if (error) {
      setLocation(`/login?error=${encodeURIComponent(error)}`);
      return;
    }
    
    if (token) {
      localStorage.setItem("gms_token", token);
      
      // Fetch user data to check if manager
      fetch("/api/auth/me", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
        .then((res) => {
          if (res.ok) {
            return res.json();
          }
          throw new Error("Failed to fetch user");
        })
        .then((userData) => {
          if (userData.isManager) {
            window.location.href = "/manager/dashboard";
          } else {
            window.location.href = "/";
          }
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
