import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  CheckSquare, 
  Plus, 
  Users,
  Filter,
  Calendar,
  Flag,
  MoreHorizontal
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useState } from "react";

interface TeamTask {
  id: string;
  title: string;
  assignedTo: string;
  assignedToRole: string;
  status: "pending" | "in_progress" | "completed";
  priority: "low" | "medium" | "high";
  dueDate: string;
}

export default function TeamTasksPage() {
  const { hasPolicy } = useAuth();
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");

  const { data: teamTasks = [], isLoading } = useQuery<TeamTask[]>({
    queryKey: ["/api/tasks/team"],
    queryFn: async () => {
      const res = await fetch("/api/tasks/team", {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const mockTeamTasks: TeamTask[] = [
    {
      id: "1",
      title: "Client Proposal - ABC Corp",
      assignedTo: "Ankit Kumar",
      assignedToRole: "Sales Executive",
      status: "in_progress",
      priority: "high",
      dueDate: "Dec 12, 2025"
    },
    {
      id: "2",
      title: "Marketing Campaign Review",
      assignedTo: "Priya Sharma",
      assignedToRole: "Marketing Lead",
      status: "pending",
      priority: "medium",
      dueDate: "Dec 15, 2025"
    },
    {
      id: "3",
      title: "Employee Onboarding - New Hire",
      assignedTo: "Sneha Patel",
      assignedToRole: "HR Manager",
      status: "completed",
      priority: "high",
      dueDate: "Dec 08, 2025"
    },
    {
      id: "4",
      title: "Quarterly Financial Report",
      assignedTo: "Rahul Verma",
      assignedToRole: "Finance Analyst",
      status: "in_progress",
      priority: "high",
      dueDate: "Dec 20, 2025"
    },
    {
      id: "5",
      title: "IT System Maintenance",
      assignedTo: "Vikram Singh",
      assignedToRole: "IT Admin",
      status: "pending",
      priority: "low",
      dueDate: "Dec 25, 2025"
    }
  ];

  const displayTasks = teamTasks.length > 0 ? teamTasks : mockTeamTasks;
  
  let filteredTasks = displayTasks;
  if (statusFilter !== "all") {
    filteredTasks = filteredTasks.filter(t => t.status === statusFilter);
  }
  if (priorityFilter !== "all") {
    filteredTasks = filteredTasks.filter(t => t.priority === priorityFilter);
  }

  const canAssignTasks = hasPolicy("tasks.create");

  const priorityColors = {
    high: "bg-rose-50 text-rose-700 border-rose-200",
    medium: "bg-amber-50 text-amber-700 border-amber-200",
    low: "bg-slate-50 text-slate-700 border-slate-200"
  };

  const statusColors = {
    pending: "bg-slate-100 text-slate-700",
    in_progress: "bg-blue-100 text-blue-700",
    completed: "bg-emerald-100 text-emerald-700"
  };

  return (
    <>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Team Tasks</h1>
          <p className="text-muted-foreground mt-1">
            Manage and track tasks across your team.
          </p>
        </div>
        {canAssignTasks && (
          <Button className="gap-2 shadow-sm">
            <Plus className="h-4 w-4" />
            Assign New Task
          </Button>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{displayTasks.length}</div>
            <p className="text-xs text-muted-foreground">Total Tasks</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-slate-600">
              {displayTasks.filter(t => t.status === "pending").length}
            </div>
            <p className="text-xs text-muted-foreground">Pending</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-blue-600">
              {displayTasks.filter(t => t.status === "in_progress").length}
            </div>
            <p className="text-xs text-muted-foreground">In Progress</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-emerald-600">
              {displayTasks.filter(t => t.status === "completed").length}
            </div>
            <p className="text-xs text-muted-foreground">Completed</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
          </SelectContent>
        </Select>
        
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priority</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
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
      ) : filteredTasks.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent>
            <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No tasks found</h3>
            <p className="text-muted-foreground">
              No tasks match the selected filters.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredTasks.map((task) => (
            <Card key={task.id} className={`hover:shadow-md transition-shadow ${task.status === "completed" ? "opacity-75" : ""}`}>
              <CardContent className="py-4">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold shrink-0">
                    {task.assignedTo.split(" ").map(n => n[0]).join("").slice(0, 2)}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h3 className={`font-medium ${task.status === "completed" ? "line-through text-muted-foreground" : ""}`}>
                        {task.title}
                      </h3>
                      <Badge variant="outline" className={priorityColors[task.priority]}>
                        <Flag className="h-3 w-3 mr-1" />
                        {task.priority}
                      </Badge>
                      <Badge className={statusColors[task.status]}>
                        {task.status.replace("_", " ")}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>Assigned to: <span className="font-medium text-foreground">{task.assignedTo}</span> ({task.assignedToRole})</span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        Due: {task.dueDate}
                      </span>
                    </div>
                  </div>
                  
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem>View Details</DropdownMenuItem>
                      <DropdownMenuItem>Edit Task</DropdownMenuItem>
                      <DropdownMenuItem>Reassign</DropdownMenuItem>
                      <DropdownMenuItem className="text-rose-600">Delete</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
