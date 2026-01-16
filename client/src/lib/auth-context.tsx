import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useLocation } from "wouter";

export interface UserAuth {
  id: string;
  name: string;
  email: string;
  isSuperAdmin: boolean;
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
  isManager?: boolean;
  managerScopes?: {
    departmentIds: string[] | null;
    designationIds: string[] | null;
    orgUnitIds: string[] | null;
  } | null;
}

interface AuthContextType {
  user: UserAuth | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  hasPolicy: (policy: string) => boolean;
  hasRole: (roleName: string) => boolean;
  canAccessOrg: (orgUnitId: string) => boolean;
  isEmployeeLogin: () => boolean;
  isManager: () => boolean;
  getManagerScopes: () => { departmentIds: string[] | null; designationIds: string[] | null; orgUnitIds: string[] | null; } | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserAuth | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [, setLocation] = useLocation();

  useEffect(() => {
    const storedToken = localStorage.getItem("gms_token");
    if (storedToken) {
      setToken(storedToken);
      fetchUser(storedToken);
    } else {
      setIsLoading(false);
    }
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
        localStorage.removeItem("gms_token");
        setToken(null);
      }
    } catch (error) {
      console.error("Failed to fetch user:", error);
      localStorage.removeItem("gms_token");
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
        localStorage.setItem("gms_token", data.token);
        setToken(data.token);
        // Use user data from login (now includes manager status) and refresh to ensure latest
        setUser(data.user);
        await fetchUser(data.token);
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

    localStorage.removeItem("gms_token");
    setToken(null);
    setUser(null);
    setLocation("/login");
  }

  function hasPolicy(policy: string): boolean {
    if (!user) return false;
    if (user.isSuperAdmin) return true;
    return user.policies.includes(policy);
  }

  function hasRole(roleName: string): boolean {
    if (!user) return false;
    return user.roles.some((r) => r.name.toLowerCase() === roleName.toLowerCase());
  }

  function canAccessOrg(orgUnitId: string): boolean {
    if (!user) return false;
    if (user.isSuperAdmin) return true;
    return user.accessibleOrgUnitIds.includes(orgUnitId);
  }

  function isEmployeeLogin(): boolean {
    if (!user) return false;
    return user.loginType === "employee";
  }

  function isManager(): boolean {
    if (!user) return false;
    return user.isManager === true;
  }

  function getManagerScopes() {
    if (!user || !user.isManager) return null;
    return user.managerScopes;
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
        hasRole,
        canAccessOrg,
        isEmployeeLogin,
        isManager,
        getManagerScopes,
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
