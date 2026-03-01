import { useState } from "react";
import { useRoute } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Loader2 } from "lucide-react";
import { getHrQueryBatch, resolveHrQuery } from "@/api/attendanceVerification.api";
import type { HrQueryBatch, HrQueryTicket, HrStatus } from "@/api/attendanceVerification.types";

const HR_STATUSES: HrStatus[] = ["IN_PROGRESS", "NEED_INFO", "RESOLVED", "REJECTED"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function formatMonth(monthStart: string): string {
  const [y, m] = monthStart.split("-").map(Number);
  if (isNaN(y) || isNaN(m)) return monthStart;
  return `${MONTHS[m - 1]} ${y}`;
}

export default function HrAttendanceQueryBatchDetailPage() {
  const [, params] = useRoute("/hr/attendance-queries/:batchId");
  const batchId = params?.batchId ?? "";
  const { toast } = useToast();
  const { hasPolicy } = useAuth();
  const queryClient = useQueryClient();
  const canResolve = hasPolicy("attendance.hr.resolve");
  const [selectedTicket, setSelectedTicket] = useState<(HrQueryTicket & { createdByName?: string }) | null>(null);
  const [selectedMember, setSelectedMember] = useState<{
    employeeId: string;
    employeeName: string;
    cardNumber: string;
    query: string;
    ticketIds: string[];
  } | null>(null);
  const [drawerStatus, setDrawerStatus] = useState<HrStatus | "">("");
  const [drawerRemark, setDrawerRemark] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["hr-query-batch", batchId],
    queryFn: () => getHrQueryBatch(batchId),
    enabled: !!batchId,
  });

  const resolveMutation = useMutation({
    mutationFn: async ({
      ticketIds,
      hrStatus,
      hrRemark,
    }: {
      ticketIds: string[];
      hrStatus: HrStatus;
      hrRemark: string;
    }) => {
      for (const ticketId of ticketIds) {
        await resolveHrQuery(ticketId, hrStatus, hrRemark);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hr-query-batch", batchId] });
      queryClient.invalidateQueries({ queryKey: ["hr-queries"] });
      setSelectedTicket(null);
      setSelectedMember(null);
      setDrawerStatus("");
      setDrawerRemark("");
      toast({ title: "Updated", description: "Status and remark saved." });
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const batch: HrQueryBatch | undefined = data?.batch;
  const needsRemark = drawerStatus === "NEED_INFO" || drawerStatus === "RESOLVED" || drawerStatus === "REJECTED";

  const handleOpenDrawer = (ticket: HrQueryTicket, createdByName: string) => {
    setSelectedMember(null);
    setSelectedTicket({ ...ticket, createdByName });
    setDrawerStatus((ticket.hrStatus as HrStatus) || "");
    setDrawerRemark(ticket.hrRemark ?? "");
  };

  const handleOpenMemberDrawer = (
    member: { employeeId: string; employeeName: string; cardNumber: string; query: string },
    ticketIds: string[],
    initialStatus: HrStatus
  ) => {
    setSelectedTicket(null);
    setSelectedMember({ ...member, ticketIds });
    setDrawerStatus(initialStatus);
    setDrawerRemark("");
  };

  const handleResolve = () => {
    if (!drawerStatus) {
      toast({ title: "Select status", variant: "destructive" });
      return;
    }
    if (needsRemark && !drawerRemark.trim()) {
      toast({ title: "Remark required for this status", variant: "destructive" });
      return;
    }
    if (selectedTicket) {
      resolveMutation.mutate({
        ticketIds: [selectedTicket.id],
        hrStatus: drawerStatus as HrStatus,
        hrRemark: drawerRemark.trim(),
      });
    } else if (selectedMember && selectedMember.ticketIds.length > 0) {
      resolveMutation.mutate({
        ticketIds: selectedMember.ticketIds,
        hrStatus: drawerStatus as HrStatus,
        hrRemark: drawerRemark.trim(),
      });
    } else {
      toast({ title: "Nothing selected", variant: "destructive" });
    }
  };

  const drawerOpen = !!selectedTicket || !!selectedMember;

  if (!batchId) return null;
  if (isLoading || !batch) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/hr/attendance-queries">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {batch.managerName} · {formatMonth(batch.monthStart)}
          </CardTitle>
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            <span>Card No: <strong className="font-mono text-foreground">{batch.managerCardNo}</strong></span>
            <span>Unit No: <strong className="text-foreground">{batch.managerUnitNo}</strong></span>
            <span>Month: <strong className="text-foreground">{formatMonth(batch.monthStart)}</strong></span>
          </div>
        </CardHeader>
        <CardContent>
          {(batch.members?.length ?? 0) > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Card No</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Correct dates</TableHead>
                  <TableHead>Not correct date</TableHead>
                  <TableHead>Query</TableHead>
                  {canResolve && <TableHead className="w-[140px]">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {batch.members!.map((m) => {
                  const hasNotCorrect = m.notCorrectDates && m.notCorrectDates !== "—";
                  const ticketIds =
                    hasNotCorrect && batch.tickets
                      ? batch.tickets.filter((t) => t.employeeId === m.employeeId).map((t) => t.id)
                      : [];
                  return (
                    <TableRow key={m.employeeId}>
                      <TableCell className="font-mono text-sm">{m.cardNumber}</TableCell>
                      <TableCell className="font-medium">{m.employeeName}</TableCell>
                      <TableCell className="text-muted-foreground">{m.correctDates}</TableCell>
                      <TableCell className="text-muted-foreground">{m.notCorrectDates}</TableCell>
                      <TableCell className="max-w-[220px] truncate text-muted-foreground" title={m.query}>
                        {m.query}
                      </TableCell>
                      {canResolve && (
                        <TableCell>
                          {hasNotCorrect && ticketIds.length > 0 ? (
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                                onClick={() =>
                                  handleOpenMemberDrawer(
                                    {
                                      employeeId: m.employeeId,
                                      employeeName: m.employeeName,
                                      cardNumber: m.cardNumber,
                                      query: m.query ?? "",
                                    },
                                    ticketIds,
                                    "RESOLVED"
                                  )
                                }
                              >
                                Resolve
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-rose-600 border-rose-200 hover:bg-rose-50"
                                onClick={() =>
                                  handleOpenMemberDrawer(
                                    {
                                      employeeId: m.employeeId,
                                      employeeName: m.employeeName,
                                      cardNumber: m.cardNumber,
                                      query: m.query ?? "",
                                    },
                                    ticketIds,
                                    "REJECTED"
                                  )
                                }
                              >
                                Reject
                              </Button>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : batch.tickets.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Card</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Manager query</TableHead>
                  <TableHead>HR status</TableHead>
                  <TableHead className="w-[120px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batch.tickets.map((ticket) => (
                  <TableRow
                    key={ticket.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleOpenDrawer(ticket, batch.managerName)}
                  >
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
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleOpenDrawer(ticket, batch.managerName)}
                      >
                        Resolve
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="py-12 text-center text-muted-foreground">No items in this submission.</div>
          )}
        </CardContent>
      </Card>

      <Sheet
        open={drawerOpen}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedTicket(null);
            setSelectedMember(null);
          }
        }}
      >
        <SheetContent side="right" className="overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{selectedMember ? "Member – Resolve/Reject" : "Ticket details"}</SheetTitle>
          </SheetHeader>
          {(selectedTicket || selectedMember) && (
            <div className="mt-6 space-y-4">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Employee:</span>{" "}
                  {selectedTicket?.employeeName ?? selectedMember?.employeeName}
                </div>
                <div>
                  <span className="text-muted-foreground">Card:</span>{" "}
                  {selectedTicket?.cardNumber ?? selectedMember?.cardNumber}
                </div>
                {selectedTicket && (
                  <div>
                    <span className="text-muted-foreground">Date:</span> {selectedTicket.date}
                  </div>
                )}
                {selectedTicket && (
                  <div>
                    <span className="text-muted-foreground">Manager:</span> {selectedTicket.createdByName ?? "—"}
                  </div>
                )}
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Manager query</p>
                <p className="text-sm mt-1 p-2 rounded bg-muted">
                  {selectedTicket?.query ?? selectedMember?.query ?? "—"}
                </p>
              </div>
              {selectedTicket?.reraiseRemark && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Re-raise remark</p>
                  <p className="text-sm mt-1 p-2 rounded bg-muted">{selectedTicket.reraiseRemark}</p>
                </div>
              )}
              <div>
                <label className="text-sm font-medium block mb-1">Status</label>
                <Select
                  value={drawerStatus || "none"}
                  onValueChange={(v) => setDrawerStatus(v === "none" ? "" : (v as HrStatus))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {HR_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">
                  Remark {needsRemark && <span className="text-destructive">*</span>}
                </label>
                <Textarea
                  placeholder="Enter remark..."
                  value={drawerRemark}
                  onChange={(e) => setDrawerRemark(e.target.value)}
                  rows={4}
                />
              </div>
            </div>
          )}
          <SheetFooter>
            {canResolve && (selectedTicket || selectedMember) && (
              <Button
                onClick={handleResolve}
                disabled={resolveMutation.isPending || !drawerStatus || (needsRemark && !drawerRemark.trim())}
              >
                {resolveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
              </Button>
            )}
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
