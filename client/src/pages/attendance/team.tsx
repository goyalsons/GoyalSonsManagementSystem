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

export default function TeamAttendancePage() {
  const { user, hasPolicy } = useAuth();
  const queryClient = useQueryClient();
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMember, setSelectedMember] = useState<string>("all");

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
        {selectedMember !== "all" && attendanceData?.summary && (
          <>
            <Card className="border-emerald-200 bg-emerald-50">
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-emerald-600">{attendanceData.summary.present}</div>
                <div className="text-sm text-emerald-700">Present Days</div>
              </CardContent>
            </Card>
            <Card className="border-rose-200 bg-rose-50">
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-rose-600">{attendanceData.summary.absent}</div>
                <div className="text-sm text-rose-700">Absent Days</div>
              </CardContent>
            </Card>
            <Card className="border-amber-200 bg-amber-50">
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-amber-600">{attendanceData.summary.halfDay}</div>
                <div className="text-sm text-amber-700">Half Days</div>
              </CardContent>
            </Card>
          </>
        )}
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
                <SelectContent>
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

      {/* Attendance Data */}
      {selectedMember === "all" ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-lg font-medium text-muted-foreground">Select a Team Member</p>
            <p className="text-sm text-muted-foreground mt-1">
              Choose a team member from the dropdown above to view their attendance
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
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-medium flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  {encodeName(attendanceData.records[0]?.Name || "Member")} - {MONTHS[selectedMonth]} {selectedYear}
                </CardTitle>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={handlePrevMonth} disabled={isMinDate} className="h-8 w-8">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" onClick={handleNextMonth} className="h-8 w-8">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3 font-medium">Date</th>
                    <th className="text-left py-2 px-3 font-medium">Status</th>
                    <th className="text-left py-2 px-3 font-medium">In Time</th>
                    <th className="text-left py-2 px-3 font-medium">Out Time</th>
                  </tr>
                </thead>
                <tbody>
                  {attendanceData.records.map((record, index) => (
                    <tr key={index} className="border-b hover:bg-muted/50">
                      <td className="py-2 px-3 font-mono">{record.dt}</td>
                      <td className="py-2 px-3">
                        <Badge
                          style={{ backgroundColor: getStatusColor(record.STATUS) }}
                          className="text-white border-none"
                        >
                          {getStatusLabel(record.STATUS)}
                        </Badge>
                      </td>
                      <td className="py-2 px-3 font-mono">
                        {record.t_in || record.result_t_in || "--:--"}
                      </td>
                      <td className="py-2 px-3 font-mono">
                        {record.t_out || record.result_t_out || "--:--"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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

      {/* Legend */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-wrap gap-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded" style={{ backgroundColor: "#10b981" }} />
              <span>Present</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded" style={{ backgroundColor: "#ef4444" }} />
              <span>Absent</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded" style={{ backgroundColor: "#eab308" }} />
              <span>Half Day</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded" style={{ backgroundColor: "#f97316" }} />
              <span>Miss</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded" style={{ backgroundColor: "#3b82f6" }} />
              <span>Leave</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded" style={{ backgroundColor: "#a855f7" }} />
              <span>Weekly Off</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
