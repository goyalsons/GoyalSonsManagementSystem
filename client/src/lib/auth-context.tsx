import { createContext, useContext, useState, useEffect, useRef, ReactNode } from "react";
import { useLocation } from "wouter";

const SESSION_EXPIRY_MS = 2 * 60 * 60 * 1000; // 2 hours
const GMS_TOKEN = "gms_token";
const GMS_LOGIN_AT = "gms_login_at";

function setTokenAndLoginAt(token: string): void {
  localStorage.setItem(GMS_TOKEN, token);
  localStorage.setItem(GMS_LOGIN_AT, String(Date.now()));
}

function clearAuthStorage(): void {
  localStorage.removeItem(GMS_TOKEN);
  localStorage.removeItem(GMS_LOGIN_AT);
}

export interface UserAuth {
  id: string;
  name: string;
  email: string;
  orgUnitId: string | null;
  roles: { id: string; name: string }[];
  policies: string[];
  accessibleOrgUnitIds: string[];
  loginType: "mdo" | "employee";
  employeeCardNo: string | null;
  employeeId: string | null;
  employee?: {
    firstName: string;
    lastName: string | null;
    gender: string | null;
    designationCode: string | null;
    designationName: string | null;
  } | null;
}

interface AuthContextType {
  user: UserAuth | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  hasPolicy: (policy: string) => boolean;
  canAccessOrg: (orgUnitId: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserAuth | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [, setLocation] = useLocation();
  const logoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sseAbortRef = useRef<AbortController | null>(null);

  // SSE client: real-time session invalidation when Director triggers "logout all"
  // Uses fetch + ReadableStream (EventSource doesn't support X-Session-Id header)
  useEffect(() => {
    const t = token || localStorage.getItem(GMS_TOKEN);
    if (!t || !user) return;

    const ac = new AbortController();
    sseAbortRef.current = ac;

    const connect = () => {
      fetch("/api/auth/session-events", {
        headers: { "X-Session-Id": t },
        signal: ac.signal,
      })
        .then((res) => {
          if (!res.ok || !res.body) return;
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buf = "";
          const read = () =>
            reader.read().then(({ done, value }) => {
              if (done) return;
              buf += decoder.decode(value, { stream: true });
              const lines = buf.split("\n\n");
              buf = lines.pop() || "";
              for (const block of lines) {
                const m = block.match(/^data:\s*(.+)$/m);
                if (m) {
                  try {
                    const data = JSON.parse(m[1]);
                    if (data.event === "logout_all") {
                      clearAuthStorage();
                      setToken(null);
                      setUser(null);
                      if (logoutTimerRef.current) {
                        clearTimeout(logoutTimerRef.current);
                        logoutTimerRef.current = null;
                      }
                      window.location.href = "/login?error=Session+expired";
                      return;
                    }
                  } catch {
                    // Ignore parse errors
                  }
                }
              }
              return read();
            });
          return read();
        })
        .catch(() => {
          // Aborted or network error - normal on logout
        });
    };
    connect();

    return () => {
      ac.abort();
      sseAbortRef.current = null;
    };
  }, [token, user]);

  useEffect(() => {
    const storedToken = localStorage.getItem(GMS_TOKEN);
    const loginAtStr = localStorage.getItem(GMS_LOGIN_AT);
    const loginAt = loginAtStr ? parseInt(loginAtStr, 10) : Date.now();

    if (!storedToken) {
      setIsLoading(false);
      return;
    }

    const elapsed = Date.now() - loginAt;
    if (elapsed >= SESSION_EXPIRY_MS) {
      clearAuthStorage();
      setToken(null);
      setUser(null);
      setIsLoading(false);
      setLocation("/login?error=Session+expired");
      return;
    }

    if (!loginAtStr) {
      localStorage.setItem(GMS_LOGIN_AT, String(Date.now()));
    }

    setToken(storedToken);
    fetchUser(storedToken);

    const remainingMs = SESSION_EXPIRY_MS - elapsed;
    logoutTimerRef.current = setTimeout(() => {
      clearAuthStorage();
      setToken(null);
      setUser(null);
      setLocation("/login?error=Session+expired");
    }, remainingMs);

    return () => {
      if (logoutTimerRef.current) {
        clearTimeout(logoutTimerRef.current);
        logoutTimerRef.current = null;
      }
    };
  }, []);

  async function fetchUser(authToken: string) {
    try {
      const response = await fetch("/api/auth/me", {
        headers: {
          "X-Session-Id": authToken,
        },
      });

      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
      } else {
        if (logoutTimerRef.current) {
          clearTimeout(logoutTimerRef.current);
          logoutTimerRef.current = null;
        }
        clearAuthStorage();
        setToken(null);
      }
    } catch (error) {
      console.error("Failed to fetch user:", error);
      if (logoutTimerRef.current) {
        clearTimeout(logoutTimerRef.current);
        logoutTimerRef.current = null;
      }
      clearAuthStorage();
      setToken(null);
    } finally {
      setIsLoading(false);
    }
  }

  async function login(email: string, password: string) {
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      if (response.ok) {
        const data = await response.json();
        setTokenAndLoginAt(data.token);
        setToken(data.token);
        setUser(data.user);
        await fetchUser(data.token);

        if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
        logoutTimerRef.current = setTimeout(() => {
          clearAuthStorage();
          setToken(null);
          setUser(null);
          setLocation("/login?error=Session+expired");
        }, SESSION_EXPIRY_MS);

        return { success: true };
      } else {
        const error = await response.json();
        return { success: false, error: error.message || "Login failed" };
      }
    } catch (error) {
      return { success: false, error: "Network error. Please try again." };
    }
  }

  async function logout() {
    if (logoutTimerRef.current) {
      clearTimeout(logoutTimerRef.current);
      logoutTimerRef.current = null;
    }
    if (token) {
      try {
        await fetch("/api/auth/logout", {
          method: "POST",
          headers: {
            "X-Session-Id": token,
          },
        });
      } catch (error) {
        console.error("Logout error:", error);
      }
    }

    clearAuthStorage();
    setToken(null);
    setUser(null);
    setLocation("/login");
  }

  function hasPolicy(policy: string): boolean {
    if (!user) return false;
    return user.policies.includes(policy);
  }

  function canAccessOrg(orgUnitId: string): boolean {
    if (!user) return false;
    return user.accessibleOrgUnitIds.includes(orgUnitId);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        login,
        logout,
        hasPolicy,
        canAccessOrg,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

export function useRequireAuth() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !user) {
      setLocation("/login");
    }
  }, [user, isLoading, setLocation]);

  return { user, isLoading };
}
