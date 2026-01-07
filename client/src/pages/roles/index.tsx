import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter
} from "@/components/ui/card";
import { ArrowLeft, Shield, Users, Lock, Edit } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { rolesApi } from "@/lib/api";

export default function RolesPage() {
  const [, setLocation] = useLocation();

  // Fetch roles from API
  const { data: roles = [], isLoading: rolesLoading } = useQuery({
    queryKey: ["roles"],
    queryFn: () => rolesApi.getAll(),
  });

  const handleRoleCardClick = (roleName: string) => {
    if (roleName === "Manager") {
      setLocation("/roles/manager/assign");
    }
  };

  return (
    <>
      <div className="flex items-center gap-4 mb-6">
        <Link href="/roles-assigned">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Roles & Permissions</h1>
          <p className="text-muted-foreground mt-1">
            Define what users can see and do in the system.
          </p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {rolesLoading ? (
          <div className="col-span-full text-center py-8 text-muted-foreground">
            Loading roles...
          </div>
        ) : (
          <>
            {roles.map((role: any) => (
              <Card 
                key={role.id} 
                className={`flex flex-col ${role.name === "Manager" ? "cursor-pointer hover:shadow-lg transition-shadow" : ""}`}
                onClick={() => handleRoleCardClick(role.name)}
              >
                <CardHeader>
                  <div className="flex items-center justify-between mb-2">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                      <Shield className="h-5 w-5" />
                    </div>
                    <Badge variant="secondary" className="font-normal">
                      {role.userCount || 0} Users
                    </Badge>
                  </div>
                  <CardTitle>{role.name}</CardTitle>
                  <CardDescription>{role.description || "No description"}</CardDescription>
                </CardHeader>
                <CardContent className="flex-1">
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Lock className="h-3 w-3" />
                      <span>Access Level: {role.name === "Admin" ? "Full" : "Limited"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Users className="h-3 w-3" />
                      <span>Assignable to users</span>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="border-t pt-4 bg-muted/20">
                  {role.name === "Manager" ? (
                    <Button variant="outline" className="w-full gap-2">
                      <Edit className="h-3 w-3" />
                      Assign Manager
                    </Button>
                  ) : (
                    <Link href={`/roles/${role.id}`} className="w-full">
                      <Button variant="outline" className="w-full gap-2">
                        <Edit className="h-3 w-3" />
                        Edit Permissions
                      </Button>
                    </Link>
                  )}
                </CardFooter>
              </Card>
            ))}
            
            <Card className="flex flex-col border-dashed items-center justify-center bg-muted/10 hover:bg-muted/20 transition-colors cursor-pointer min-h-[250px]">
              <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
                 <Shield className="h-6 w-6 text-muted-foreground" />
              </div>
              <h3 className="font-semibold text-lg mb-1">Create Custom Role</h3>
              <p className="text-sm text-muted-foreground text-center px-6">
                Define a new set of permissions for specific use cases.
              </p>
              <Button variant="link" className="mt-2 text-primary">
                + Create Role
              </Button>
            </Card>
          </>
        )}
      </div>
    </>
  );
}
