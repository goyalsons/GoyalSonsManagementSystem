import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery, useQueries, useQueryClient, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth-context";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Textarea } from "@/components/ui/textarea";
import { 
  Calendar, 
  ChevronLeft, 
  ChevronRight,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Loader2,
  Users,
  RefreshCw,
  Search,
  List,
  XCircle,
  Send,
  Unlock,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiGet } from "@/lib/api";
import { encodeName, cn } from "@/lib/utils";
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
import type { VerificationStatus } from "@/api/attendanceVerification.types";
import { CheckViewCard } from "./CheckViewCard";
import { VerificationListCard } from "./VerificationListCard";

interface AttendanceRecord {
  card_no: string;
  dt: string;
  Name: string;
  STATUS: string;
  t_in: string | null;
  t_out: string | null;
  result_t_in: string | null;
  result_t_out: string | null;
}

interface AttendanceResponse {
  records: AttendanceRecord[];
  summary: {
    present: number;
    absent: number;
    halfDay: number;
    leave: number;
    total: number;
  };
}

interface TeamMember {
  id: string;
  cardNumber: string | null;
  firstName: string;
  lastName: string | null;
  designation?: { name: string } | null;
  department?: { name: string } | null;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const YEARS = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

function getStatusColor(status: string): string {
  const s = (status || "").toUpperCase().trim();
  if (s.includes("DOUBLE") && s.includes("ABSENT")) return "#ef4444";
  if (s === "ABSENT") return "#ef4444";
  if (s.includes("PRESENT")) return "#10b981";
  if (s === "HALFDAY" || s === "HALF DAY" || s.includes("HALF")) return "#eab308";
  if (s.includes("MISS")) return "#f97316";
  if (s === "LEAVE") return "#3b82f6";
  if (s === "WEEKLY OFF" || s === "WO") return "#a855f7";
  return "#9ca3af";
}

function getStatusLabel(status: string): string {
  const s = (status || "").toUpperCase().trim();
  if (s.includes("PRESENT")) return "P";
  if (s === "ABSENT" || s.includes("DOUBLE")) return "A";
  if (s.includes("HALF")) return "HD";
  if (s.includes("MISS")) return "M";
  if (s === "LEAVE") return "L";
  if (s === "WEEKLY OFF" || s === "WO") return "WO";
  return "-";
}

interface StatusStyle {
  bgColor: string;
  dots: { color: string; count: number }[];
}

function getStatusStyle(status: string): StatusStyle {
  const s = (status || "").toUpperCase().trim();
  if (s === "DOUBLE ABSENT" || s === "DOUBLE A" || s.includes("DOUBLE")) {
    return { bgColor: "#ef4444", dots: [{ color: "#000000", count: 2 }] };
  }
  if (s === "ABSENT") return { bgColor: "#ef4444", dots: [] };
  if (s === "PRESENT") return { bgColor: "#10b981", dots: [] };
  if (s === "PRESENT LATE") return { bgColor: "#10b981", dots: [{ color: "#ffffff", count: 1 }] };
  if (s === "PRESENT EARLY_OUT" || s === "PRESENT E") return { bgColor: "#10b981", dots: [{ color: "#3b82f6", count: 1 }] };
  if (s === "PRESENT LATE EARLY_OUT" || s === "PRESENT L") {
    return { bgColor: "#10b981", dots: [{ color: "#ffffff", count: 1 }, { color: "#3b82f6", count: 1 }] };
  }
  if (s === "HALFDAY" || s === "HALF DAY") return { bgColor: "#eab308", dots: [] };
  if (s === "MISS OUT" || s === "MISS IN") return { bgColor: "#f97316", dots: [{ color: "#3b82f6", count: 1 }] };
  if (s === "MISS PENDING" || s === "MISS PEND") return { bgColor: "var(--muted)", dots: [{ color: "#9ca3af", count: 1 }] };
  if (s === "LEAVE") return { bgColor: "#3b82f6", dots: [] };
  if (s === "WEEKLY OFF" || s === "WO") return { bgColor: "#a855f7", dots: [] };
  if (s.includes("PRESENT") && s.includes("LATE") && s.includes("EARLY")) {
    return { bgColor: "#10b981", dots: [{ color: "#ffffff", count: 1 }, { color: "#3b82f6", count: 1 }] };
  }
  if (s.includes("PRESENT") && s.includes("LATE")) return { bgColor: "#10b981", dots: [{ color: "#ffffff", count: 1 }] };
  if (s.includes("PRESENT") && s.includes("EARLY")) return { bgColor: "#10b981", dots: [{ color: "#3b82f6", count: 1 }] };
  if (s.includes("PRESENT")) return { bgColor: "#10b981", dots: [] };
  if (s.includes("ABSENT")) return { bgColor: "#ef4444", dots: [] };
  if (s.includes("MISS")) return { bgColor: "#f97316", dots: [] };
  if (s.includes("HALF")) return { bgColor: "#eab308", dots: [] };
  return { bgColor: "var(--muted)", dots: [] };
}

function calculateSummary(records: AttendanceRecord[]) {
  let present = 0, absent = 0, doubleAbsent = 0, halfDay = 0, missInOut = 0;
  records.forEach((record) => {
    const s = (record.STATUS || "").toUpperCase().trim();
    if (s.includes("DOUBLE") && s.includes("ABSENT")) doubleAbsent++;
    else if (s === "ABSENT") absent++;
    else if (s.includes("PRESENT")) present++;
    else if (s === "HALFDAY" || s === "HALF DAY" || s.includes("HALF")) halfDay++;
    else if (s.includes("MISS")) missInOut++;
  });
  return { present, absent, doubleAbsent, halfDay, missInOut, total: records.length };
}

type ViewMode = "single" | "check";

export default function TeamAttendancePage() {
  const { user, hasPolicy } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<ViewMode>("single");
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMember, setSelectedMember] = useState<string>("all");
  const [selectedRecord, setSelectedRecord] = useState<AttendanceRecord | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [searchMessage, setSearchMessage] = useState<"not_under_you" | "not_found" | null>(null);
  const [searching, setSearching] = useState(false);
  const [membersListOpen, setMembersListOpen] = useState(false);
  const [expandedMemberIds, setExpandedMemberIds] = useState<Set<string>>(new Set());
  const [selectedCheckMemberIds, setSelectedCheckMemberIds] = useState<Set<string>>(new Set());
  const [submitModalOpen, setSubmitModalOpen] = useState(false);
  const [verificationMap, setVerificationMap] = useState<Record<string, { status: VerificationStatus; query?: string }>>({});
  const [pendingSave, setPendingSave] = useState<Record<string, { status: VerificationStatus; query?: string }>>({});
  const canViewTeam = hasPolicy("attendance.team.view");
  const canVerify = hasPolicy("attendance.team.verify");

  const monthDate = useMemo(() => {
    const month = String(selectedMonth + 1).padStart(2, "0");
    return `${selectedYear}-${month}-01`;
  }, [selectedMonth, selectedYear]);

  const { from: fromStr, to: toStr } = useMemo(() => {
    const d = new Date(selectedYear, selectedMonth, 1);
    const last = new Date(selectedYear, selectedMonth + 1, 0);
    return {
      from: d.toISOString().slice(0, 10),
      to: last.toISOString().slice(0, 10),
    };
  }, [selectedMonth, selectedYear]);

  // Fetch team members using my-team API
  const { data: teamResponse, isLoading: loadingTeam, isRefetching: refetchingTeam, refetch: refetchTeam } = useQuery<{ data?: TeamMember[] }>({
    queryKey: ["my-team-members"],
    queryFn: () => apiGet("/emp-manager/my-team"),
    enabled: canViewTeam,
  });

  const teamMembers: TeamMember[] = teamResponse?.data ?? [];

  // Fetch attendance for selected member or all team
  const { data: attendanceData, isLoading: loadingAttendance, refetch: refetchAttendance } = useQuery<AttendanceResponse>({
    queryKey: ["team-attendance", selectedMember, monthDate],
    queryFn: () => {
      if (selectedMember === "all") {
        return Promise.resolve({ records: [], summary: { present: 0, absent: 0, halfDay: 0, leave: 0, total: 0 } });
      }
      return apiGet(`/attendance/history/${selectedMember}?month=${monthDate}`);
    },
    enabled: canViewTeam && selectedMember !== "all",
  });

  // Check View: batch and verifications
  const [checkBatch, setCheckBatch] = useState<{ id: string; submittedAt?: string | null } | null>(null);
  const createOrLoadMutation = useMutation({
    mutationFn: () => createOrLoadBatch(monthDate),
    onSuccess: (b) => setCheckBatch({ id: b.id, submittedAt: b.submittedAt ?? null }),
    onError: () => setCheckBatch(null),
  });

  useEffect(() => {
    if (viewMode === "check" && canVerify) {
      createOrLoadMutation.mutate();
    }
  }, [viewMode, canVerify, monthDate]);

  const { data: verificationsData } = useQuery({
    queryKey: ["team-verifications", checkBatch?.id ?? "none", fromStr, toStr],
    queryFn: () =>
      getVerifications(checkBatch?.id ? { batchId: checkBatch.id } : { from: fromStr, to: toStr }),
    enabled: (!!checkBatch?.id || !checkBatch) && viewMode === "check" && canVerify,
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
      queryKey: ["team-attendance-check", m.cardNumber || m.id, monthDate],
      queryFn: () => apiGet<AttendanceResponse>(`/attendance/history/${m.cardNumber || m.id}?month=${monthDate}`),
      enabled: !!m.cardNumber && viewMode === "check" && !!checkBatch?.id,
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

  useEffect(() => {
    if (isSelectedInAllowedWindow) return;
    setSelectedMonth(currMonth);
    setSelectedYear(currYear);
  }, [isSelectedInAllowedWindow, currMonth, currYear]);

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

  const handleRefresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["my-team-members"] });
    await refetchTeam();
    if (selectedMember !== "all") {
      await queryClient.invalidateQueries({ queryKey: ["team-attendance", selectedMember, monthDate] });
      await refetchAttendance();
    }
    if (viewMode === "check") {
      await queryClient.invalidateQueries({ queryKey: ["team-attendance-check"] });
      await queryClient.invalidateQueries({ queryKey: ["team-verifications"] });
      createOrLoadMutation.mutate();
    }
  };

  const getKey = (employeeId: string, dateStr: string) => `${employeeId}_${dateStr}`;
  const getStatus = (employeeId: string, dateStr: string): VerificationStatus | null => {
    const v = pendingSave[getKey(employeeId, dateStr)] ?? verificationMap[getKey(employeeId, dateStr)];
    return v?.status ?? null;
  };
  const getQuery = (employeeId: string, dateStr: string): string => {
    const v = pendingSave[getKey(employeeId, dateStr)] ?? verificationMap[getKey(employeeId, dateStr)];
    return v?.query ?? "";
  };
  const setStatus = useCallback(
    (employeeId: string, dateStr: string, status: VerificationStatus | null, query?: string) => {
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
    },
    []
  );

  const savePending = useCallback(async () => {
    const keys = Object.keys(pendingSave);
    if (keys.length === 0 || !checkBatch?.id || checkBatch.submittedAt) return;
    try {
      const updates = keys.map((key) => {
        const parts = key.split("_");
        const dateStr = parts.length >= 2 ? parts[parts.length - 1] : monthDate;
        const employeeId = parts.length >= 2 ? parts.slice(0, -1).join("_") : key;
        const v = pendingSave[key];
        return {
          employeeId,
          date: dateStr,
          status: v.status,
          query: v.status === "NOT_CORRECT" ? (v.query ?? "") : null,
        };
      });
      const unique = Array.from(new Map(updates.map((u) => [`${u.employeeId}_${u.date}`, u])).values());
      await saveVerifications(checkBatch.id, unique);
      setPendingSave({});
      queryClient.invalidateQueries({ queryKey: ["team-verifications"] });
    } catch (e: unknown) {
      console.error("Save verifications failed:", e);
    }
  }, [pendingSave, checkBatch, monthDate, queryClient]);

  const submitMutation = useMutation({
    mutationFn: (batchId: string) => submitBatch(batchId),
    onSuccess: () => {
      setCheckBatch((b) => (b ? { ...b, submittedAt: new Date().toISOString() } : null));
      queryClient.invalidateQueries({ queryKey: ["team-verifications", "my-queries"] });
      queryClient.prefetchQuery({ queryKey: ["my-queries"] });
    },
  });

  const unsubmitMutation = useMutation({
    mutationFn: (batchId: string) => unsubmitBatch(batchId),
    onSuccess: () => {
      setCheckBatch((b) => (b ? { ...b, submittedAt: undefined } : null));
      queryClient.invalidateQueries({ queryKey: ["team-verifications", "my-queries"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (batchId: string) => deleteBatch(batchId),
    onSuccess: () => {
      setCheckBatch(null);
      queryClient.invalidateQueries({ queryKey: ["team-verifications", "my-queries"] });
      createOrLoadMutation.mutate();
      toast({ title: "Deleted", description: "Batch removed. HR will no longer see it." });
    },
    onError: (e: Error) => {
      toast({ title: "Failed to delete", description: e.message, variant: "destructive" });
    },
  });

  const doSubmit = useCallback(async () => {
    if (!checkBatch?.id || checkBatch.submittedAt) return;
    if (Object.keys(pendingSave).length > 0) await savePending();
    await submitMutation.mutateAsync(checkBatch.id);
    setSubmitModalOpen(false);
  }, [checkBatch, pendingSave, savePending, submitMutation]);

  const handleSubmitToHr = useCallback(() => setSubmitModalOpen(true), []);

  const { data: submitContext } = useQuery({
    queryKey: ["attendance-submit-context"],
    queryFn: getSubmitContext,
    enabled: submitModalOpen,
  });

  const { data: myQueriesData, refetch: refetchMyQueries, isError: myQueriesError } = useQuery({
    queryKey: ["my-queries"],
    queryFn: getMyQueries,
    enabled: !!checkBatch?.submittedAt,
  });
  const currentBatch = useMemo(() => {
    if (!checkBatch?.id || !myQueriesData?.batches) return undefined;
    return myQueriesData.batches.find((x) => x.id === checkBatch.id);
  }, [checkBatch?.id, myQueriesData?.batches]);
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
        const key = getKey(member.id, dateStr);
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

  const toDateKeyTeam = (dt: string | unknown): string => {
    const s = typeof dt === "string" ? dt : (dt as { value?: string })?.value ?? "";
    const d = new Date(s);
    if (isNaN(d.getTime())) return String(s).slice(0, 10);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  const isCheckLocked = !!checkBatch?.submittedAt;
  const isCheckLoading = createOrLoadMutation.isPending || attendanceQueries.some((q) => q.isLoading);

  const handleSearch = async () => {
    const q = searchInput.trim();
    setSearchMessage(null);
    if (!q) return;
    setSearching(true);
    try {
      const res = await apiGet<{ success: boolean; found: boolean; employee?: { id: string; cardNumber: string | null; firstName: string; lastName: string | null }; isUnderYou?: boolean }>(
        `/emp-manager/lookup?q=${encodeURIComponent(q)}`
      );
      if (!res.found) {
        setSearchMessage("not_found");
        return;
      }
      if (res.employee && res.isUnderYou === false) {
        setSearchMessage("not_under_you");
        return;
      }
      if (res.employee?.cardNumber) {
        setSelectedMember(res.employee.cardNumber);
        setSearchInput("");
      }
    } catch {
      setSearchMessage("not_found");
    } finally {
      setSearching(false);
    }
  };

  const recordsByDate = useMemo(() => {
    const map = new Map<string, AttendanceRecord>();
    const toDateKey = (dt: unknown) => (typeof dt === "string" ? dt : (dt as { value?: string })?.value ?? "").slice(0, 10);
    if (attendanceData?.records) {
      attendanceData.records.forEach((record) => {
        const key = toDateKey(record.dt);
        if (key) map.set(key, record);
      });
    }
    return map;
  }, [attendanceData?.records]);

  const calendarGrid = useMemo(() => {
    const firstDay = new Date(selectedYear, selectedMonth, 1);
    const lastDay = new Date(selectedYear, selectedMonth + 1, 0);
    const startDayOfWeek = firstDay.getDay();
    const totalDays = lastDay.getDate();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const cells: { day: number | null; record: AttendanceRecord | null; isFuture: boolean }[] = [];
    for (let i = 0; i < startDayOfWeek; i++) {
      cells.push({ day: null, record: null, isFuture: false });
    }
    for (let day = 1; day <= totalDays; day++) {
      const dateStr = `${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const cellDate = new Date(selectedYear, selectedMonth, day);
      const isFuture = cellDate > today;
      const record = recordsByDate.get(dateStr) ?? null;
      cells.push({ day, record, isFuture });
    }
    return cells;
  }, [selectedMonth, selectedYear, recordsByDate]);

  if (!canViewTeam) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Team Attendance</h1>
          <p className="text-muted-foreground">View your team's attendance records</p>
        </div>

        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="flex items-center gap-4 p-6">
            <AlertCircle className="h-8 w-8 text-amber-600" />
            <div>
              <h3 className="font-semibold text-amber-800">Access Denied</h3>
              <p className="text-amber-700 text-sm">
                You don't have permission to view team attendance. This feature is available for managers only.
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-indigo-500 flex items-center justify-center">
              <Users className="h-5 w-5 text-white" />
            </div>
            Team Attendance
          </h1>
          <p className="text-muted-foreground mt-1">
            View attendance records for your team members
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-border p-0.5">
            <Button
              variant={viewMode === "single" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setViewMode("single")}
              className="rounded-md"
            >
              <Calendar className="h-4 w-4 mr-2" />
              Single Member
            </Button>
            <Button
              variant={viewMode === "check" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => canVerify && setViewMode("check")}
              disabled={!canVerify}
              className={cn(
                "rounded-md",
                viewMode === "check" && "bg-amber-100 dark:bg-amber-900/30"
              )}
            >
              <List className="h-4 w-4 mr-2" />
              Check View
            </Button>
          </div>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refetchingTeam}>
            {refetchingTeam ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Refresh
          </Button>
        </div>
      </div>

      {viewMode === "check" && canVerify ? (
        <div className="space-y-6">
          {!checkBatch?.id && createOrLoadMutation.isPending ? (
            <Card>
              <CardContent className="py-12 flex items-center justify-center gap-2">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <span className="text-muted-foreground">Loading batch...</span>
              </CardContent>
            </Card>
          ) : checkBatch?.id ? (
            <>
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
                batch={checkBatch}
                isLocked={isCheckLocked}
                isLoading={isCheckLoading}
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
                  {isCheckLocked && checkBatch?.id && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => unsubmitMutation.mutate(checkBatch.id)}
                      disabled={unsubmitMutation.isPending}
                    >
                      {unsubmitMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Unlock className="h-4 w-4 mr-2" />}
                      Reopen
                    </Button>
                  )}
                </div>
              </div>
              {checkBatch?.submittedAt && (
              <VerificationListCard
                teamMembers={teamMembers}
                verificationMap={verificationMap}
                pendingSave={pendingSave}
                submittedTickets={currentBatchTickets ?? (submitSummary.notCorrectCount === 0 ? [] : undefined)}
                submittedBatchInfo={{ monthStart: monthDate, submittedAt: checkBatch.submittedAt }}
                verifierName={verifierName}
                onDismiss={() => void refetchMyQueries()}
                onDelete={() => deleteMutation.mutate(checkBatch!.id)}
                submittedTicketsError={myQueriesError}
                onRetry={() => void refetchMyQueries()}
                onClear={async () => {
                  if (!checkBatch?.id || checkBatch.submittedAt) return;
                  try {
                    await clearVerifications(checkBatch.id);
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
            </>
          ) : null}
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
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setSubmitModalOpen(false)}>Cancel</Button>
                <Button onClick={() => doSubmit()} disabled={submitMutation.isPending}>
                  {submitMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      ) : (
      <>
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-slate-800">{teamMembers.length}</div>
            <div className="text-sm text-slate-500">Team Members</div>
          </CardContent>
        </Card>
        {selectedMember !== "all" &&
          attendanceData?.records &&
          (() => {
            const summary = calculateSummary(attendanceData.records);
            const totalAbsent = summary.absent + summary.doubleAbsent;
            return (
              <>
                <Card className="border-border bg-muted/50">
                  <CardContent className="p-3 text-center pt-6">
                    <div className="text-2xl font-bold text-foreground">{summary.total}</div>
                    <div className="text-xs text-muted-foreground">Total Task</div>
                  </CardContent>
                </Card>
                <Card className="border-emerald-500/20 bg-emerald-500/10">
                  <CardContent className="p-3 text-center pt-6">
                    <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{summary.present}</div>
                    <div className="text-xs text-emerald-600/80 dark:text-emerald-400/80">Completed</div>
                  </CardContent>
                </Card>
                <Card className="border-rose-500/20 bg-rose-500/10">
                  <CardContent className="p-3 text-center pt-6">
                    <div className="text-2xl font-bold text-rose-600 dark:text-rose-400">{totalAbsent}</div>
                    <div className="text-xs text-rose-600/80 dark:text-rose-400/80">Not Completed</div>
                  </CardContent>
                </Card>
                <Card className="border-amber-500/20 bg-amber-500/10">
                  <CardContent className="p-3 text-center pt-6">
                    <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">{summary.halfDay}</div>
                    <div className="text-xs text-amber-600/80 dark:text-amber-400/80">Half Completed</div>
                  </CardContent>
                </Card>
              </>
            );
          })()}
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Select Team Member</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px] relative">
              <Label className="text-sm text-muted-foreground">Search by Card No or Name</Label>
              <div className="flex gap-2 mt-1">
                <div className="flex-1 relative">
                  <Input
                    placeholder="Enter card no or name, or click to see members..."
                    value={searchInput}
                    onChange={(e) => {
                      setSearchInput(e.target.value);
                      setSearchMessage(null);
                    }}
                    onFocus={() => setMembersListOpen(true)}
                    onBlur={() => setTimeout(() => setMembersListOpen(false), 200)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    disabled={searching}
                    className="w-full"
                  />
                  {membersListOpen && teamMembers.length > 0 && (() => {
                    const q = searchInput.toLowerCase().trim();
                    const filtered = q
                      ? teamMembers.filter((m) => {
                          const fullName = `${m.firstName} ${m.lastName || ""}`.toLowerCase();
                          return fullName.includes(q) || (m.cardNumber || "").toLowerCase().includes(q);
                        })
                      : teamMembers;
                    if (filtered.length === 0) return null;
                    return (
                      <div
                        className="absolute top-full left-0 right-0 mt-1 z-50 rounded-md border bg-popover text-popover-foreground shadow-md max-h-[min(20rem,70vh)] overflow-y-auto"
                        onMouseDown={(e) => e.preventDefault()}
                      >
                        <div className="p-2 text-xs text-muted-foreground border-b">
                          {q ? `${filtered.length} match${filtered.length !== 1 ? "es" : ""}` : "Your team members"}
                        </div>
                        {filtered.map((member) => (
                          <button
                            key={member.id}
                            type="button"
                            className="w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground rounded-sm flex items-center justify-between"
                            onMouseDown={() => {
                              setSelectedMember(member.cardNumber || member.id);
                              setSearchInput("");
                              setSearchMessage(null);
                              setMembersListOpen(false);
                            }}
                          >
                            <span>{member.firstName} {member.lastName || ""}</span>
                            <span className="text-muted-foreground font-mono text-xs">{member.cardNumber || "—"}</span>
                          </button>
                        ))}
                      </div>
                    );
                  })()}
                </div>
                <Button type="button" onClick={handleSearch} disabled={searching || !searchInput.trim()}>
                  {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>
          {searchMessage === "not_under_you" && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <p className="text-sm font-medium">The person is not under you.</p>
            </div>
          )}
          {searchMessage === "not_found" && (
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-slate-700">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <p className="text-sm">No employee found with that card no or name.</p>
            </div>
          )}
          <div className="flex flex-wrap gap-4">
            <div>
              <Label className="text-sm text-muted-foreground">Month</Label>
              <Select
                value={`${selectedYear}-${selectedMonth}`}
                onValueChange={(v) => {
                  const [y, m] = v.split("-").map(Number);
                  setSelectedYear(y);
                  setSelectedMonth(m);
                }}
              >
                <SelectTrigger className="w-36 mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={`${prevYear}-${prevMonth}`}>
                    {MONTHS[prevMonth]} {prevYear}
                  </SelectItem>
                  <SelectItem value={`${currYear}-${currMonth}`}>
                    {MONTHS[currMonth]} {currYear}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Member info bar when a member is selected */}
      {selectedMember !== "all" && attendanceData?.records?.[0] && (
        <Card className="border-border bg-card shadow-sm">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-x-8 gap-y-2 text-sm">
              <div>
                <span className="text-muted-foreground">Member:</span>
                <span className="ml-2 font-medium text-foreground">{encodeName(attendanceData.records[0].Name)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Card No:</span>
                <span className="ml-2 font-medium text-foreground">{attendanceData.records[0].card_no}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Attendance Data - Calendar View */}
      {selectedMember === "all" ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-lg font-medium text-muted-foreground">Select a Team Member</p>
            <p className="text-sm text-muted-foreground mt-1">
              Search by card no or name above to view their attendance calendar
            </p>
          </CardContent>
        </Card>
      ) : loadingAttendance ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Loader2 className="h-8 w-8 mx-auto animate-spin text-indigo-500" />
            <p className="text-muted-foreground mt-4">Loading attendance...</p>
          </CardContent>
        </Card>
      ) : attendanceData?.records && attendanceData.records.length > 0 ? (
        <Card className="border-border bg-card shadow-sm">
          <CardHeader className="pb-4 px-4 sm:px-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <CardTitle className="text-base font-medium flex items-center gap-2 text-foreground">
                <Calendar className="h-4 w-4" /> Calendar View
              </CardTitle>
              <div className="flex items-center justify-between sm:justify-end gap-2">
                <Button variant="outline" size="icon" onClick={handlePrevMonth} disabled={isMinDate} className="h-8 w-8">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="font-medium text-foreground min-w-[120px] text-center text-sm">
                  {MONTHS[selectedMonth]} {selectedYear}
                </span>
                <Button variant="outline" size="icon" onClick={handleNextMonth} disabled={isMaxDate} className="h-8 w-8">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-2 sm:px-6">
            <div className="grid grid-cols-7 gap-1">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                <div key={day} className="text-center text-xs font-semibold text-muted-foreground py-2 uppercase tracking-tighter">
                  {day}
                </div>
              ))}
              {calendarGrid.map((cell, index) => {
                if (cell.day === null) {
                  return <div key={index} className="aspect-square sm:h-14" />;
                }
                if (cell.isFuture) {
                  return (
                    <div key={index} className="aspect-square sm:h-14 border border-border/50 rounded-lg flex items-center justify-center bg-muted opacity-30">
                      <span className="text-sm sm:text-base font-semibold text-muted-foreground">{cell.day}</span>
                    </div>
                  );
                }
                if (!cell.record) {
                  return (
                    <div key={index} className="aspect-square sm:h-14 border border-border/50 rounded-lg flex items-center justify-center bg-muted/20">
                      <span className="text-sm sm:text-base font-semibold text-muted-foreground">{cell.day}</span>
                    </div>
                  );
                }
                const style = getStatusStyle(cell.record.STATUS);
                const isMuted = style.bgColor.includes("var(--muted)");
                return (
                  <div
                    key={index}
                    className="aspect-square sm:h-14 border border-border/50 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:shadow-md hover:scale-[1.02] transition-all relative overflow-hidden"
                    style={{ backgroundColor: style.bgColor }}
                    onClick={() => {
                      setSelectedRecord(cell.record);
                      setDetailsOpen(true);
                    }}
                  >
                    <span className={`text-sm sm:text-base font-bold ${isMuted ? "text-foreground" : "text-white shadow-sm"}`}>
                      {cell.day}
                    </span>
                    {style.dots.length > 0 && (
                      <div className="absolute bottom-1 left-0 right-0 flex justify-center gap-0.5 px-0.5">
                        {style.dots.flatMap((dot, dotIndex) =>
                          Array.from({ length: dot.count }, (_, i) => (
                            <div
                              key={`${dotIndex}-${i}`}
                              className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ring-1 ring-black/5"
                              style={{ backgroundColor: dot.color }}
                            />
                          ))
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="mt-8 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 text-[10px] sm:text-xs border-t border-border pt-6">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded shadow-sm flex items-center justify-center" style={{ backgroundColor: "#10b981" }}>
                  <span className="text-white text-[8px] font-bold">1</span>
                </div>
                <span className="text-muted-foreground">Completed</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded shadow-sm relative flex items-center justify-center" style={{ backgroundColor: "#10b981" }}>
                  <span className="text-white text-[8px] font-bold">1</span>
                  <div className="absolute bottom-0 w-1 h-1 rounded-full bg-white" />
                </div>
                <span className="text-muted-foreground">Late</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded shadow-sm relative flex items-center justify-center" style={{ backgroundColor: "#10b981" }}>
                  <span className="text-white text-[8px] font-bold">1</span>
                  <div className="absolute bottom-0 w-1 h-1 rounded-full bg-blue-500" />
                </div>
                <span className="text-muted-foreground">Early</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded shadow-sm flex items-center justify-center" style={{ backgroundColor: "#ef4444" }}>
                  <span className="text-white text-[8px] font-bold">1</span>
                </div>
                <span className="text-muted-foreground">Not Comp.</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded shadow-sm relative flex items-center justify-center" style={{ backgroundColor: "#ef4444" }}>
                  <span className="text-white text-[8px] font-bold">1</span>
                  <div className="absolute bottom-0 flex gap-0.5">
                    <div className="w-1 h-1 rounded-full bg-black" />
                    <div className="w-1 h-1 rounded-full bg-black" />
                  </div>
                </div>
                <span className="text-muted-foreground">Dbl Not Comp.</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded shadow-sm flex items-center justify-center" style={{ backgroundColor: "#eab308" }}>
                  <span className="text-white text-[8px] font-bold">1</span>
                </div>
                <span className="text-muted-foreground">Half Comp.</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded shadow-sm relative flex items-center justify-center" style={{ backgroundColor: "#f97316" }}>
                  <span className="text-white text-[8px] font-bold">1</span>
                  <div className="absolute bottom-0 w-1 h-1 rounded-full bg-blue-500" />
                </div>
                <span className="text-muted-foreground">Miss</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded shadow-sm relative flex items-center justify-center bg-white border border-border">
                  <span className="text-slate-900 text-[8px] font-bold">1</span>
                  <div className="absolute bottom-0 w-1 h-1 rounded-full bg-slate-400" />
                </div>
                <span className="text-muted-foreground">Miss Pend.</span>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="h-12 w-12 mx-auto mb-4 text-amber-500" />
            <p className="text-lg font-medium">No Attendance Data</p>
            <p className="text-sm text-muted-foreground mt-1">
              No attendance records found for {MONTHS[selectedMonth]} {selectedYear}
            </p>
          </CardContent>
        </Card>
      )}

      </>
      )}

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Attendance Details</DialogTitle>
            <DialogDescription>View details for this day.</DialogDescription>
          </DialogHeader>
          {selectedRecord && (
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Date:</span>
                <div className="font-medium text-foreground">{selectedRecord.dt}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Status:</span>
                <div>
                  <Badge style={{ backgroundColor: getStatusColor(selectedRecord.STATUS) }} className="text-white border-none">
                    {getStatusLabel(selectedRecord.STATUS)}
                  </Badge>
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">In Time:</span>
                <div className="font-medium font-mono text-foreground">
                  {selectedRecord.t_in || selectedRecord.result_t_in || "--:--"}
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">Out Time:</span>
                <div className="font-medium font-mono text-foreground">
                  {selectedRecord.t_out || selectedRecord.result_t_out || "--:--"}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
