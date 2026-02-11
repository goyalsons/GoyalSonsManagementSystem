import { useState, useMemo, useCallback, useEffect, memo } from "react";
import { useQuery, useQueries, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Loader2,
  CheckCircle2,
  XCircle,
  Filter,
  Download,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth-context";
import { apiGet, apiPost } from "@/lib/api";
import { encodeName } from "@/lib/utils";
import * as XLSX from "xlsx-js-style";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const YEARS = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);
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
  summary: { present: number; absent: number; halfDay: number; leave: number; total: number };
}

interface TeamMember {
  id: string;
  cardNumber: string | null;
  firstName: string;
  lastName: string | null;
  designation?: { name: string } | null;
  department?: { name: string } | null;
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
  if (s === "PRESENT LATE EARLY_OUT" || s === "PRESENT L")
    return { bgColor: "#10b981", dots: [{ color: "#ffffff", count: 1 }, { color: "#3b82f6", count: 1 }] };
  if (s === "HALFDAY" || s === "HALF DAY") return { bgColor: "#eab308", dots: [] };
  if (s === "MISS OUT" || s === "MISS IN") return { bgColor: "#f97316", dots: [{ color: "#3b82f6", count: 1 }] };
  if (s === "MISS PENDING" || s === "MISS PEND") return { bgColor: "var(--muted)", dots: [{ color: "#9ca3af", count: 1 }] };
  if (s === "LEAVE") return { bgColor: "#3b82f6", dots: [] };
  if (s === "WEEKLY OFF" || s === "WO") return { bgColor: "#a855f7", dots: [] };
  if (s.includes("PRESENT")) return { bgColor: "#10b981", dots: [] };
  if (s.includes("ABSENT")) return { bgColor: "#ef4444", dots: [] };
  if (s.includes("MISS")) return { bgColor: "#f97316", dots: [] };
  if (s.includes("HALF")) return { bgColor: "#eab308", dots: [] };
  return { bgColor: "var(--muted)", dots: [] };
}

const CalendarRow = memo(function CalendarRow({
  cells,
  onCellClick,
}: {
  cells: { day: number | null; record: AttendanceRecord | null; isFuture: boolean }[];
  onCellClick?: (r: AttendanceRecord | null) => void;
}) {
  return (
    <div className="flex shrink-0">
      {cells.map((cell, idx) => {
        if (cell.day === null) {
          return <div key={idx} className="w-10 min-w-[40px] sm:min-w-[48px] sm:h-14 flex-shrink-0" />;
        }
        if (cell.isFuture) {
          return (
            <div
              key={idx}
              className="w-10 min-w-[40px] sm:min-w-[48px] sm:h-14 border border-border/50 rounded flex items-center justify-center bg-muted/30 flex-shrink-0"
            >
              <span className="text-xs sm:text-sm font-semibold text-muted-foreground">{cell.day}</span>
            </div>
          );
        }
        if (!cell.record) {
          return (
            <div
              key={idx}
              className="w-10 min-w-[40px] sm:min-w-[48px] sm:h-14 border border-border/50 rounded flex items-center justify-center bg-muted/20 flex-shrink-0"
            >
              <span className="text-xs sm:text-sm font-semibold text-muted-foreground">{cell.day}</span>
            </div>
          );
        }
        const style = getStatusStyle(cell.record.STATUS);
        const isMuted = style.bgColor.includes("var(--muted)");
        return (
          <div
            key={idx}
            className="w-10 min-w-[40px] sm:min-w-[48px] sm:h-14 border border-border/50 rounded flex flex-col items-center justify-center cursor-pointer hover:shadow transition-all flex-shrink-0"
            style={{ backgroundColor: style.bgColor }}
            onClick={() => onCellClick?.(cell.record)}
          >
            <span className={`text-xs sm:text-sm font-bold ${isMuted ? "text-foreground" : "text-white"}`}>
              {cell.day}
            </span>
          </div>
        );
      })}
    </div>
  );
});

export function TeamAttendanceCheckView() {
  const { hasPolicy } = useAuth();
  const canExport = hasPolicy("attendance.team.export");
  const queryClient = useQueryClient();
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [verificationMap, setVerificationMap] = useState<
    Record<string, { status: "CORRECT" | "NOT_CORRECT"; query?: string }>
  >({});
  const [pendingSave, setPendingSave] = useState<
    Record<string, { status: "CORRECT" | "NOT_CORRECT"; query?: string }>
  >({});
  const [saving, setSaving] = useState(false);
  const [listFilter, setListFilter] = useState<"all" | "correct" | "not_correct">("all");
  const [queryPopoverOpen, setQueryPopoverOpen] = useState<string | null>(null);
  const [queryDraft, setQueryDraft] = useState("");
  const [bulkNotCorrectOpen, setBulkNotCorrectOpen] = useState(false);
  const [bulkQueryDraft, setBulkQueryDraft] = useState("");

  const monthDate = useMemo(() => {
    const m = String(selectedMonth + 1).padStart(2, "0");
    return `${selectedYear}-${m}-01`;
  }, [selectedMonth, selectedYear]);

  const { from: fromStr, to: toStr } = useMemo(() => {
    const d = new Date(selectedYear, selectedMonth, 1);
    const last = new Date(selectedYear, selectedMonth + 1, 0);
    return {
      from: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
      to: `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}`,
    };
  }, [selectedMonth, selectedYear]);

  const { data: teamResponse } = useQuery({
    queryKey: ["my-team-members"],
    queryFn: () => apiGet<{ success: boolean; data: TeamMember[] }>("/emp-manager/my-team"),
  });

  const teamMembers: TeamMember[] = teamResponse?.data || [];

  const { data: verificationsData } = useQuery({
    queryKey: ["team-verifications", fromStr, toStr],
    queryFn: () =>
      apiGet<{
        verifications: Record<string, { status: "CORRECT" | "NOT_CORRECT"; query?: string | null }>;
      }>(`/attendance/team-verifications?from=${fromStr}&to=${toStr}`),
  });

  useEffect(() => {
    if (verificationsData?.verifications) {
      const mapped: Record<string, { status: "CORRECT" | "NOT_CORRECT"; query?: string }> = {};
      for (const [k, v] of Object.entries(verificationsData.verifications)) {
        const val = v as { status: "CORRECT" | "NOT_CORRECT"; query?: string | null };
        mapped[k] = {
          status: val.status,
          query: val.query ?? undefined,
        };
      }
      setVerificationMap(mapped);
    }
  }, [verificationsData]);

  const attendanceResults = useQueries({
    queries: teamMembers.map((m) => ({
      queryKey: ["team-attendance", m.cardNumber || m.id, monthDate],
      queryFn: () =>
        apiGet<AttendanceResponse>(`/attendance/history/${m.cardNumber || m.id}?month=${monthDate}`),
      enabled: !!m.cardNumber,
    })),
  });

  const memberAttendanceMap = useMemo(() => {
    const map = new Map<string, AttendanceResponse>();
    teamMembers.forEach((member, i) => {
      const data = attendanceResults[i]?.data;
      if (data?.records) {
        map.set(member.id, data);
      }
    });
    return map;
  }, [teamMembers, attendanceResults]);

  const isLoading = attendanceResults.some((q) => q.isLoading);

  const minDate = new Date(2025, 9, 1);
  const isMinDate = useMemo(() => {
    const prev = new Date(selectedYear, selectedMonth === 0 ? 11 : selectedMonth - 1, 1);
    return prev < minDate;
  }, [selectedMonth, selectedYear]);

  const handlePrevMonth = () => {
    if (isMinDate) return;
    setSelectedMonth((m) => (m === 0 ? 11 : m - 1));
    if (selectedMonth === 0) setSelectedYear((y) => y - 1);
  };

  const handleNextMonth = () => {
    setSelectedMonth((m) => (m === 11 ? 0 : m + 1));
    if (selectedMonth === 11) setSelectedYear((y) => y + 1);
  };

  const getVerificationKey = (employeeId: string) => `${employeeId}_${monthDate}`;

  const getStatus = (employeeId: string): "CORRECT" | "NOT_CORRECT" | null => {
    const key = getVerificationKey(employeeId);
    const v = pendingSave[key] ?? verificationMap[key];
    return v?.status ?? null;
  };

  const getQuery = (employeeId: string): string => {
    const key = getVerificationKey(employeeId);
    const v = pendingSave[key] ?? verificationMap[key];
    return v?.query ?? "";
  };

  const setStatus = useCallback((employeeId: string, status: "CORRECT" | "NOT_CORRECT" | null) => {
    const key = getVerificationKey(employeeId);
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
      const entry: { status: "CORRECT" | "NOT_CORRECT"; query?: string } =
        status === "NOT_CORRECT" ? { status, query: "" } : { status };
      setVerificationMap((prev) => ({ ...prev, [key]: entry }));
      setPendingSave((prev) => ({ ...prev, [key]: entry }));
    }
  }, [monthDate]);

  const setStatusWithQuery = useCallback(
    (employeeId: string, status: "NOT_CORRECT", query: string) => {
      const key = getVerificationKey(employeeId);
      const entry = { status, query: query.trim() || undefined };
      setVerificationMap((prev) => ({ ...prev, [key]: entry }));
      setPendingSave((prev) => ({ ...prev, [key]: entry }));
      setQueryPopoverOpen(null);
      setQueryDraft("");
    },
    [monthDate]
  );

  const savePending = useCallback(async () => {
    const keys = Object.keys(pendingSave);
    if (keys.length === 0) return;
    setSaving(true);
    try {
      const updates = keys.map((key) => {
        const idx = key.lastIndexOf("_");
        const employeeId = idx >= 0 ? key.slice(0, idx) : key;
        const date = idx >= 0 ? key.slice(idx + 1) : monthDate;
        const v = pendingSave[key];
        return {
          employeeId,
          date,
          status: v.status,
          query: v.query ?? null,
        };
      });
      await apiPost("/attendance/team-verifications", { updates });
      setPendingSave({});
      await queryClient.invalidateQueries({ queryKey: ["team-verifications", fromStr, toStr] });
    } catch (e) {
      console.error("Failed to save verifications:", e);
    } finally {
      setSaving(false);
    }
  }, [pendingSave, fromStr, toStr, queryClient]);

  useEffect(() => {
    const t = setTimeout(savePending, 500);
    return () => clearTimeout(t);
  }, [pendingSave]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === teamMembers.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(teamMembers.map((m) => m.id)));
    }
  };

  const bulkSetStatus = (status: "CORRECT" | "NOT_CORRECT", query?: string) => {
    if (status === "NOT_CORRECT" && query != null) {
      selectedIds.forEach((id) => setStatusWithQuery(id, "NOT_CORRECT", query));
    } else {
      selectedIds.forEach((id) => setStatus(id, status));
    }
  };

  const handleBulkNotCorrectConfirm = () => {
    bulkSetStatus("NOT_CORRECT", bulkQueryDraft);
    setBulkNotCorrectOpen(false);
    setBulkQueryDraft("");
  };

  const handleNotCorrectClick = (memberId: string) => {
    const current = getStatus(memberId);
    if (current === "NOT_CORRECT") {
      setStatus(memberId, null);
      return;
    }
    setQueryPopoverOpen(memberId);
    setQueryDraft(getQuery(memberId));
  };

  const handleQueryConfirm = (memberId: string) => {
    setStatusWithQuery(memberId, "NOT_CORRECT", queryDraft);
  };

  const listItems = useMemo(() => {
    let items = teamMembers
      .map((m) => ({
        member: m,
        status: getStatus(m.id),
        query: getQuery(m.id),
      }))
      .filter((x) => x.status != null);
    if (listFilter === "correct") items = items.filter((x) => x.status === "CORRECT");
    if (listFilter === "not_correct") items = items.filter((x) => x.status === "NOT_CORRECT");
    return items;
  }, [teamMembers, verificationMap, pendingSave, listFilter, monthDate]);

  const handleExportXlsx = useCallback(() => {
    const dateLabel = `${MONTHS[selectedMonth]} ${selectedYear}`;
    const headers = ["Card No", "Name", "Correct/Not Correct", "Query"];
    const rows = listItems.map(({ member, status, query }) => [
      member.cardNumber || "—",
      `${member.firstName || ""} ${member.lastName || ""}`.trim() || "—",
      status === "CORRECT" ? "Correct" : "Not Correct",
      status === "NOT_CORRECT" ? (query || "") : "",
    ]);
    const wsData = [["Date", dateLabel, "", ""], [], headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
    for (let r = 3; r <= range.e.r; r++) {
      const addr = XLSX.utils.encode_cell({ r, c: 2 });
      const cell = ws[addr];
      if (cell?.v === "Correct") {
        cell.s = { fill: { fgColor: { rgb: "10B981" }, patternType: "solid" }, font: { color: { rgb: "FFFFFF" } } };
      } else if (cell?.v === "Not Correct") {
        cell.s = { fill: { fgColor: { rgb: "EF4444" }, patternType: "solid" }, font: { color: { rgb: "FFFFFF" } } };
      }
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Attendance Check");
    XLSX.writeFile(wb, `attendance-check-${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}.xlsx`);
  }, [listItems, selectedMonth, selectedYear]);

  const calendarGridCells = useMemo(() => {
    const firstDay = new Date(selectedYear, selectedMonth, 1);
    const lastDay = new Date(selectedYear, selectedMonth + 1, 0);
    const startDayOfWeek = firstDay.getDay();
    const totalDays = lastDay.getDate();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const cells: { day: number | null; isFuture: boolean }[] = [];
    for (let i = 0; i < startDayOfWeek; i++) cells.push({ day: null, isFuture: false });
    for (let day = 1; day <= totalDays; day++) {
      const cellDate = new Date(selectedYear, selectedMonth, day);
      cells.push({ day, isFuture: cellDate > today });
    }
    return cells;
  }, [selectedMonth, selectedYear]);

  const getRecordsByDate = (records: AttendanceRecord[]) => {
    const map = new Map<string, AttendanceRecord>();
    records.forEach((r) => {
      const dt = typeof r.dt === "object" && r.dt && "value" in r ? (r.dt as { value: string }).value : String(r.dt ?? "");
      map.set(dt, r);
    });
    return map;
  };

  const getMemberCells = (member: TeamMember) => {
    const data = memberAttendanceMap.get(member.id);
    const recordsByDate = data ? getRecordsByDate(data.records) : new Map();
    return calendarGridCells.map((c) => {
      if (c.day === null) return { day: null, record: null, isFuture: false };
      const dateStr = `${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}-${String(c.day).padStart(2, "0")}`;
      return {
        day: c.day,
        record: recordsByDate.get(dateStr) ?? null,
        isFuture: c.isFuture,
      };
    });
  };

  const renderMobileEmployeeBlock = (member: TeamMember) => {
    const status = getStatus(member.id);
    const name = `${member.firstName || ""} ${member.lastName || ""}`.trim() || "—";
    return (
      <AccordionItem key={member.id} value={member.id} className="border-b">
        <AccordionTrigger className="py-3 px-4 hover:no-underline [&>svg]:shrink-0">
          <div className="flex items-center gap-2 w-full text-left">
            <Checkbox
              checked={selectedIds.has(member.id)}
              onCheckedChange={() => toggleSelect(member.id)}
              onClick={(e) => e.stopPropagation()}
              className="shrink-0"
            />
            <div
              className={`w-1 h-6 rounded shrink-0 ${
                status === "CORRECT" ? "bg-emerald-500" : status === "NOT_CORRECT" ? "bg-rose-500" : "bg-transparent"
              }`}
            />
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm truncate">{encodeName(name)}</div>
              <div className="text-xs text-muted-foreground font-mono">{member.cardNumber || "—"}</div>
            </div>
            <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
              <Button
                size="sm"
                variant={status === "CORRECT" ? "default" : "outline"}
                className="min-h-[40px] min-w-[40px] p-1"
                onClick={() => setStatus(member.id, status === "CORRECT" ? null : "CORRECT")}
              >
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              </Button>
              <Popover
                open={queryPopoverOpen === member.id}
                onOpenChange={(open) => {
                  if (!open) {
                    setQueryPopoverOpen(null);
                    setQueryDraft("");
                  } else if (status !== "NOT_CORRECT") {
                    setQueryPopoverOpen(member.id);
                    setQueryDraft("");
                  }
                }}
              >
                <PopoverTrigger asChild>
                  <Button
                    size="sm"
                    variant={status === "NOT_CORRECT" ? "destructive" : "outline"}
                    className="min-h-[40px] min-w-[40px] p-1"
                    onClick={() => handleNotCorrectClick(member.id)}
                  >
                    <XCircle className="h-4 w-4 text-rose-600" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80" align="end" side="left">
                  <div className="space-y-3">
                    <p className="text-sm font-medium">Reason (Query)</p>
                    <Textarea
                      placeholder="Kya problem hai? Reason likhein..."
                      value={queryPopoverOpen === member.id ? queryDraft : ""}
                      onChange={(e) => setQueryDraft(e.target.value)}
                      rows={3}
                      className="resize-none"
                    />
                    <Button
                      size="sm"
                      className="w-full"
                      onClick={() => handleQueryConfirm(member.id)}
                    >
                      Save
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </AccordionTrigger>
        <AccordionContent>
          <div className="overflow-x-auto px-4 pb-4">
            <div className="flex flex-col gap-1 min-w-max">
              <div className="flex gap-1">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                  <div key={d} className="text-center text-xs font-semibold text-muted-foreground py-1 w-10 flex-shrink-0">
                    {d}
                  </div>
                ))}
              </div>
              <CalendarRow cells={getMemberCells(member)} />
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>
    );
  };

  if (teamMembers.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">No team members found.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Team Attendance Check View
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="icon" onClick={handlePrevMonth} disabled={isMinDate} className="h-10 w-10">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="font-medium min-w-[140px] text-center">{MONTHS[selectedMonth]} {selectedYear}</span>
            <Button variant="outline" size="icon" onClick={handleNextMonth} className="h-10 w-10">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="sticky top-0 z-10 bg-background py-2 flex flex-wrap gap-2 border-b mb-2">
          <div className="flex items-center gap-2">
            <Checkbox
              checked={selectedIds.size === teamMembers.length && teamMembers.length > 0}
              onCheckedChange={selectAll}
            />
            <span className="text-sm">Select All</span>
          </div>
          <Button size="sm" onClick={() => bulkSetStatus("CORRECT")} disabled={selectedIds.size === 0} className="min-h-[40px]">
            <CheckCircle2 className="h-4 w-4 mr-1" /> Correct
          </Button>
          <Popover open={bulkNotCorrectOpen} onOpenChange={setBulkNotCorrectOpen}>
            <PopoverTrigger asChild>
              <Button
                size="sm"
                variant="destructive"
                disabled={selectedIds.size === 0}
                className="min-h-[40px]"
              >
                <XCircle className="h-4 w-4 mr-1" /> Not Correct
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="end">
              <div className="space-y-3">
                <p className="text-sm font-medium">Reason (Query) for selected employees</p>
                <Textarea
                  placeholder="Kya problem hai? Reason likhein..."
                  value={bulkQueryDraft}
                  onChange={(e) => setBulkQueryDraft(e.target.value)}
                  rows={3}
                  className="resize-none"
                />
                <Button size="sm" className="w-full" onClick={handleBulkNotCorrectConfirm}>
                  Save
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
        <Accordion type="multiple" className="w-full">
          {teamMembers.map(renderMobileEmployeeBlock)}
        </Accordion>
        {saving && (
          <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Saving...
          </div>
        )}

        <div className="mt-8 border rounded-lg">
          <div className="flex items-center justify-between gap-2 px-3 py-2 border-b bg-muted/50">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Verification List</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8">
                    <Filter className="h-4 w-4 mr-1" />
                    Filters
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onClick={() => setListFilter("all")}>
                    All
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setListFilter("correct")}>
                    Correct only
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setListFilter("not_correct")}>
                    Not Correct only
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            {canExport && (
              <Button variant="outline" size="sm" onClick={handleExportXlsx} className="h-8">
                <Download className="h-4 w-4 mr-1" />
                Export .xlsx
              </Button>
            )}
          </div>
          <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left px-3 py-2 font-medium">Card No</th>
                  <th className="text-left px-3 py-2 font-medium">Name</th>
                  <th className="text-left px-3 py-2 font-medium">Correct/Not Correct</th>
                  <th className="text-left px-3 py-2 font-medium">Query</th>
                </tr>
              </thead>
              <tbody>
                {listItems.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                      No verified records. Mark employees as Correct or Not Correct above.
                    </td>
                  </tr>
                ) : (
                  listItems.map(({ member, status, query }) => (
                    <tr key={member.id} className="border-b">
                      <td className="px-3 py-2 font-mono text-xs">{member.cardNumber || "—"}</td>
                      <td className="px-3 py-2">{encodeName(`${member.firstName || ""} ${member.lastName || ""}`.trim() || "—")}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${
                            status === "CORRECT" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                          }`}
                        >
                          {status === "CORRECT" ? "Correct" : "Not Correct"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {status === "NOT_CORRECT" ? (query || "—") : "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
