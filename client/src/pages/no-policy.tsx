import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShieldX } from "lucide-react";
import { useLocation } from "wouter";

export default function NoPolicyPage() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="flex flex-col items-center gap-2 text-center">
          <div className="h-12 w-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center">
            <ShieldX className="h-6 w-6" />
          </div>
          <CardTitle className="text-2xl">Access Restricted</CardTitle>
          <p className="text-muted-foreground text-sm max-w-md">
            You are not under any policy assigned to access this system.
            Please contact the system owner or administrator to request access.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button variant="outline" onClick={() => setLocation("/login")}>
            Go to Login
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
