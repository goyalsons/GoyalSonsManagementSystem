/**
 * Role matrix: roles (rows) × pages (columns).
 * Each cell shows page-level access: None / View / Manage (OPTION B).
 * Derived via getPageAccess(rolePolicyKeys, pageId); backend remains granular.
 */
import { useQueries } from "@tanstack/react-query";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { PAGE_IDS, PAGE_PERMISSIONS, getPageAccess, type PageAccessLevel } from "@/lib/page-permissions";
import { rolesApi } from "@/lib/api";

interface RoleRow {
  id: string;
  name: string;
}

interface RoleMatrixProps {
  roles: RoleRow[];
}

function accessLevelVariant(level: PageAccessLevel): "secondary" | "default" | "outline" {
  switch (level) {
    case "manage":
      return "default";
    case "view":
      return "secondary";
    case "none":
    default:
      return "outline";
  }
}

export function RoleMatrix({ roles }: RoleMatrixProps) {
  const roleQueries = useQueries({
    queries: roles.map((role) => ({
      queryKey: ["role", role.id],
      queryFn: () => rolesApi.getById(role.id),
      enabled: !!role.id,
    })),
  });

  const roleDetailsMap = new Map(
    roleQueries
      .map((q) => q.data)
      .filter(Boolean)
      .map((r: any) => [r.id, r])
  );

  const isLoading = roleQueries.some((q) => q.isLoading);

  if (roles.length === 0) {
    return (
      <div className="rounded-md border p-6 text-center text-muted-foreground">
        No roles to display.
      </div>
    );
  }

  return (
    <div className="rounded-md border overflow-x-auto">
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[140px] font-medium">Role</TableHead>
              {PAGE_IDS.map((pageId) => (
                <TableHead key={pageId} className="text-center whitespace-nowrap">
                  {PAGE_PERMISSIONS[pageId]?.label ?? pageId}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {roles.map((role) => {
              const details = roleDetailsMap.get(role.id);
              const policyKeys = new Set(
                (details?.policies ?? []).map((p: { key: string }) => p.key)
              );

              return (
                <TableRow key={role.id}>
                  <TableCell className="font-medium">{role.name}</TableCell>
                  {PAGE_IDS.map((pageId) => {
                    const level = getPageAccess(policyKeys, pageId);
                    return (
                      <TableCell key={pageId} className="text-center">
                        <Badge
                          variant={accessLevelVariant(level)}
                          className="text-xs capitalize"
                        >
                          {level}
                        </Badge>
                      </TableCell>
                    );
                  })}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
