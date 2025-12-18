import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Target, TrendingUp, Plus, Calendar } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

interface TargetData {
  id: string;
  title: string;
  description: string;
  targetValue: number;
  achievedValue: number;
  metric: string;
  period: string;
  status: string;
  deadline: string;
}

export default function MyTargetsPage() {
  const { user } = useAuth();

  const { data: targets = [], isLoading } = useQuery<TargetData[]>({
    queryKey: ["/api/targets/my"],
    queryFn: async () => {
      const res = await fetch("/api/targets/my", {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const mockTargets: TargetData[] = [
    {
      id: "1",
      title: "Monthly Sales Target",
      description: "Achieve sales quota for current month",
      targetValue: 100000,
      achievedValue: 75000,
      metric: "INR",
      period: "Monthly",
      status: "On Track",
      deadline: "Dec 31, 2025"
    },
    {
      id: "2", 
      title: "Customer Meetings",
      description: "Complete client visits this quarter",
      targetValue: 20,
      achievedValue: 12,
      metric: "meetings",
      period: "Quarterly",
      status: "At Risk",
      deadline: "Dec 31, 2025"
    },
    {
      id: "3",
      title: "Training Completion",
      description: "Complete all assigned training modules",
      targetValue: 5,
      achievedValue: 5,
      metric: "modules",
      period: "Annual",
      status: "Completed",
      deadline: "Dec 31, 2025"
    }
  ];

  const displayTargets = targets.length > 0 ? targets : mockTargets;

  return (
    <>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">My Targets</h1>
          <p className="text-muted-foreground mt-1">
            Track your personal goals and performance metrics.
          </p>
        </div>
        <Button className="gap-2 shadow-sm">
          <Plus className="h-4 w-4" />
          Request New Target
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="pb-2">
                <div className="h-10 w-10 rounded-lg bg-muted"></div>
                <div className="h-4 bg-muted rounded w-3/4 mt-4"></div>
                <div className="h-3 bg-muted rounded w-1/2 mt-2"></div>
              </CardHeader>
              <CardContent>
                <div className="h-2 bg-muted rounded w-full mt-4"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : displayTargets.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent>
            <Target className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No targets assigned</h3>
            <p className="text-muted-foreground mb-4">
              You don't have any targets assigned yet. Contact your manager to set your goals.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {displayTargets.map((target) => {
            const progress = (target.achievedValue / target.targetValue) * 100;
            
            return (
              <Card key={target.id} className="flex flex-col hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start mb-2">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                      <Target className="h-5 w-5" />
                    </div>
                    <Badge 
                      variant="outline" 
                      className={
                        target.status === "Completed" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                        target.status === "At Risk" ? "bg-rose-50 text-rose-700 border-rose-200" :
                        "bg-blue-50 text-blue-700 border-blue-200"
                      }
                    >
                      {target.status}
                    </Badge>
                  </div>
                  <CardTitle className="text-lg">{target.title}</CardTitle>
                  <CardDescription>{target.description}</CardDescription>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col justify-end gap-4">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm font-medium">
                      <span>Progress</span>
                      <span>{Math.round(progress)}%</span>
                    </div>
                    <Progress value={progress} className="h-2" />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{target.achievedValue.toLocaleString()} {target.metric}</span>
                      <span>Goal: {target.targetValue.toLocaleString()} {target.metric}</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between text-xs font-medium text-muted-foreground pt-2 border-t">
                    <div className="flex items-center gap-1">
                      <TrendingUp className="h-3 w-3" />
                      {target.period}
                    </div>
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {target.deadline}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
