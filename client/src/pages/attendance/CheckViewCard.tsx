/**
 * Team Attendance Check View – two-panel layout.
 * Left: member list (checkbox tick = select + auto-collapse).
 * Right: attendance dates for selected member; date click = one popup (Correct / Not Correct).
 * No buttons under date cells. NOT_CORRECT dates show black border.
 */
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { Calendar, Loader2, CheckCircle2, XCircle, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { encodeName, cn } from "@/lib/utils";
import type { TeamMember, AttendanceRecord, AttendanceResponse, VerificationStatus } from "@/api/attendanceVerification.types";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface StatusStyle {
  bgColor: string;
  dots: { color: string; count: number }[];
}

type AttendanceRecordWithBranch = AttendanceRecord & {
  branch_code?: string | null;
  entry_type?: string | null;
};

function parseWeeklyOffDays(weeklyOff: string | null | undefined): Set<number> {
  const out = new Set<number>();
  if (!weeklyOff) return out;
  const text = weeklyOff.toUpperCase();
  const map: Record<string, number> = {
    SUN: 0, SUNDAY: 0,
    MON: 1, MONDAY: 1,
    TUE: 2, TUESDAY: 2,
    WED: 3, WEDNESDAY: 3,
    THU: 4, THURSDAY: 4,
    FRI: 5, FRIDAY: 5,
    SAT: 6, SATURDAY: 6,
  };
  const tokens = text.split(/[^A-Z0-9]+/).filter(Boolean);
  for (const t of tokens) {
    if (Object.prototype.hasOwnProperty.call(map, t)) out.add(map[t]);
    else if (/^[0-6]$/.test(t)) out.add(Number(t));
  }
  return out;
}

function isWeeklyOffDay(
  dateLike: string | null | undefined,
  weeklyOff: string | null | undefined,
): boolean {
  if (!dateLike) return false;
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return false;
  const offDays = parseWeeklyOffDays(weeklyOff);
  if (offDays.size === 0) return false;
  return offDays.has(d.getDay());
}

function getBaseStatusBgColor(status: string): string {
  const s = (status || "").toUpperCase().trim();
  if (s === "DOUBLE ABSENT" || s === "DOUBLE A" || s.includes("DOUBLE")) return "#ef4444";
  if (s === "ABSENT") return "#ef4444";
  if (s.includes("PRESENT")) return "#10b981";
  if (s === "HALFDAY" || s === "HALF DAY" || s.includes("HALF")) return "#eab308";
  if (s.includes("MISS")) return "#f97316";
  if (s === "LEAVE") return "#3b82f6";
  if (s === "WEEKLY OFF" || s === "WO") return "#a855f7";
  return "var(--muted)";
}

function getStatusStyle(status: string, dateLike?: string | null, weeklyOff?: string | null): StatusStyle {
  if (isWeeklyOffDay(dateLike || null, weeklyOff || null)) {
    const purple = "#a855f7";
    const other = getBaseStatusBgColor(status);
    return { bgColor: `linear-gradient(90deg, ${purple} 0 50%, ${other} 50% 100%)`, dots: [] };
  }
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

export interface CheckViewCardProps {
  teamMembers: TeamMember[];
  selectedMonth: number;
  selectedYear: number;
  isMinDate: boolean;
  isMaxDate: boolean;
  handlePrevMonth: () => void;
  handleNextMonth: () => void;
  memberAttendanceMap: Map<string, AttendanceResponse>;
  expandedMemberIds: Set<string>;
  selectedCheckMemberIds: Set<string>;
  toggleExpand: (id: string) => void;
  toggleSelectMember: (id: string) => void;
  getStatus: (employeeId: string, dateStr: string) => VerificationStatus | null;
  getQuery: (employeeId: string, dateStr: string) => string;
  setStatus: (employeeId: string, dateStr: string, status: VerificationStatus | null, query?: string) => void;
  batch: { id: string; submittedAt?: string | null } | null;
  isLocked: boolean;
  isLoading: boolean;
  savePending: () => void;
  pendingSave: Record<string, { status: VerificationStatus; query?: string }>;
  weeklyOffByCard: Record<string, string | null>;
}

export function CheckViewCard(props: CheckViewCardProps) {
  const { toast } = useToast();
  const [notCorrectModal, setNotCorrectModal] = useState<{ memberId: string; dateStr: string } | null>(null);
  const [queryDraft, setQueryDraft] = useState("");
  const [dateMenuKey, setDateMenuKey] = useState<string | null>(null);
  const {
    teamMembers,
    selectedMonth,
    selectedYear,
    isMinDate,
    isMaxDate,
    handlePrevMonth,
    handleNextMonth,
    memberAttendanceMap,
    expandedMemberIds,
    selectedCheckMemberIds,
    toggleExpand,
    toggleSelectMember,
    getStatus,
    getQuery,
    setStatus,
    batch,
    isLocked,
    isLoading,
    savePending,
    pendingSave,
    weeklyOffByCard,
  } = props;

  const viewMemberId = teamMembers.find((m) => selectedCheckMemberIds.has(m.id))?.id ?? null;

  const handleCheckboxChange = (memberId: string) => {
    const currentlySelected = selectedCheckMemberIds.has(memberId);
    toggleSelectMember(memberId);
    if (!currentlySelected) {
      toggleExpand(memberId);
      // On mobile / tablet, automatically scroll attendance panel into view
      if (typeof window !== "undefined" && window.innerWidth < 1024) {
        const panel = document.getElementById("team-attendance-panel");
        if (panel) {
          panel.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }
    }
  };

  // Always YYYY-MM-DD so keys match calendar and canSubmit
  const toDateKey = (dt: string | unknown): string => {
    const s = typeof dt === "string" ? dt : (dt as { value?: string })?.value ?? "";
    const d = new Date(s);
    if (isNaN(d.getTime())) return s.slice(0, 10);
    const y = d.getFullYear(),
      m = d.getMonth() + 1,
      day = d.getDate();
    return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  };

  const buildCalendarGrid = (records: AttendanceRecord[]) => {
    const recordsByDate = new Map(records.map((r) => [toDateKey(String(r.dt)), r]));
    const firstDay = new Date(selectedYear, selectedMonth, 1);
    const startDayOfWeek = firstDay.getDay();
    const totalDays = new Date(selectedYear, selectedMonth + 1, 0).getDate();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const cells: { day: number | null; record: AttendanceRecord | null; isFuture: boolean; dateStr: string }[] = [];
    for (let i = 0; i < startDayOfWeek; i++) {
      cells.push({ day: null, record: null, isFuture: false, dateStr: "" });
    }
    for (let day = 1; day <= totalDays; day++) {
      const dateStr = `${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const cellDate = new Date(selectedYear, selectedMonth, day);
      const isFuture = cellDate > today;
      const record = recordsByDate.get(dateStr) ?? null;
      cells.push({ day, record, isFuture, dateStr });
    }
    return cells;
  };

  const openNotCorrect = (memberId: string, dateStr: string) => {
    setDateMenuKey(null);
    setNotCorrectModal({ memberId, dateStr });
    setQueryDraft(getQuery(memberId, dateStr) || "");
  };

  const saveNotCorrect = () => {
    if (!notCorrectModal) return;
    if (!queryDraft.trim()) {
      toast({ title: "Reason required", variant: "destructive" });
      return;
    }
    setStatus(notCorrectModal.memberId, notCorrectModal.dateStr, "NOT_CORRECT", queryDraft.trim());
    setNotCorrectModal(null);
    setQueryDraft("");
  };

  const isMemberAllOk = (memberId: string): boolean => {
    const records = memberAttendanceMap.get(memberId)?.records ?? [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (const r of records) {
      const dateStr = toDateKey(String(r.dt));
      const d = new Date(dateStr);
      if (isNaN(d.getTime()) || d > today) continue;
      const status = getStatus(memberId, dateStr);
      if (status !== "CORRECT") return false;
    }
    return records.length > 0;
  };

  const hasMemberAnyNotCorrect = (memberId: string): boolean => {
    const records = memberAttendanceMap.get(memberId)?.records ?? [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (const r of records) {
      const dateStr = toDateKey(String(r.dt));
      const d = new Date(dateStr);
      if (isNaN(d.getTime()) || d > today) continue;
      if (getStatus(memberId, dateStr) === "NOT_CORRECT") return true;
    }
    return false;
  };

  const handleAllOk = () => {
    if (!viewMemberId || isLocked) return;
    const records = memberAttendanceMap.get(viewMemberId)?.records ?? [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    records.forEach((r) => {
      const dateStr = toDateKey(String(r.dt));
      const d = new Date(dateStr);
      if (!isNaN(d.getTime()) && d <= today) setStatus(viewMemberId, dateStr, "CORRECT");
    });
    toast({ title: "All OK", description: "All dates marked as correct for this member." });
  };

  const getTaskSummary = (records: AttendanceRecord[]) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let total = 0;
    let completed = 0;
    let notCompleted = 0;
    let halfCompleted = 0;

    for (const r of records) {
      const dateStr = toDateKey(String(r.dt));
      const d = new Date(dateStr);
      if (isNaN(d.getTime()) || d > today) continue;

      total += 1;
      const s = (r.STATUS || "").toUpperCase().trim();

      if (s === "HALFDAY" || s === "HALF DAY" || s.includes("HALF")) {
        halfCompleted += 1;
      } else if (
        s === "ABSENT" ||
        s === "DOUBLE ABSENT" ||
        s === "DOUBLE A" ||
        s.includes("ABSENT") ||
        s.includes("DOUBLE")
      ) {
        notCompleted += 1;
      } else {
        completed += 1;
      }
    }

    return { total, completed, notCompleted, halfCompleted };
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Team Attendance Check View
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={handlePrevMonth} disabled={isMinDate} className="h-8 w-8">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="font-medium min-w-[120px] text-center text-sm">
              {MONTHS[selectedMonth]} {selectedYear}
            </span>
            <Button variant="outline" size="icon" onClick={handleNextMonth} disabled={isMaxDate} className="h-8 w-8">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left: member list — compact height on mobile/tablet so attendance shows right below */}
          <div className="lg:col-span-1 space-y-1 max-h-[min(40vh,260px)] lg:max-h-[min(70vh,500px)] overflow-y-auto rounded-lg border border-border p-2">
            {teamMembers.map((member) => {
              const fullName = `${member.firstName} ${member.lastName || ""}`.trim() || "—";
              const expanded = expandedMemberIds.has(member.id);
              const selected = selectedCheckMemberIds.has(member.id);
              const allOk = isMemberAllOk(member.id);
              const hasProblem = hasMemberAnyNotCorrect(member.id);
              const hasRecords = (memberAttendanceMap.get(member.id)?.records?.length ?? 0) > 0;
              const firstRecord = (memberAttendanceMap.get(member.id)?.records?.[0] ?? null) as AttendanceRecordWithBranch | null;
              const departmentName = member.department?.name || "—";
              const designationName = member.designation?.name || "—";
              const unitCode = member.orgUnit?.code || firstRecord?.branch_code || "—";
              return (
                <div
                  key={member.id}
                  className={cn(
                    "rounded-lg border transition-colors flex items-center gap-2 p-2",
                    "border-border bg-card",
                    selected && hasProblem && "border-red-300 bg-red-50/90 ring-1 ring-red-200 dark:bg-red-950/40 dark:border-red-800",
                    selected && allOk && "border-green-300 bg-green-50/90 ring-1 ring-green-200 dark:bg-green-950/40 dark:border-green-800",
                    selected && !hasProblem && !allOk && "border-indigo-300 bg-indigo-50/50 ring-1 ring-indigo-200 dark:bg-indigo-950/20",
                    !selected && hasProblem && "border-red-200 bg-red-50/80 dark:bg-red-950/30 dark:border-red-900/50",
                    !selected && allOk && "border-green-200 bg-green-50/80 dark:bg-green-950/30 dark:border-green-900/50"
                  )}
                >
                  <input
                    type="radio"
                    name="check-view-member"
                    checked={selected}
                    onChange={() => handleCheckboxChange(member.id)}
                    disabled={isLocked}
                    className="shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate text-sm">{encodeName(fullName)}</div>
                    <div className="text-xs text-muted-foreground font-mono truncate">{member.cardNumber || member.id}</div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      Dept: {departmentName} | Designation: {designationName}
                    </div>
                    {expanded && (
                      <div className="text-[11px] text-muted-foreground truncate">
                        Unit Code: {unitCode}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleExpand(member.id)}
                    className="p-1 rounded hover:bg-muted shrink-0"
                  >
                    {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                </div>
              );
            })}
            {teamMembers.length === 0 && (
              <div className="py-6 text-center text-xs text-muted-foreground">
                No members match current filters.
              </div>
            )}
          </div>

          {/* Right: attendance dates for selected member */}
          <div
            className="lg:col-span-2 min-h-[200px] rounded-lg border border-border p-3 bg-muted/20"
            id="team-attendance-panel"
          >
            {!viewMemberId ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-sm gap-2">
                <User className="h-10 w-10 opacity-50" />
                <p>Select a member to view attendance dates</p>
              </div>
            ) : isLoading ? (
              <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground text-sm">
                <Loader2 className="h-6 w-6 animate-spin" />
                Loading attendance...
              </div>
            ) : (() => {
              const member = teamMembers.find((m) => m.id === viewMemberId);
              const records = member ? memberAttendanceMap.get(member.id)?.records ?? [] : [];
              const summary = getTaskSummary(records);
              const grid = buildCalendarGrid(records).filter((c) => c.day !== null);
              return (
                <div>
                  {member && (
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <p className="text-sm font-medium text-muted-foreground">
                        {encodeName(`${member.firstName} ${member.lastName || ""}`.trim() || "—")} — Click a date to verify
                      </p>
                      {!isLocked && records.length > 0 && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-green-200 bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-950/30 dark:border-green-800"
                          onClick={handleAllOk}
                        >
                          <CheckCircle2 className="h-4 w-4 mr-1" />
                          All OK
                        </Button>
                      )}
                    </div>
                  )}
                  {records.length > 0 && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
                      <Card className="border-border bg-muted/40 shadow-sm">
                        <CardContent className="p-3">
                          <div className="text-lg md:text-xl font-semibold text-foreground">{summary.total}</div>
                          <div className="text-[11px] md:text-xs text-muted-foreground">Total Task</div>
                        </CardContent>
                      </Card>
                      <Card className="border-emerald-500/20 bg-emerald-500/10 shadow-sm">
                        <CardContent className="p-3">
                          <div className="text-lg md:text-xl font-semibold text-emerald-600 dark:text-emerald-400">{summary.completed}</div>
                          <div className="text-[11px] md:text-xs text-emerald-600/80 dark:text-emerald-400/80">Completed</div>
                        </CardContent>
                      </Card>
                      <Card className="border-rose-500/20 bg-rose-500/10 shadow-sm">
                        <CardContent className="p-3">
                          <div className="text-lg md:text-xl font-semibold text-rose-600 dark:text-rose-400">{summary.notCompleted}</div>
                          <div className="text-[11px] md:text-xs text-rose-600/80 dark:text-rose-400/80">Not Completed</div>
                        </CardContent>
                      </Card>
                      <Card className="border-amber-500/20 bg-amber-500/10 shadow-sm">
                        <CardContent className="p-3">
                          <div className="text-lg md:text-xl font-semibold text-amber-600 dark:text-amber-400">{summary.halfCompleted}</div>
                          <div className="text-[11px] md:text-xs text-amber-600/80 dark:text-amber-400/80">Half Completed</div>
                        </CardContent>
                      </Card>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-1">
                    {grid.map((cell) => {
                      const { day, record, isFuture, dateStr } = cell;
                      const weeklyOff = member?.cardNumber ? weeklyOffByCard[member.cardNumber] : null;
                      const style = record ? getStatusStyle(record.STATUS, dateStr, weeklyOff) : null;
                      const isMuted = style?.bgColor?.includes("var(--muted)");
                      const verStatus = member ? getStatus(member.id, dateStr) : null;
                      const isNotCorrect = verStatus === "NOT_CORRECT";
                      const key = `${viewMemberId}_${dateStr}`;
                      const open = dateMenuKey === key;

                      if (isFuture) {
                        return (
                          <div
                            key={dateStr}
                            className="h-9 w-9 border border-border/50 rounded flex items-center justify-center bg-muted/30 opacity-50"
                          >
                            <span className="text-xs font-semibold text-muted-foreground">{day}</span>
                          </div>
                        );
                      }
                      if (!record) {
                        return (
                          <div
                            key={dateStr}
                            className="h-9 w-9 border border-border/50 rounded flex items-center justify-center bg-muted/20"
                          >
                            <span className="text-xs font-semibold text-muted-foreground">{day}</span>
                          </div>
                        );
                      }

                      return (
                        <DropdownMenu key={dateStr} open={open} onOpenChange={(o) => setDateMenuKey(o ? key : null)}>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              disabled={isLocked}
                              className={cn(
                                "h-9 w-9 min-w-[2.25rem] border rounded flex flex-col items-center justify-center relative overflow-hidden transition-all",
                                isNotCorrect && "ring-2 ring-black border-black",
                                !isLocked && "cursor-pointer hover:ring-2 hover:ring-primary/50"
                              )}
                              style={{ backgroundColor: style?.bgColor }}
                            >
                              <span className={cn("text-xs font-bold", isMuted ? "text-foreground" : "text-white")}>
                                {day}
                              </span>
                              {verStatus === "CORRECT" && (
                                <span className="absolute bottom-0.5 right-0.5 text-white" title="Verified">
                                  <CheckCircle2 className="h-3 w-3" />
                                </span>
                              )}
                              {style?.dots?.length ? (
                                <div className="absolute bottom-0.5 left-0 right-0 flex justify-center gap-0.5">
                                  {style.dots.flatMap((dot, di) =>
                                    Array.from({ length: dot.count }, (_, i) => (
                                      <div key={`${di}-${i}`} className="w-1 h-1 rounded-full" style={{ backgroundColor: dot.color }} />
                                    ))
                                  )}
                                </div>
                              ) : null}
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start">
                            <DropdownMenuItem
                              onClick={() => {
                                setDateMenuKey(null);
                                if (member) setStatus(member.id, dateStr, verStatus === "CORRECT" ? null : "CORRECT");
                              }}
                            >
                              <CheckCircle2 className="h-4 w-4 mr-2" />
                              Correct
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => member && openNotCorrect(member.id, dateStr)}>
                              <XCircle className="h-4 w-4 mr-2" />
                              Not Correct
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>

        {(() => {
          const memberIds = new Set<string>();
          for (const key of Object.keys(pendingSave)) {
            const parts = key.split("_");
            const dateStr = parts.length >= 2 ? parts[parts.length - 1] : "";
            if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
              memberIds.add(parts.slice(0, -1).join("_"));
            }
          }
          const memberCount = memberIds.size;
          return memberCount > 0 && !isLocked ? (
            <Button size="sm" variant="outline" onClick={savePending}>
              Save {memberCount} {memberCount === 1 ? "member" : "members"}
            </Button>
          ) : null;
        })()}

        {isLoading && !viewMemberId && (
          <div className="flex items-center justify-center py-4 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            Loading...
          </div>
        )}
      </CardContent>

      {/* Not Correct modal: selected date + query + Save */}
      <Dialog open={!!notCorrectModal} onOpenChange={(o) => !o && setNotCorrectModal(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Not Correct — Add query</DialogTitle>
          </DialogHeader>
          {notCorrectModal && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Date: <strong className="text-foreground">{notCorrectModal.dateStr}</strong>
              </p>
              <div>
                <label className="text-sm font-medium block mb-1">Query / Reason</label>
                <Textarea
                  placeholder="Enter reason..."
                  value={queryDraft}
                  onChange={(e) => setQueryDraft(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setNotCorrectModal(null)}>
              Cancel
            </Button>
            <Button onClick={saveNotCorrect} disabled={!queryDraft.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
