/**
 * Hook to fetch and manage UI pages
 * 
 * This hook provides:
 * - List of all active pages (for navigation)
 * - Policy lookup by path
 * - Page metadata
 */

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";

export interface Page {
  id: string;
  pageKey: string;
  pageName: string;
  path: string;
  policyPrefix: string;
  icon?: string;
  order: number;
  isActive: boolean;
  policies: Array<{
    id: string;
    key: string;
    description: string;
  }>;
}

/**
 * Hook to get all active pages (for navigation)
 */
export function useActivePages() {
  const { token } = useAuth();

  return useQuery<Page[]>({
    queryKey: ["pages", "active"],
    queryFn: async () => {
      const res = await fetch("/api/pages/active", {
        headers: { "X-Session-Id": token },
      });
      if (!res.ok) throw new Error("Failed to fetch pages");
      return res.json();
    },
    enabled: !!token,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
}

/**
 * Hook to get policy for a specific path
 */
export function usePagePolicy(path: string) {
  const { data: pages } = useActivePages();

  const page = pages?.find((p) => p.path === path);
  const viewPolicy = page?.policies.find((p) => p.key.endsWith(".view"));

  return {
    page,
    viewPolicy: viewPolicy?.key || null,
    allPolicies: page?.policies.map((p) => p.key) || [],
  };
}
