import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Target, TrendingUp, Plus, Users, Filter } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState } from "react";

interface TeamTarget {
  id: string;
  employeeName: string;
  employeeRole: string;
  title: string;
  targetValue: number;
  achievedValue: number;
  metric: string;
  status: string;
  period: string;
}

export default function TeamTargetsPage() {
  const { user, hasPolicy } = useAuth();
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: teamTargets = [], isLoading } = useQuery<TeamTarget[]>({
    queryKey: ["/api/targets/team"],
    queryFn: async () => {
      const res = await fetch("/api/targets/team", {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const mockTeamTargets: TeamTarget[] = [
    {
      id: "1",
      employeeName: "Ankit Kumar",
      employeeRole: "Sales Executive",
      title: "Monthly Sales Target",
      targetValue: 80000,
      achievedValue: 65000,
      metric: "INR",
      status: "On Track",
      period: "Monthly"
    },
    {
      id: "2",
      employeeName: "Priya Sharma",
      employeeRole: "Marketing Lead",
      title: "Lead Generation",
      targetValue: 50,
      achievedValue: 45,
      metric: "leads",
      status: "On Track",
      period: "Monthly"
    },
    {
      id: "3",
      employeeName: "Rahul Verma",
      employeeRole: "Sales Executive",
      title: "Customer Retention",
      targetValue: 95,
      achievedValue: 88,
      metric: "%",
      status: "At Risk",
      period: "Quarterly"
    },
    {
      id: "4",
      employeeName: "Sneha Patel",
      employeeRole: "HR Manager",
      title: "Training Delivery",
      targetValue: 10,
      achievedValue: 10,
      metric: "sessions",
      status: "Completed",
      period: "Quarterly"
    }
  ];

  const displayTargets = teamTargets.length > 0 ? teamTargets : mockTeamTargets;
  
  const filteredTargets = statusFilter === "all" 
    ? displayTargets 
    : displayTargets.filter(t => t.status === statusFilter);

  const canAssignTargets = hasPolicy("targets.create");

  return (
    <>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Team Targets</h1>
          <p className="text-muted-foreground mt-1">
            Monitor and manage your team's performance goals.
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Filter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="On Track">On Track</SelectItem>
              <SelectItem value="At Risk">At Risk</SelectItem>
              <SelectItem value="Completed">Completed</SelectItem>
            </SelectContent>
          </Select>
          {canAssignTargets && (
            <Button className="gap-2 shadow-sm">
              <Plus className="h-4 w-4" />
              Assign Target
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <Card>
          <CardContent className="pt-6 text-center sm:text-left">
            <div className="text-2xl font-bold text-foreground">{displayTargets.length}</div>
            <p className="text-xs text-muted-foreground">Total Targets</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center sm:text-left">
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {displayTargets.filter(t => t.status === "Completed").length}
            </div>
            <p className="text-xs text-muted-foreground">Completed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center sm:text-left">
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {displayTargets.filter(t => t.status === "On Track").length}
            </div>
            <p className="text-xs text-muted-foreground">On Track</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center sm:text-left">
            <div className="text-2xl font-bold text-rose-600 dark:text-rose-400">
              {displayTargets.filter(t => t.status === "At Risk").length}
            </div>
            <p className="text-xs text-muted-foreground">At Risk</p>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="py-4">
                <div className="h-4 bg-muted rounded w-1/4 mb-2"></div>
                <div className="h-3 bg-muted rounded w-1/2"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredTargets.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent>
            <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No team targets found</h3>
            <p className="text-muted-foreground">
              {statusFilter !== "all" 
                ? "No targets match the selected filter." 
                : "Your team members don't have any assigned targets yet."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredTargets.map((target) => {
            const progress = (target.achievedValue / target.targetValue) * 100;
            
            return (
              <Card key={target.id} className="hover:shadow-md transition-shadow">
                <CardContent className="py-4">
                  <div className="flex flex-col md:flex-row md:items-center gap-4">
                    <div className="flex items-center gap-3 md:w-1/4">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold">
                        {target.employeeName.split(" ").map(n => n[0]).join("").slice(0, 2)}
                      </div>
                      <div>
                        <div className="font-medium">{target.employeeName}</div>
                        <div className="text-xs text-muted-foreground">{target.employeeRole}</div>
                      </div>
                    </div>
                    
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Target className="h-4 w-4 text-primary" />
                          <span className="font-medium">{target.title}</span>
                          <Badge variant="outline" className="text-[10px]">{target.period}</Badge>
                        </div>
                        <Badge 
                          variant="outline" 
                          className={
                            target.status === "Completed" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20" :
                            target.status === "At Risk" ? "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20" :
                            "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20"
                          }
                        >
                          {target.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4">
                        <Progress value={progress} className="h-2 flex-1" />
                        <span className="text-sm font-medium w-12 text-right">{Math.round(progress)}%</span>
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground mt-1">
                        <span>{target.achievedValue.toLocaleString()} {target.metric}</span>
                        <span>Goal: {target.targetValue.toLocaleString()} {target.metric}</span>
                      </div>
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
