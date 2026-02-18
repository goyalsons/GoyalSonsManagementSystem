/**
 * Verification List – before submit: all verified entries (filterable).
 * After submit: only NOT_CORRECT items with border by status (blue / red / green) and Remove on resolved.
 */
import { useState, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Filter, Loader2, Trash2, X, ChevronDown, ChevronUp } from "lucide-react";
import { encodeName, cn } from "@/lib/utils";
import { dismissTicket } from "@/api/attendanceVerification.api";
import type { TeamMember, MyQueriesTicket } from "@/api/attendanceVerification.types";

export type VerificationFilter = "all" | "CORRECT" | "NOT_CORRECT";

export interface VerificationListCardProps {
  teamMembers: TeamMember[];
  verificationMap: Record<string, { status: "CORRECT" | "NOT_CORRECT"; query?: string }>;
  pendingSave: Record<string, { status: "CORRECT" | "NOT_CORRECT"; query?: string }>;
  /** When batch is submitted, show only these (NOT_CORRECT) with status borders + Remove */
  submittedTickets?: MyQueriesTicket[];
  /** Batch info for submitted card header (Month, Submitted date) */
  submittedBatchInfo?: { monthStart: string; submittedAt: string | null };
  /** Name of who verified (kisne verify kiya) – shown on card */
  verifierName?: string;
  /** Called after dismiss so parent can refetch */
  onDismiss?: () => void;
  /** Called when Clear is clicked – parent should clear verificationMap and pendingSave */
  onClear?: () => void;
  /** Called when Delete is clicked (for submitted batch) */
  onDelete?: () => void;
  /** When my-queries failed to load tickets */
  submittedTicketsError?: boolean;
  /** Retry loading tickets (my-queries refetch) */
  onRetry?: () => void;
}

export function VerificationListCard({
  teamMembers,
  verificationMap,
  pendingSave,
  submittedTickets,
  submittedBatchInfo,
  verifierName,
  onDismiss,
  onClear,
  onDelete,
  submittedTicketsError,
  onRetry,
}: VerificationListCardProps) {
  const [filter, setFilter] = useState<VerificationFilter>("all");
  const [submissionExpanded, setSubmissionExpanded] = useState(false);
  const [listExpanded, setListExpanded] = useState(false);
  const queryClient = useQueryClient();

  const dismissMutation = useMutation({
    mutationFn: dismissTicket,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-queries"] });
      onDismiss?.();
    },
  });

  const memberById = useMemo(() => {
    const m = new Map<string, TeamMember>();
    teamMembers.forEach((t) => m.set(t.id, t));
    return m;
  }, [teamMembers]);

  /** Aggregated by employee: { employeeId, correctDates: string[], notCorrectDates: { dateStr, query }[] } */
  const aggregatedRows = useMemo(() => {
    const merged = { ...verificationMap, ...pendingSave };
    const byEmployee = new Map<
      string,
      { correctDates: string[]; notCorrectDates: { dateStr: string; day: number; query?: string }[] }
    >();
    for (const [key, v] of Object.entries(merged)) {
      const parts = key.split("_");
      const dateStr = parts.length >= 2 ? parts[parts.length - 1] : "";
      const employeeId = parts.length >= 2 ? parts.slice(0, -1).join("_") : key;
      if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) continue;
      const day = parseInt(dateStr.split("-")[2], 10) || 0;
      if (filter === "all" || v.status === filter) {
        if (!byEmployee.has(employeeId)) {
          byEmployee.set(employeeId, { correctDates: [], notCorrectDates: [] });
        }
        const row = byEmployee.get(employeeId)!;
        if (v.status === "CORRECT") {
          row.correctDates.push(String(day));
        } else {
          row.notCorrectDates.push({ dateStr, day, query: v.query });
        }
      }
    }
    Array.from(byEmployee.values()).forEach((row) => {
      row.correctDates.sort((a: string, b: string) => parseInt(a, 10) - parseInt(b, 10));
      row.notCorrectDates.sort((a: { day: number }, b: { day: number }) => a.day - b.day);
    });
    return Array.from(byEmployee.entries())
      .map(([employeeId, data]) => ({ employeeId, ...data }))
      .sort((a, b) => a.employeeId.localeCompare(b.employeeId));
  }, [verificationMap, pendingSave, filter]);

  const isSubmittedView = !!submittedBatchInfo;

  const borderClass = (ticket: MyQueriesTicket) => {
    const s = ticket.hrStatus ?? "";
    if (s === "REJECTED") return "border-l-4 border-l-red-500";
    if (s === "RESOLVED") return "border-l-4 border-l-green-500";
    return "border-l-4 border-l-blue-500";
  };

  const statusCounts = useMemo(() => {
    if (!submittedTickets?.length) return { pending: 0, resolved: 0, rejected: 0 };
    let pending = 0, resolved = 0, rejected = 0;
    submittedTickets.forEach((t) => {
      const s = (t.hrStatus ?? "").toUpperCase();
      if (s === "RESOLVED") resolved++;
      else if (s === "REJECTED") rejected++;
      else pending++;
    });
    return { pending, resolved, rejected };
  }, [submittedTickets]);

  const formatMonth = (monthStart: string) => {
    const d = new Date(monthStart);
    if (isNaN(d.getTime())) return monthStart;
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    return `${months[d.getMonth()]} ${d.getFullYear()}`;
  };

  const isExpanded = isSubmittedView ? submissionExpanded : listExpanded;
  const setExpanded = isSubmittedView ? setSubmissionExpanded : setListExpanded;
  const canOpen = isSubmittedView ? (submittedTickets?.length ?? 0) > 0 : aggregatedRows.length > 0;

  return (
    <div className="space-y-3">
      {/* Small card with border – details + Open button */}
      <div className="rounded-lg border-2 border-border bg-card p-4 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="font-medium text-base">
              {verifierName ? `Verified by: ${encodeName(verifierName)}` : "Verification"}
            </div>
            {isSubmittedView ? (
              <>
                <div className="text-sm text-muted-foreground">
                  {aggregatedRows.length > 0 && (
                    <span>{aggregatedRows.length} member{aggregatedRows.length !== 1 ? "s" : ""} verified</span>
                  )}
                  {submittedBatchInfo && (
                    <>
                      {(aggregatedRows.length > 0 ? " · " : "")}
                      <span>Month: {formatMonth(submittedBatchInfo.monthStart)}</span>
                    </>
                  )}
                  {submittedTickets && submittedTickets.length > 0 && (
                    <> · {submittedTickets.length} item{submittedTickets.length !== 1 ? "s" : ""}</>
                  )}
                </div>
                {submittedTickets && submittedTickets.length > 0 && (statusCounts.pending > 0 || statusCounts.resolved > 0 || statusCounts.rejected > 0) && (
                  <div className="flex flex-wrap gap-2 text-xs">
                    {statusCounts.pending > 0 && <Badge variant="secondary">Pending: {statusCounts.pending}</Badge>}
                    {statusCounts.resolved > 0 && <Badge variant="default">Resolved: {statusCounts.resolved}</Badge>}
                    {statusCounts.rejected > 0 && <Badge variant="destructive">Rejected: {statusCounts.rejected}</Badge>}
                  </div>
                )}
              </>
            ) : (
              aggregatedRows.length > 0 && (
                <div className="text-sm text-muted-foreground">
                  {aggregatedRows.length} member{aggregatedRows.length !== 1 ? "s" : ""} verified
                </div>
              )
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setExpanded((e) => !e)}
              disabled={!canOpen && !isSubmittedView}
            >
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              {isExpanded ? "Hide list" : "Open"}
            </Button>
            {(isSubmittedView && onDelete) && (
              <Button variant="outline" size="sm" onClick={onDelete} className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10">
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            )}
            {!isSubmittedView && (
              <>
                <Button variant="outline" size="sm" onClick={() => onClear?.()} disabled={aggregatedRows.length === 0 || !onClear} className="gap-1.5">
                  <X className="h-4 w-4" />
                  Clear
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-1.5">
                      <Filter className="h-4 w-4" />
                      Filters
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuRadioGroup value={filter} onValueChange={(v) => setFilter(v as VerificationFilter)}>
                      <DropdownMenuRadioItem value="all">All</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="CORRECT">Correct only</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="NOT_CORRECT">Not Correct only</DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
          </div>
        </div>
      </div>

      {/* List – shown when Open is clicked */}
      {isExpanded && (
        <div className="rounded-lg border-2 border-border overflow-hidden bg-background">
        {isSubmittedView ? (
          submittedTickets === undefined ? (
            <div className="py-8 px-4 flex flex-col items-center justify-center gap-3 text-sm">
              {submittedTicketsError ? (
                <>
                  <span className="text-destructive">Failed to load list</span>
                  {onRetry && (
                    <Button variant="outline" size="sm" onClick={() => onRetry()}>
                      Retry
                    </Button>
                  )}
                </>
              ) : (
                <span className="text-muted-foreground">Loading...</span>
              )}
            </div>
          ) : submittedTickets.length === 0 ? (
            aggregatedRows.length === 0 ? (
              <div className="py-8 px-4 text-center text-muted-foreground text-sm">
                No verifications in this submission.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Card No</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Correct dates</TableHead>
                    <TableHead>Not correct date</TableHead>
                    <TableHead>Query</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {aggregatedRows.map((row) => {
                    const member = memberById.get(row.employeeId);
                    const fullName = member ? `${member.firstName} ${member.lastName || ""}`.trim() || "—" : "—";
                    const cardNo = member?.cardNumber ?? member?.id ?? "—";
                    const correctDatesStr =
                      row.correctDates.length > 0
                        ? row.notCorrectDates.length === 0
                          ? "All correct"
                          : row.correctDates.join(", ")
                        : "—";
                    const notCorrectDatesStr = row.notCorrectDates.map((d) => d.day).join(", ") || "—";
                    const queryStr =
                      row.notCorrectDates.length > 0
                        ? row.notCorrectDates
                            .map((d) => (d.query ? `${d.day}: ${d.query}` : String(d.day)))
                            .join("; ")
                        : "—";
                    return (
                      <TableRow key={row.employeeId}>
                        <TableCell className="font-mono text-sm">{cardNo}</TableCell>
                        <TableCell className="font-medium">{encodeName(fullName)}</TableCell>
                        <TableCell className="text-muted-foreground">{correctDatesStr}</TableCell>
                        <TableCell className="text-muted-foreground">{notCorrectDatesStr}</TableCell>
                        <TableCell className="max-w-[220px] truncate text-muted-foreground" title={queryStr}>
                          {queryStr}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )
          ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-1" />
                    <TableHead>Card No</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Your query</TableHead>
                    <TableHead>HR status</TableHead>
                    <TableHead>HR remark</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {submittedTickets.map((ticket) => (
                    <TableRow key={ticket.id} className={cn(borderClass(ticket))}>
                      <TableCell className="w-1 p-0" />
                      <TableCell className="font-mono text-sm">{ticket.cardNumber}</TableCell>
                      <TableCell className="font-medium">{encodeName(ticket.employeeName)}</TableCell>
                      <TableCell>{ticket.date}</TableCell>
                      <TableCell className="max-w-[200px] truncate text-muted-foreground" title={ticket.query ?? ""}>
                        {ticket.query ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={ticket.hrStatus === "RESOLVED" ? "default" : ticket.hrStatus === "REJECTED" ? "destructive" : "secondary"}
                        >
                          {ticket.hrStatus ?? "Pending"}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-muted-foreground" title={ticket.hrRemark ?? ""}>
                        {ticket.hrRemark ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {ticket.hrStatus === "RESOLVED" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => dismissMutation.mutate(ticket.id)}
                            disabled={dismissMutation.isPending}
                          >
                            {dismissMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                            Remove
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
          )
        ) : aggregatedRows.length === 0 ? (
          <div className="py-8 px-4 text-center text-muted-foreground text-sm">
            No verifications yet. Mark days as Correct or Not Correct in the list above.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Card No</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Correct dates</TableHead>
                <TableHead>Not correct date</TableHead>
                <TableHead>Query</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {aggregatedRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No verifications yet. Mark days as Correct or Not Correct in the list above.
                  </TableCell>
                </TableRow>
              )}
              {aggregatedRows.map((row) => {
                const member = memberById.get(row.employeeId);
                const fullName = member ? `${member.firstName} ${member.lastName || ""}`.trim() || "—" : "—";
                const cardNo = member?.cardNumber ?? member?.id ?? "—";
                const correctDatesStr =
                  row.correctDates.length > 0
                    ? row.notCorrectDates.length === 0
                      ? "All correct"
                      : row.correctDates.join(", ")
                    : "—";
                const notCorrectDatesStr = row.notCorrectDates.map((d) => d.day).join(", ") || "—";
                const queryStr =
                  row.notCorrectDates.length > 0
                    ? row.notCorrectDates
                        .map((d) => (d.query ? `${d.day}: ${d.query}` : String(d.day)))
                        .join("; ")
                    : "—";
                return (
                  <TableRow key={row.employeeId}>
                    <TableCell className="font-mono text-sm">{cardNo}</TableCell>
                    <TableCell className="font-medium">{encodeName(fullName)}</TableCell>
                    <TableCell className="text-muted-foreground">{correctDatesStr}</TableCell>
                    <TableCell className="text-muted-foreground">{notCorrectDatesStr}</TableCell>
                    <TableCell className="max-w-[220px] truncate text-muted-foreground" title={queryStr}>
                      {queryStr}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
        </div>
      )}
    </div>
  );
}
