import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Inbox, Loader2, CheckCircle2, MessageSquare } from "lucide-react";
import { getMyQueries, acceptTicket, reraiseTicket } from "@/api/attendanceVerification.api";

export default function MyQueriesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [reraiseTicketId, setReraiseTicketId] = useState<string | null>(null);
  const [reraiseRemark, setReraiseRemark] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["my-queries"],
    queryFn: getMyQueries,
  });

  const acceptMutation = useMutation({
    mutationFn: acceptTicket,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-queries"] });
      toast({ title: "Accepted", description: "Ticket marked as OK." });
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const reraiseMutation = useMutation({
    mutationFn: ({ ticketId, remark }: { ticketId: string; remark: string }) => reraiseTicket(ticketId, remark),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-queries"] });
      setReraiseTicketId(null);
      setReraiseRemark("");
      toast({ title: "Re-raised", description: "HR will be notified." });
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const batches = data?.batches ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-indigo-500 flex items-center justify-center">
            <Inbox className="h-5 w-5 text-white" />
          </div>
          My Queries
        </h1>
        <p className="text-muted-foreground mt-1">View HR responses and accept or re-raise tickets</p>
      </div>

      {isLoading && (
        <Card>
          <CardContent className="py-12 flex items-center justify-center gap-2">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="text-muted-foreground">Loading...</span>
          </CardContent>
        </Card>
      )}

      {!isLoading && batches.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Inbox className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No submitted batches yet. Submit an attendance check from the Check page first.</p>
          </CardContent>
        </Card>
      )}

      {!isLoading && batches.length > 0 && (
        <div className="space-y-6">
          {batches.map((batch) => (
            <Card key={batch.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between">
                  <span>Month: {batch.monthStart}</span>
                  <span className="text-sm font-normal text-muted-foreground">
                    Submitted: {batch.submittedAt ? new Date(batch.submittedAt).toLocaleString() : "—"}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Card</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Your query</TableHead>
                      <TableHead>HR status</TableHead>
                      <TableHead>HR remark</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {batch.tickets.map((ticket) => (
                      <TableRow key={ticket.id}>
                        <TableCell className="font-medium">{ticket.employeeName}</TableCell>
                        <TableCell className="font-mono text-sm">{ticket.cardNumber}</TableCell>
                        <TableCell>{ticket.date}</TableCell>
                        <TableCell className="max-w-[200px] truncate" title={ticket.query ?? ""}>
                          {ticket.query ?? "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={ticket.hrStatus === "RESOLVED" ? "default" : "secondary"}>
                            {ticket.hrStatus ?? "—"}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate" title={ticket.hrRemark ?? ""}>
                          {ticket.hrRemark ?? "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => acceptMutation.mutate(ticket.id)}
                              disabled={acceptMutation.isPending}
                            >
                              {acceptMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
                              Accept
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setReraiseTicketId(ticket.id);
                                setReraiseRemark("");
                              }}
                            >
                              <MessageSquare className="h-4 w-4 mr-1" />
                              Re-raise
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!reraiseTicketId} onOpenChange={(open) => !open && setReraiseTicketId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Re-raise ticket</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Add a remark to send back to HR.</p>
          <Textarea
            placeholder="Enter remark..."
            value={reraiseRemark}
            onChange={(e) => setReraiseRemark(e.target.value)}
            rows={4}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setReraiseTicketId(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!reraiseTicketId || !reraiseRemark.trim()) {
                  toast({ title: "Remark required", variant: "destructive" });
                  return;
                }
                reraiseMutation.mutate({ ticketId: reraiseTicketId, remark: reraiseRemark.trim() });
              }}
              disabled={reraiseMutation.isPending || !reraiseRemark.trim()}
            >
              {reraiseMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Re-raise"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
