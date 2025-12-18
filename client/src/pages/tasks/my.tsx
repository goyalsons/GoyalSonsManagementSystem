import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  CheckSquare, 
  Plus, 
  Clock, 
  AlertCircle,
  Calendar,
  Flag
} from "lucide-react";
import { useState } from "react";

interface Task {
  id: string;
  title: string;
  description: string;
  status: "pending" | "in_progress" | "completed";
  priority: "low" | "medium" | "high";
  dueDate: string;
  assignedBy: string;
}

export default function MyTasksPage() {
  const [filter, setFilter] = useState<string>("all");

  const { data: tasks = [], isLoading } = useQuery<Task[]>({
    queryKey: ["/api/tasks/my"],
    queryFn: async () => {
      const res = await fetch("/api/tasks/my", {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const mockTasks: Task[] = [
    {
      id: "1",
      title: "Complete Q4 Sales Report",
      description: "Prepare and submit the quarterly sales analysis report",
      status: "in_progress",
      priority: "high",
      dueDate: "Dec 15, 2025",
      assignedBy: "Priya Sharma"
    },
    {
      id: "2",
      title: "Update Client Database",
      description: "Add new client contacts from recent networking event",
      status: "pending",
      priority: "medium",
      dueDate: "Dec 10, 2025",
      assignedBy: "Rajesh Goyal"
    },
    {
      id: "3",
      title: "Team Meeting Preparation",
      description: "Prepare presentation slides for weekly team sync",
      status: "completed",
      priority: "low",
      dueDate: "Dec 05, 2025",
      assignedBy: "Self"
    },
    {
      id: "4",
      title: "Review Training Materials",
      description: "Go through new product training documentation",
      status: "pending",
      priority: "medium",
      dueDate: "Dec 20, 2025",
      assignedBy: "HR Team"
    }
  ];

  const displayTasks = tasks.length > 0 ? tasks : mockTasks;
  
  const filteredTasks = filter === "all" 
    ? displayTasks 
    : displayTasks.filter(t => t.status === filter);

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
          <h1 className="text-3xl font-bold tracking-tight">My Tasks</h1>
          <p className="text-muted-foreground mt-1">
            Manage your assigned tasks and to-dos.
          </p>
        </div>
        <Button className="gap-2 shadow-sm">
          <Plus className="h-4 w-4" />
          Add Personal Task
        </Button>
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        {["all", "pending", "in_progress", "completed"].map((status) => (
          <Button
            key={status}
            variant={filter === status ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(status)}
            className="capitalize"
          >
            {status === "all" ? "All Tasks" : status.replace("_", " ")}
            <Badge variant="secondary" className="ml-2 text-[10px]">
              {status === "all" 
                ? displayTasks.length 
                : displayTasks.filter(t => t.status === status).length}
            </Badge>
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="py-4">
                <div className="h-4 bg-muted rounded w-1/3 mb-2"></div>
                <div className="h-3 bg-muted rounded w-2/3"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredTasks.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent>
            <CheckSquare className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No tasks found</h3>
            <p className="text-muted-foreground">
              {filter !== "all" 
                ? "No tasks match the selected filter." 
                : "You don't have any tasks assigned. Great job staying on top of things!"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredTasks.map((task) => (
            <Card key={task.id} className={`hover:shadow-md transition-shadow ${task.status === "completed" ? "opacity-75" : ""}`}>
              <CardContent className="py-4">
                <div className="flex items-start gap-4">
                  <Checkbox 
                    checked={task.status === "completed"} 
                    className="mt-1"
                  />
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
                    <p className="text-sm text-muted-foreground mb-2">{task.description}</p>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        Due: {task.dueDate}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Assigned by: {task.assignedBy}
                      </span>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm">
                    View
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
