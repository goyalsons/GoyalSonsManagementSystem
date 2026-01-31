import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth-context";
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
  Calendar, 
  ChevronLeft, 
  ChevronRight,
  AlertCircle,
  Loader2,
  Users,
  RefreshCw
} from "lucide-react";
import { apiGet } from "@/lib/api";
import { encodeName } from "@/lib/utils";

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

export default function TeamAttendancePage() {
  const { user, hasPolicy } = useAuth();
  const queryClient = useQueryClient();
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMember, setSelectedMember] = useState<string>("all");
  const [selectedRecord, setSelectedRecord] = useState<AttendanceRecord | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  // Check if user has team view permission
  const canViewTeam = hasPolicy("attendance.team.view");

  const monthDate = useMemo(() => {
    const month = String(selectedMonth + 1).padStart(2, "0");
    return `${selectedYear}-${month}-01`;
  }, [selectedMonth, selectedYear]);

  // Fetch team members using my-team API
  const { data: teamResponse, isLoading: loadingTeam, isRefetching: refetchingTeam, refetch: refetchTeam } = useQuery({
    queryKey: ["my-team-members"],
    queryFn: () => apiGet("/emp-manager/my-team"),
    enabled: canViewTeam,
  });

  const teamMembers: TeamMember[] = teamResponse?.data || [];

  // Fetch attendance for selected member or all team
  const { data: attendanceData, isLoading: loadingAttendance, refetch: refetchAttendance } = useQuery<AttendanceResponse>({
    queryKey: ["team-attendance", selectedMember, monthDate],
    queryFn: () => {
      if (selectedMember === "all") {
        // For "all", we would need a different API endpoint
        // For now, return empty - would need backend support for bulk attendance
        return Promise.resolve({ records: [], summary: { present: 0, absent: 0, halfDay: 0, leave: 0, total: 0 } });
      }
      return apiGet(`/attendance/history/${selectedMember}?month=${monthDate}`);
    },
    enabled: canViewTeam && selectedMember !== "all",
  });

  // Minimum date: October 2025
  const minDate = new Date(2025, 9, 1);
  
  const isMinDate = useMemo(() => {
    let prevMonth = selectedMonth === 0 ? 11 : selectedMonth - 1;
    let prevYear = selectedMonth === 0 ? selectedYear - 1 : selectedYear;
    const prevDate = new Date(prevYear, prevMonth, 1);
    return prevDate < minDate;
  }, [selectedMonth, selectedYear]);

  const handlePrevMonth = () => {
    if (isMinDate) return;
    if (selectedMonth === 0) {
      setSelectedMonth(11);
      setSelectedYear(selectedYear - 1);
    } else {
      setSelectedMonth(selectedMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (selectedMonth === 11) {
      setSelectedMonth(0);
      setSelectedYear(selectedYear + 1);
    } else {
      setSelectedMonth(selectedMonth + 1);
    }
  };

  const handleRefresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["my-team-members"] });
    await refetchTeam();
    if (selectedMember !== "all") {
      await queryClient.invalidateQueries({ queryKey: ["team-attendance", selectedMember, monthDate] });
      await refetchAttendance();
    }
  };

  const recordsByDate = useMemo(() => {
    const map = new Map<string, AttendanceRecord>();
    if (attendanceData?.records) {
      attendanceData.records.forEach((record) => {
        const dateStr =
          typeof record.dt === "object" && record.dt !== null
            ? (record.dt as { value?: string }).value
            : record.dt;
        map.set(String(dateStr ?? ""), record);
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
      <div className="flex items-center justify-between">
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
        <Button
          variant="outline"
          onClick={handleRefresh}
          disabled={refetchingTeam}
        >
          {refetchingTeam ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          Refresh
        </Button>
      </div>

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
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <Label className="text-sm text-muted-foreground">Team Member</Label>
              <Select value={selectedMember} onValueChange={setSelectedMember}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select member..." />
                </SelectTrigger>
                <SelectContent className="max-h-[min(20rem,70vh)] overflow-y-auto">
                  <SelectItem value="all">-- Select a member --</SelectItem>
                  {teamMembers.map((member) => (
                    <SelectItem key={member.id} value={member.cardNumber || member.id}>
                      {member.firstName} {member.lastName || ""} ({member.cardNumber || "No Card"})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-sm text-muted-foreground">Month</Label>
              <Select value={String(selectedMonth)} onValueChange={(v) => setSelectedMonth(Number(v))}>
                <SelectTrigger className="w-32 mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((month, index) => (
                    <SelectItem key={month} value={String(index)}>
                      {month}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-sm text-muted-foreground">Year</Label>
              <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
                <SelectTrigger className="w-24 mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {YEARS.map((year) => (
                    <SelectItem key={year} value={String(year)}>
                      {year}
                    </SelectItem>
                  ))}
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
              Choose a team member from the dropdown above to view their attendance calendar
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
                <Button variant="outline" size="icon" onClick={handleNextMonth} className="h-8 w-8">
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
