import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery, useQueries, useQueryClient, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { Calendar, Loader2, Send, Unlock } from "lucide-react";
import { apiGet } from "@/lib/api";
import {
  createOrLoadBatch,
  getVerifications,
  getSubmitContext,
  getMyQueries,
  saveVerifications,
  submitBatch,
  unsubmitBatch,
  deleteBatch,
  clearVerifications,
} from "@/api/attendanceVerification.api";
import type { TeamMember, AttendanceResponse, VerificationStatus } from "@/api/attendanceVerification.types";
import { CheckViewCard } from "./CheckViewCard";
import { VerificationListCard } from "./VerificationListCard";

export default function AttendanceCheckPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [batch, setBatch] = useState<{ id: string; submittedAt?: string | null } | null>(null);
  const [verificationMap, setVerificationMap] = useState<Record<string, { status: VerificationStatus; query?: string }>>({});
  const [pendingSave, setPendingSave] = useState<Record<string, { status: VerificationStatus; query?: string }>>({});
  const [lastSaveError, setLastSaveError] = useState<string | null>(null);
  const [expandedMemberIds, setExpandedMemberIds] = useState<Set<string>>(new Set());
  const [selectedCheckMemberIds, setSelectedCheckMemberIds] = useState<Set<string>>(new Set());
  const [submitModalOpen, setSubmitModalOpen] = useState(false);

  const monthStartStr = useMemo(() => {
    const m = String(selectedMonth + 1).padStart(2, "0");
    return `${selectedYear}-${m}-01`;
  }, [selectedMonth, selectedYear]);

  const { from: fromStr, to: toStr } = useMemo(() => {
    const d = new Date(selectedYear, selectedMonth, 1);
    const last = new Date(selectedYear, selectedMonth + 1, 0);
    return {
      from: d.toISOString().slice(0, 10),
      to: last.toISOString().slice(0, 10),
    };
  }, [selectedMonth, selectedYear]);

  const { data: teamResponse } = useQuery({
    queryKey: ["my-team-members"],
    queryFn: () => apiGet<{ success: boolean; data: TeamMember[] }>("/emp-manager/my-team"),
  });
  const teamMembers: TeamMember[] = teamResponse?.data ?? [];

  // BigQuery has data only for current + previous month; refresh when date may change
  const [nowKey, setNowKey] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowKey(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  const { prevMonth, prevYear, currMonth, currYear } = useMemo(() => {
    const now = new Date();
    const cm = now.getMonth();
    const cy = now.getFullYear();
    const pm = cm === 0 ? 11 : cm - 1;
    const py = cm === 0 ? cy - 1 : cy;
    return { prevMonth: pm, prevYear: py, currMonth: cm, currYear: cy };
  }, [nowKey]);

  const isSelectedInAllowedWindow = useMemo(
    () =>
      (selectedYear === prevYear && selectedMonth === prevMonth) ||
      (selectedYear === currYear && selectedMonth === currMonth),
    [selectedYear, selectedMonth, prevYear, prevMonth, currYear, currMonth]
  );

  const isMinDate = selectedYear === prevYear && selectedMonth === prevMonth;
  const isMaxDate = selectedYear === currYear && selectedMonth === currMonth;

  // Auto-switch to current month when selected goes outside allowed window
  useEffect(() => {
    if (isSelectedInAllowedWindow) return;
    setSelectedMonth(currMonth);
    setSelectedYear(currYear);
  }, [isSelectedInAllowedWindow, currMonth, currYear]);

  const createOrLoadMutation = useMutation({
    mutationFn: () => createOrLoadBatch(monthStartStr),
    onSuccess: (b) => {
      setBatch({ id: b.id, submittedAt: b.submittedAt ?? null });
    },
    onError: (e: Error) => {
      toast({ title: "Failed to load batch", description: e.message, variant: "destructive" });
      setBatch(null);
    },
  });

  useEffect(() => {
    createOrLoadMutation.mutate();
  }, [monthStartStr]);

  const { data: verificationsData } = useQuery({
    queryKey: ["team-verifications", batch?.id ?? "none", fromStr, toStr],
    queryFn: () => getVerifications(batch?.id ? { batchId: batch.id } : { from: fromStr, to: toStr }),
    enabled: !!batch?.id || !batch,
  });

  useEffect(() => {
    if (verificationsData?.verifications) {
      const next: Record<string, { status: VerificationStatus; query?: string }> = {};
      for (const [k, v] of Object.entries(verificationsData.verifications)) {
        next[k] = { status: v.status as VerificationStatus, query: v.query ?? undefined };
      }
      setVerificationMap(next);
    }
  }, [verificationsData]);

  const attendanceQueries = useQueries({
    queries: teamMembers.map((m) => ({
      queryKey: ["team-attendance-check", m.cardNumber || m.id, monthStartStr],
      queryFn: () =>
        apiGet<AttendanceResponse>(`/attendance/history/${m.cardNumber || m.id}?month=${monthStartStr}`),
      enabled: !!m.cardNumber && !!batch?.id,
    })),
  });

  const memberAttendanceMap = useMemo(() => {
    const map = new Map<string, AttendanceResponse>();
    teamMembers.forEach((member, i) => {
      const data = attendanceQueries[i]?.data;
      if (data?.records) map.set(member.id, data);
    });
    return map;
  }, [teamMembers, attendanceQueries]);

  const getKey = (employeeId: string, dateStr: string) => `${employeeId}_${dateStr}`;
  const getStatus = (employeeId: string, dateStr: string): VerificationStatus | null => {
    const v = pendingSave[getKey(employeeId, dateStr)] ?? verificationMap[getKey(employeeId, dateStr)];
    return v?.status ?? null;
  };
  const getQuery = (employeeId: string, dateStr: string): string => {
    const v = pendingSave[getKey(employeeId, dateStr)] ?? verificationMap[getKey(employeeId, dateStr)];
    return v?.query ?? "";
  };

  const setStatus = useCallback((employeeId: string, dateStr: string, status: VerificationStatus | null, query?: string) => {
    const key = getKey(employeeId, dateStr);
    if (status === null) {
      setVerificationMap((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      setPendingSave((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    } else {
      const entry = status === "NOT_CORRECT" && query !== undefined ? { status, query } : { status };
      setVerificationMap((prev) => ({ ...prev, [key]: entry }));
      setPendingSave((prev) => ({ ...prev, [key]: entry }));
    }
  }, []);

  const savePending = useCallback(async () => {
    const keys = Object.keys(pendingSave);
    if (keys.length === 0 || !batch?.id || batch.submittedAt) return;
    setLastSaveError(null);
    try {
      const updates = keys.map((key) => {
        const parts = key.split("_");
        const dateStr = parts.length >= 2 ? parts[parts.length - 1] : monthStartStr;
        const employeeId = parts.length >= 2 ? parts.slice(0, -1).join("_") : key;
        const v = pendingSave[key];
        return {
          employeeId,
          date: dateStr,
          status: v.status,
          query: v.status === "NOT_CORRECT" ? (v.query ?? "") : null,
        };
      });
      const uniqueByEmployeeDate = Array.from(
        new Map(updates.map((u) => [`${u.employeeId}_${u.date}`, u])).values()
      );
      await saveVerifications(batch.id, uniqueByEmployeeDate);
      setPendingSave({});
      queryClient.invalidateQueries({ queryKey: ["team-verifications"] });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to save";
      setLastSaveError(msg);
      toast({ title: "Save failed", description: msg, variant: "destructive" });
    }
  }, [pendingSave, batch, monthStartStr, queryClient]);

  const submitMutation = useMutation({
    mutationFn: async (batchId: string) => {
      await submitBatch(batchId);
    },
    onSuccess: () => {
      setBatch((b) => (b ? { ...b, submittedAt: new Date().toISOString() } : null));
      queryClient.invalidateQueries({ queryKey: ["team-verifications", "my-queries"] });
      queryClient.prefetchQuery({ queryKey: ["my-queries"] }); // Start fetch immediately so list loads faster
      toast({ title: "Submitted to HR", description: "Editing is now locked for this month." });
    },
    onError: (e: Error) => {
      toast({ title: "Submit failed", description: e.message, variant: "destructive" });
    },
  });

  const unsubmitMutation = useMutation({
    mutationFn: (batchId: string) => unsubmitBatch(batchId),
    onSuccess: () => {
      setBatch((b) => (b ? { ...b, submittedAt: undefined } : null));
      queryClient.invalidateQueries({ queryKey: ["team-verifications", "my-queries"] });
      toast({ title: "Reopened for editing", description: "You can edit and submit again when done." });
    },
    onError: (e: Error) => {
      toast({ title: "Failed to reopen", description: e.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (batchId: string) => deleteBatch(batchId),
    onSuccess: () => {
      setBatch(null);
      queryClient.invalidateQueries({ queryKey: ["team-verifications", "my-queries"] });
      createOrLoadMutation.mutate();
      toast({ title: "Deleted", description: "Batch removed. HR will no longer see it." });
    },
    onError: (e: Error) => {
      toast({ title: "Failed to delete", description: e.message, variant: "destructive" });
    },
  });

  const doSubmit = useCallback(async () => {
    if (!batch?.id || batch.submittedAt) return;
    try {
      if (Object.keys(pendingSave).length > 0) await savePending();
      await submitMutation.mutateAsync(batch.id);
      setSubmitModalOpen(false);
    } catch {
      // Error already shown by toast
    }
  }, [batch, pendingSave, savePending, submitMutation]);

  const handleSubmitToHr = useCallback(() => {
    setSubmitModalOpen(true);
  }, []);

  const { data: submitContext } = useQuery({
    queryKey: ["attendance-submit-context"],
    queryFn: getSubmitContext,
    enabled: submitModalOpen,
  });

  const { data: myQueriesData, refetch: refetchMyQueries, isError: myQueriesError } = useQuery({
    queryKey: ["my-queries"],
    queryFn: getMyQueries,
    enabled: !!batch?.submittedAt,
  });
  const currentBatch = useMemo(() => {
    if (!batch?.id || !myQueriesData?.batches) return undefined;
    return myQueriesData.batches.find((x) => x.id === batch.id);
  }, [batch?.id, myQueriesData?.batches]);
  const currentBatchTickets = currentBatch?.tickets ?? undefined;
  const verifierName = currentBatch?.createdBy?.name ?? submitContext?.managerName ?? user?.name ?? undefined;

  // Submit to HO enable only when: selected month ke saare members check ho jaye (har member ke saare relevant dates CORRECT/NOT_CORRECT)
  const canSubmit = useMemo(() => {
    const merged = { ...verificationMap, ...pendingSave };
    const todayStr = new Date().toISOString().slice(0, 10);
    const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
    for (const member of teamMembers) {
      const resp = memberAttendanceMap.get(member.id);
      if (!resp?.records?.length) continue;
      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        if (dateStr > todayStr) continue; // only require verification for past/today
        const toYmd = (dt: unknown) => {
          const s = typeof dt === "string" ? dt : (dt as { value?: string })?.value ?? "";
          const d = new Date(s);
          if (isNaN(d.getTime())) return s.slice(0, 10);
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        };
        if (!resp.records.some((r) => toYmd(r.dt) === dateStr)) continue;
        const key = `${member.id}_${dateStr}`;
        const v = merged[key];
        if (!v || (v.status !== "CORRECT" && v.status !== "NOT_CORRECT")) return false;
        if (v.status === "NOT_CORRECT" && !(v.query ?? "").trim()) return false;
      }
    }
    return true;
  }, [teamMembers, memberAttendanceMap, verificationMap, pendingSave, selectedMonth, selectedYear]);

  const submitSummary = useMemo(() => {
    const merged = { ...verificationMap, ...pendingSave };
    const monthLabel = new Date(selectedYear, selectedMonth).toLocaleString("en", { month: "long" }) + " " + selectedYear;
    let verifiedMembers = 0;
    let notCorrectCount = 0;
    const seenMembers = new Set<string>();
    for (const [key, v] of Object.entries(merged)) {
      const parts = key.split("_");
      const dateStr = parts.length >= 2 ? parts[parts.length - 1] : "";
      if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) continue;
      const employeeId = parts.slice(0, -1).join("_");
      if (!seenMembers.has(employeeId)) {
        seenMembers.add(employeeId);
        verifiedMembers++;
      }
      if (v.status === "NOT_CORRECT") notCorrectCount++;
    }
    return { monthLabel, verifiedMembers, notCorrectCount };
  }, [verificationMap, pendingSave, selectedMonth, selectedYear]);

  const handlePrevMonth = () => {
    if (isMinDate) return;
    setSelectedMonth(prevMonth);
    setSelectedYear(prevYear);
  };

  const handleNextMonth = () => {
    if (isMaxDate) return;
    setSelectedMonth(currMonth);
    setSelectedYear(currYear);
  };

  const toggleExpand = (memberId: string) => {
    setExpandedMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(memberId)) next.delete(memberId);
      else next.add(memberId);
      return next;
    });
  };

  const toggleSelectMember = (memberId: string) => {
    setSelectedCheckMemberIds((prev) =>
      prev.has(memberId) ? new Set() : new Set([memberId])
    );
  };

  const toDateKey = (dt: string | unknown): string => {
    const s = typeof dt === "string" ? dt : (dt as { value?: string })?.value ?? "";
    const d = new Date(s);
    if (isNaN(d.getTime())) return String(s).slice(0, 10);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  const isLocked = !!batch?.submittedAt;
  const isLoading = createOrLoadMutation.isPending || attendanceQueries.some((q) => q.isLoading);

  return (
    <div className="space-y-6 min-w-0 overflow-x-hidden">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2 sm:gap-3 truncate">
            <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-lg bg-indigo-500 flex items-center justify-center shrink-0">
              <Calendar className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
            </div>
            <span className="truncate">Attendance Check</span>
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">View attendance records for your team members</p>
        </div>
      </div>

      {lastSaveError && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {lastSaveError}
        </div>
      )}

      {!batch?.id && createOrLoadMutation.isPending && (
        <Card>
          <CardContent className="py-12 flex items-center justify-center gap-2">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="text-muted-foreground">Loading batch...</span>
          </CardContent>
        </Card>
      )}

      {batch?.id && (
        <div className="space-y-6">
          {/* Verification list card – only after submit */}
          <CheckViewCard
            teamMembers={teamMembers}
            selectedMonth={selectedMonth}
            selectedYear={selectedYear}
            isMinDate={isMinDate}
            isMaxDate={isMaxDate}
            handlePrevMonth={handlePrevMonth}
            handleNextMonth={handleNextMonth}
            memberAttendanceMap={memberAttendanceMap}
            expandedMemberIds={expandedMemberIds}
            selectedCheckMemberIds={selectedCheckMemberIds}
            toggleExpand={toggleExpand}
            toggleSelectMember={toggleSelectMember}
            getStatus={getStatus}
            getQuery={getQuery}
            setStatus={setStatus}
            batch={batch}
            isLocked={isLocked}
            isLoading={isLoading}
            savePending={savePending}
            pendingSave={pendingSave}
          />
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-block">
                      <Button
                        size="sm"
                        onClick={handleSubmitToHr}
                        disabled={submitMutation.isPending || !canSubmit}
                        className="gap-2"
                      >
                        {submitMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        Submit to HO
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    {!canSubmit ? "Verify all dates before submitting" : "Submit batch to HR"}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              {isLocked && batch?.id && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => unsubmitMutation.mutate(batch.id)}
                  disabled={unsubmitMutation.isPending}
                >
                  {unsubmitMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Unlock className="h-4 w-4 mr-2" />}
                  Reopen
                </Button>
              )}
            </div>
          </div>
          {batch?.submittedAt && (
          <VerificationListCard
            teamMembers={teamMembers}
            verificationMap={verificationMap}
            pendingSave={pendingSave}
            submittedTickets={currentBatchTickets ?? (submitSummary.notCorrectCount === 0 ? [] : undefined)}
            submittedBatchInfo={{ monthStart: monthStartStr, submittedAt: batch.submittedAt! }}
            verifierName={verifierName}
            onDismiss={refetchMyQueries}
            onDelete={() => deleteMutation.mutate(batch!.id)}
            submittedTicketsError={myQueriesError}
            onRetry={() => void refetchMyQueries()}
            onClear={async () => {
              if (!batch?.id || batch.submittedAt) return;
              try {
                await clearVerifications(batch.id);
                setVerificationMap({});
                setPendingSave({});
                queryClient.invalidateQueries({ queryKey: ["team-verifications"] });
                toast({ title: "Cleared", description: "Verification list cleared from database." });
              } catch (e) {
                toast({ title: "Failed to clear", description: (e as Error).message, variant: "destructive" });
              }
            }}
          />
          )}
        </div>
      )}

      <Dialog open={submitModalOpen} onOpenChange={setSubmitModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Submit to HO</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <p className="text-muted-foreground">Review and confirm submission (prefilled):</p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
              <dt className="text-muted-foreground">Month</dt>
              <dd className="font-medium">{submitSummary.monthLabel}</dd>
              <dt className="text-muted-foreground">Members verified</dt>
              <dd className="font-medium">{submitSummary.verifiedMembers}</dd>
              <dt className="text-muted-foreground">Not correct (queries)</dt>
              <dd className="font-medium">{submitSummary.notCorrectCount}</dd>
              <dt className="text-muted-foreground">Manager Name</dt>
              <dd className="font-medium">{submitContext?.managerName ?? "—"}</dd>
              <dt className="text-muted-foreground">Card No</dt>
              <dd className="font-mono">{submitContext?.managerCardNo ?? "—"}</dd>
              <dt className="text-muted-foreground">Unit No</dt>
              <dd className="font-medium">{submitContext?.managerUnitNo ?? "—"}</dd>
            </dl>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubmitModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => doSubmit()}
              disabled={submitMutation.isPending}
            >
              {submitMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
