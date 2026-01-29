import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { encodeFullName } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
  XCircle,
  User,
  Calendar,
  MessageSquare,
  HelpCircle,
  Filter,
} from "lucide-react";
import { format } from "date-fns";
import { useAuth } from "@/lib/auth-context";
import { HelpTicketForm } from "@/components/HelpTicketForm";

interface HelpTicket {
  id: string;
  subject: string;
  description: string;
  category: string;
  status: string;
  priority: string;
  relatedData: any;
  response: string | null;
  resolvedBy: {
    id: string;
    name: string;
    email: string;
  } | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  employee: {
    id: string;
    firstName: string;
    lastName: string | null;
    cardNumber: string | null;
    employeeCode: string | null;
  };
}

interface HelpTicketsResponse {
  success: boolean;
  tickets: HelpTicket[];
}

function getStatusBadge(status: string) {
  const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; className: string }> = {
    open: {
      label: "Open",
      variant: "default",
      className: "bg-blue-100 text-blue-700 border-blue-200",
    },
    pending: {
      label: "Pending",
      variant: "default",
      className: "bg-slate-100 text-slate-700 border-slate-200",
    },
    in_progress: {
      label: "In Progress",
      variant: "default",
      className: "bg-amber-100 text-amber-700 border-amber-200",
    },
    resolved: {
      label: "Resolved",
      variant: "default",
      className: "bg-green-100 text-green-700 border-green-200",
    },
    dismissed: {
      label: "Dismissed",
      variant: "default",
      className: "bg-red-100 text-red-700 border-red-200",
    },
    closed: {
      label: "Closed",
      variant: "outline",
      className: "bg-slate-100 text-slate-700 border-slate-200",
    },
  };
  
  const config = statusConfig[status] || statusConfig.open;
  return <Badge className={config.className}>{config.label}</Badge>;
}

function getBorderColorClass(status: string): string {
  if (status === "resolved") {
    return "border-green-500 border-2";
  } else if (status === "dismissed") {
    return "border-red-500 border-2";
  }
  return "";
}

function getPriorityBadge(priority: string) {
  const priorityConfig: Record<string, { label: string; className: string }> = {
    low: { label: "Low", className: "bg-slate-100 text-slate-700 border-slate-200" },
    medium: { label: "Medium", className: "bg-blue-100 text-blue-700 border-blue-200" },
    high: { label: "High", className: "bg-orange-100 text-orange-700 border-orange-200" },
    urgent: { label: "Urgent", className: "bg-red-100 text-red-700 border-red-200" },
  };
  
  const config = priorityConfig[priority] || priorityConfig.medium;
  return <Badge variant="outline" className={config.className}>{config.label}</Badge>;
}

function TicketCard({ ticket, isAdmin }: { ticket: HelpTicket; isAdmin: boolean }) {
  const [viewOpen, setViewOpen] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user, hasPolicy } = useAuth();
  
  const canUpdate = hasPolicy("help_tickets.update");
  
  const updateStatusMutation = useMutation({
    mutationFn: async (newStatus: string) => {
      const res = await fetch(`/api/help-tickets/${ticket.id}`, {
        method: "PUT",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-Session-Id": `${localStorage.getItem("gms_token") || ""}`,
        },
        body: JSON.stringify({ status: newStatus }),
      });
      const result = await res.json();
      if (!res.ok || result.success === false) {
        throw new Error(result.message || "Failed to update ticket status");
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/help-tickets"] });
      toast({
        title: "Ticket updated",
        description: `Ticket status updated successfully`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Update failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  const handleResolve = () => {
    updateStatusMutation.mutate("resolved");
  };
  
  const handleDismiss = () => {
    updateStatusMutation.mutate("dismissed");
  };
  
  const borderClass = getBorderColorClass(ticket.status);
  
  return (
    <>
      <Card className={`hover:shadow-md transition-shadow cursor-pointer ${borderClass}`} onClick={() => setViewOpen(true)}>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <CardTitle className="text-base font-semibold text-foreground line-clamp-2 mb-2">
                {ticket.subject}
              </CardTitle>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                {getStatusBadge(ticket.status)}
                {getPriorityBadge(ticket.priority)}
                <Badge variant="outline" className="text-xs">
                  {ticket.category}
                </Badge>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
            {ticket.description}
          </p>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1">
                <User className="h-3 w-3" />
                {encodeFullName(ticket.employee.firstName, ticket.employee.lastName)}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {format(new Date(ticket.createdAt), "dd MMM yyyy")}
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                setViewOpen(true);
              }}
            >
              View Details
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className={`max-w-2xl bg-card max-h-[90vh] overflow-y-auto ${getBorderColorClass(ticket.status)}`}>
          <DialogHeader>
            <DialogTitle className="text-foreground">Ticket Details</DialogTitle>
            <DialogDescription>
              View detailed information about this help ticket.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              {getStatusBadge(ticket.status)}
              {getPriorityBadge(ticket.priority)}
              <Badge variant="outline">{ticket.category}</Badge>
            </div>

            <div>
              <Label className="text-sm font-medium text-muted-foreground">Subject</Label>
              <p className="text-base font-semibold text-foreground mt-1">{ticket.subject}</p>
            </div>

            <div>
              <Label className="text-sm font-medium text-muted-foreground">Raised By</Label>
              <p className="text-foreground mt-1">
                {encodeFullName(ticket.employee.firstName, ticket.employee.lastName)}
                {ticket.employee.cardNumber && (
                  <span className="text-muted-foreground ml-2">({ticket.employee.cardNumber})</span>
                )}
              </p>
            </div>

            <div>
              <Label className="text-sm font-medium text-muted-foreground">Description</Label>
              <p className="text-foreground mt-1 whitespace-pre-wrap">{ticket.description}</p>
            </div>

            {ticket.relatedData && (
              <div>
                <Label className="text-sm font-medium text-muted-foreground">Related Data</Label>
                <div className="mt-1 p-3 bg-muted rounded-lg text-sm">
                  <pre className="whitespace-pre-wrap text-foreground">
                    {JSON.stringify(ticket.relatedData, null, 2)}
                  </pre>
                </div>
              </div>
            )}

            {ticket.response && (
              <div>
                <Label className="text-sm font-medium text-muted-foreground">Response</Label>
                <p className="text-foreground mt-1 whitespace-pre-wrap">{ticket.response}</p>
                {ticket.resolvedBy && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Resolved by {ticket.resolvedBy.name} on{" "}
                    {ticket.resolvedAt && format(new Date(ticket.resolvedAt), "dd MMM yyyy, hh:mm a")}
                  </p>
                )}
              </div>
            )}

            <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2 border-t border-border">
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                Created: {format(new Date(ticket.createdAt), "dd MMM yyyy, hh:mm a")}
              </span>
              {ticket.updatedAt !== ticket.createdAt && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Updated: {format(new Date(ticket.updatedAt), "dd MMM yyyy, hh:mm a")}
                </span>
              )}
            </div>

            {canUpdate && ticket.status !== "resolved" && ticket.status !== "dismissed" && (
              <div className="flex items-center gap-3 pt-4 border-t border-border">
                <Button
                  onClick={handleResolve}
                  disabled={updateStatusMutation.isPending}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                >
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Resolve
                </Button>
                <Button
                  onClick={handleDismiss}
                  disabled={updateStatusMutation.isPending}
                  variant="destructive"
                  className="flex-1"
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Dismiss
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function RequestsPage() {
  const { hasPolicy } = useAuth();
  const isAdmin = hasPolicy("help_tickets.update");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [helpTicketOpen, setHelpTicketOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery<HelpTicketsResponse>({
    queryKey: ["/api/help-tickets", statusFilter, categoryFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (categoryFilter !== "all") params.set("category", categoryFilter);
      
      const res = await fetch(`/api/help-tickets?${params}`, {
        credentials: "include",
        headers: { 
          "X-Session-Id": `${localStorage.getItem("gms_token") || ""}`,
          "Content-Type": "application/json",
        },
      });
      const result = await res.json();
      if (!res.ok || result.success === false) {
        throw new Error(result.message || "Failed to load help tickets");
      }
      return result;
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-10 w-10 animate-spin text-indigo-500" />
          <p className="text-slate-500">Loading help tickets...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md border-red-200 bg-red-50">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h3 className="font-semibold text-lg text-slate-800 mb-2">Unable to Load Tickets</h3>
            <p className="text-slate-600">{(error as Error).message}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const tickets = data?.tickets || [];
  const openCount = tickets.filter(t => t.status === "open").length;
  const inProgressCount = tickets.filter(t => t.status === "in_progress").length;
  const resolvedCount = tickets.filter(t => t.status === "resolved").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-indigo-500 flex items-center justify-center">
              <HelpCircle className="h-5 w-5 text-white" />
            </div>
            Help Requests
          </h1>
          <p className="text-slate-500 mt-1">
            View help tickets you have access to.
          </p>
        </div>
        <Button
          onClick={() => setHelpTicketOpen(true)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white"
        >
          <HelpCircle className="h-4 w-4 mr-2" />
          Raise New Ticket
        </Button>
      </div>

      {/* Stats */}
      {tickets.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card className="bg-blue-500 border-blue-500">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-white">{openCount}</div>
              <div className="text-xs text-white/80">Open</div>
            </CardContent>
          </Card>
          <Card className="bg-amber-500 border-amber-500">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-white">{inProgressCount}</div>
              <div className="text-xs text-white/80">In Progress</div>
            </CardContent>
          </Card>
          <Card className="bg-green-500 border-green-500">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-white">{resolvedCount}</div>
              <div className="text-xs text-white/80">Resolved</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium flex items-center gap-2 text-slate-700">
            <Filter className="h-4 w-4" /> Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <Label className="text-sm text-slate-500 mb-1.5 block">Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                  <SelectItem value="dismissed">Dismissed</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <Label className="text-sm text-slate-500 mb-1.5 block">Category</Label>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="attendance">Attendance</SelectItem>
                  <SelectItem value="general">General</SelectItem>
                  <SelectItem value="technical">Technical</SelectItem>
                  <SelectItem value="payroll">Payroll</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tickets List */}
      {tickets.length === 0 ? (
        <Card className="border-slate-200">
          <CardContent className="py-12 text-center">
            <HelpCircle className="h-12 w-12 mx-auto mb-3 text-slate-300" />
            <p className="text-slate-500 font-medium">No help tickets found</p>
            <p className="text-slate-400 text-sm mt-1">
              {statusFilter !== "all" || categoryFilter !== "all"
                ? "Try adjusting your filters"
                : "Raise a new ticket to get started"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {tickets.map((ticket) => (
            <TicketCard key={ticket.id} ticket={ticket} isAdmin={isAdmin} />
          ))}
        </div>
      )}

      <HelpTicketForm
        open={helpTicketOpen}
        onOpenChange={setHelpTicketOpen}
      />
    </div>
  );
}

