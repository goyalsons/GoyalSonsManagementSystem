import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
  DialogFooter,
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
  Users,
  RefreshCw,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react";
import { format } from "date-fns";
import { useAuth } from "@/lib/auth-context";
import { apiGet, apiPost } from "@/lib/api";

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
  const statusConfig: Record<string, { label: string; className: string }> = {
    open: {
      label: "Open",
      className: "bg-blue-100 text-blue-700 border-blue-200",
    },
    pending: {
      label: "Pending",
      className: "bg-slate-100 text-slate-700 border-slate-200",
    },
    in_progress: {
      label: "In Progress",
      className: "bg-amber-100 text-amber-700 border-amber-200",
    },
    resolved: {
      label: "Resolved",
      className: "bg-green-100 text-green-700 border-green-200",
    },
    dismissed: {
      label: "Dismissed",
      className: "bg-red-100 text-red-700 border-red-200",
    },
    closed: {
      label: "Closed",
      className: "bg-slate-100 text-slate-700 border-slate-200",
    },
  };

  const config = statusConfig[status] || statusConfig.pending;
  return (
    <Badge variant="outline" className={config.className}>
      {config.label}
    </Badge>
  );
}

function getPriorityBadge(priority: string) {
  const priorityConfig: Record<string, { label: string; className: string }> = {
    low: {
      label: "Low",
      className: "bg-slate-100 text-slate-600 border-slate-200",
    },
    medium: {
      label: "Medium",
      className: "bg-blue-100 text-blue-600 border-blue-200",
    },
    high: {
      label: "High",
      className: "bg-amber-100 text-amber-600 border-amber-200",
    },
    urgent: {
      label: "Urgent",
      className: "bg-red-100 text-red-600 border-red-200",
    },
  };

  const config = priorityConfig[priority] || priorityConfig.medium;
  return (
    <Badge variant="outline" className={config.className}>
      {config.label}
    </Badge>
  );
}

export default function TeamRequestsPage() {
  const { user, hasPolicy } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [statusFilter, setStatusFilter] = useState("open");
  const [selectedTicket, setSelectedTicket] = useState<HelpTicket | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [responseText, setResponseText] = useState("");
  const [actionType, setActionType] = useState<"approve" | "reject" | null>(null);

  // Check permissions
  const canViewTeam = hasPolicy("requests.team.view");
  const canApprove = hasPolicy("requests.approve");

  // Fetch team tickets (tickets assigned to this manager)
  const { data, isLoading, error, refetch } = useQuery<HelpTicketsResponse>({
    queryKey: ["team-requests", statusFilter],
    queryFn: () => apiGet(`/help-tickets/team?status=${statusFilter}`),
    enabled: canViewTeam,
  });

  const tickets = data?.tickets || [];

  // Mutation to update ticket status
  const updateTicketMutation = useMutation({
    mutationFn: (params: { ticketId: string; status: string; response: string }) =>
      apiPost(`/help-tickets/${params.ticketId}/respond`, {
        status: params.status,
        response: params.response,
      }),
    onSuccess: () => {
      toast({
        title: "Request Updated",
        description: actionType === "approve" ? "Request has been approved." : "Request has been rejected.",
      });
      queryClient.invalidateQueries({ queryKey: ["team-requests"] });
      setDetailsOpen(false);
      setSelectedTicket(null);
      setResponseText("");
      setActionType(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update request",
        variant: "destructive",
      });
    },
  });

  const handleApprove = () => {
    if (!selectedTicket) return;
    setActionType("approve");
    updateTicketMutation.mutate({
      ticketId: selectedTicket.id,
      status: "resolved",
      response: responseText || "Request approved by manager.",
    });
  };

  const handleReject = () => {
    if (!selectedTicket) return;
    setActionType("reject");
    updateTicketMutation.mutate({
      ticketId: selectedTicket.id,
      status: "dismissed",
      response: responseText || "Request rejected by manager.",
    });
  };

  const openDetails = (ticket: HelpTicket) => {
    setSelectedTicket(ticket);
    setResponseText("");
    setDetailsOpen(true);
  };

  if (!canViewTeam) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Team Requests</h1>
          <p className="text-muted-foreground">View and manage your team's requests</p>
        </div>

        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="flex items-center gap-4 p-6">
            <AlertCircle className="h-8 w-8 text-amber-600" />
            <div>
              <h3 className="font-semibold text-amber-800">Access Denied</h3>
              <p className="text-amber-700 text-sm">
                You don't have permission to view team requests. This feature is available for managers only.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-indigo-500 flex items-center justify-center">
              <Users className="h-5 w-5 text-white" />
            </div>
            Team Requests
          </h1>
          <p className="text-muted-foreground mt-1">
            View and manage requests from your team members
          </p>
        </div>
        <Button variant="outline" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-slate-800">{tickets.length}</div>
            <div className="text-sm text-slate-500">Total Requests</div>
          </CardContent>
        </Card>
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-blue-600">
              {tickets.filter(t => t.status === "open" || t.status === "pending").length}
            </div>
            <div className="text-sm text-blue-700">Pending</div>
          </CardContent>
        </Card>
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-600">
              {tickets.filter(t => t.status === "resolved").length}
            </div>
            <div className="text-sm text-green-700">Approved</div>
          </CardContent>
        </Card>
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-red-600">
              {tickets.filter(t => t.status === "dismissed").length}
            </div>
            <div className="text-sm text-red-700">Rejected</div>
          </CardContent>
        </Card>
      </div>

      {/* Filter */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center gap-4">
            <Label className="text-sm text-muted-foreground">Filter by Status:</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="dismissed">Dismissed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Requests List */}
      {isLoading ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Loader2 className="h-8 w-8 mx-auto animate-spin text-indigo-500" />
            <p className="text-muted-foreground mt-4">Loading requests...</p>
          </CardContent>
        </Card>
      ) : error ? (
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="h-12 w-12 mx-auto mb-4 text-red-500" />
            <p className="text-lg font-medium text-red-600">Error loading requests</p>
            <p className="text-sm text-muted-foreground mt-1">{(error as Error).message}</p>
          </CardContent>
        </Card>
      ) : tickets.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <MessageSquare className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-lg font-medium text-muted-foreground">No Requests</p>
            <p className="text-sm text-muted-foreground mt-1">
              No requests found with the selected filter
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {tickets.map((ticket) => (
            <Card
              key={ticket.id}
              className="hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => openDetails(ticket)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-foreground truncate">
                        {ticket.subject}
                      </h3>
                      {getStatusBadge(ticket.status)}
                      {getPriorityBadge(ticket.priority)}
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                      {ticket.description}
                    </p>
                    <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        <span>
                          {encodeFullName(ticket.employee.firstName, ticket.employee.lastName)}
                          {ticket.employee.cardNumber && ` (${ticket.employee.cardNumber})`}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        <span>{format(new Date(ticket.createdAt), "MMM dd, yyyy")}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        <span>{format(new Date(ticket.createdAt), "hh:mm a")}</span>
                      </div>
                    </div>
                  </div>
                  {canApprove && (ticket.status === "open" || ticket.status === "pending") && (
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-green-600 border-green-200 hover:bg-green-50"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedTicket(ticket);
                          setResponseText("");
                          setActionType("approve");
                          setDetailsOpen(true);
                        }}
                      >
                        <ThumbsUp className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-600 border-red-200 hover:bg-red-50"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedTicket(ticket);
                          setResponseText("");
                          setActionType("reject");
                          setDetailsOpen(true);
                        }}
                      >
                        <ThumbsDown className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Details Dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Request Details</DialogTitle>
            <DialogDescription>
              Review and respond to this request
            </DialogDescription>
          </DialogHeader>

          {selectedTicket && (
            <div className="space-y-4">
              <div>
                <Label className="text-muted-foreground text-sm">Subject</Label>
                <p className="font-medium">{selectedTicket.subject}</p>
              </div>

              <div>
                <Label className="text-muted-foreground text-sm">From</Label>
                <p className="font-medium">
                  {encodeFullName(selectedTicket.employee.firstName, selectedTicket.employee.lastName)}
                  {selectedTicket.employee.cardNumber && ` (${selectedTicket.employee.cardNumber})`}
                </p>
              </div>

              <div>
                <Label className="text-muted-foreground text-sm">Description</Label>
                <p className="text-sm bg-muted p-3 rounded-lg">{selectedTicket.description}</p>
              </div>

              <div className="flex gap-4">
                <div>
                  <Label className="text-muted-foreground text-sm">Status</Label>
                  <div className="mt-1">{getStatusBadge(selectedTicket.status)}</div>
                </div>
                <div>
                  <Label className="text-muted-foreground text-sm">Priority</Label>
                  <div className="mt-1">{getPriorityBadge(selectedTicket.priority)}</div>
                </div>
                <div>
                  <Label className="text-muted-foreground text-sm">Date</Label>
                  <p className="text-sm">{format(new Date(selectedTicket.createdAt), "MMM dd, yyyy")}</p>
                </div>
              </div>

              {selectedTicket.relatedData && (
                <div>
                  <Label className="text-muted-foreground text-sm">Related Data</Label>
                  <pre className="text-xs bg-muted p-3 rounded-lg overflow-x-auto">
                    {JSON.stringify(selectedTicket.relatedData, null, 2)}
                  </pre>
                </div>
              )}

              {selectedTicket.response && (
                <div>
                  <Label className="text-muted-foreground text-sm">Response</Label>
                  <p className="text-sm bg-green-50 p-3 rounded-lg border border-green-200">
                    {selectedTicket.response}
                  </p>
                </div>
              )}

              {canApprove && (selectedTicket.status === "open" || selectedTicket.status === "pending") && (
                <>
                  <div>
                    <Label className="text-muted-foreground text-sm">Your Response (optional)</Label>
                    <Textarea
                      value={responseText}
                      onChange={(e) => setResponseText(e.target.value)}
                      placeholder="Add a message for the employee..."
                      className="mt-1"
                      rows={3}
                    />
                  </div>

                  <DialogFooter className="gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setDetailsOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="outline"
                      className="text-red-600 border-red-200 hover:bg-red-50"
                      onClick={handleReject}
                      disabled={updateTicketMutation.isPending}
                    >
                      {updateTicketMutation.isPending && actionType === "reject" ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <ThumbsDown className="h-4 w-4 mr-2" />
                      )}
                      Reject
                    </Button>
                    <Button
                      className="bg-green-600 hover:bg-green-700"
                      onClick={handleApprove}
                      disabled={updateTicketMutation.isPending}
                    >
                      {updateTicketMutation.isPending && actionType === "approve" ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <ThumbsUp className="h-4 w-4 mr-2" />
                      )}
                      Approve
                    </Button>
                  </DialogFooter>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
