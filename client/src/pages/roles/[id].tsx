import { useLocation, useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowLeft, Shield, Save, Loader2 } from "lucide-react";
import { mockRoles, mockPolicies } from "@/lib/mock-users";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

export default function EditRolePage() {
  const [, params] = useRoute("/roles/:id");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const roleId = params?.id;
  const role = mockRoles.find(r => r.id === roleId);

  const handleSave = () => {
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      toast({
        title: "Permissions updated",
        description: `Policies for ${role?.name} have been saved.`,
      });
      setLocation("/roles");
    }, 1000);
  };

  if (!role) return <div>Role not found</div>;

  return (
    <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/roles")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Edit Permissions: {role.name}</h1>
            <p className="text-muted-foreground text-sm">
              Configure what users with this role can access.
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              <CardTitle>Policy Configuration</CardTitle>
            </div>
            <CardDescription>
              Select the policies to apply to this role.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              {mockPolicies.map((policy) => (
                <div key={policy.id} className="flex items-start space-x-3 p-3 rounded-lg hover:bg-muted/50 border border-transparent hover:border-border transition-colors">
                  <Checkbox id={policy.id} defaultChecked={role.name === "Admin" || (role.name === "HR" && policy.key.includes("attendance"))} />
                  <div className="grid gap-1.5 leading-none">
                    <Label
                      htmlFor={policy.id}
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                    >
                      {policy.label}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Allows users to {policy.label.toLowerCase()} in the system.
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-4 pt-4 border-t">
              <Button variant="outline" onClick={() => setLocation("/roles")}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={isLoading} className="gap-2">
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save Changes
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
  );
}
