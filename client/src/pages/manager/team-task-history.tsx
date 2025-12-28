import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Users, Calendar, ArrowLeft, Search, ChevronLeft, ChevronRight, HelpCircle } from "lucide-react";
import { HelpTicketForm } from "@/components/HelpTicketForm";

interface TeamMember {
  id: string;
  firstName: string;
  lastName: string | null;
  cardNumber: string | null;
  department: { id: string; name: string; code: string } | null;
  designation: { id: string; name: string; code: string } | null;
  orgUnit: { id: string; name: string } | null;
}

interface AttendanceRecord {
  card_no: string;
  dt: string;
  month_dt: string;
  POLICY_NAME: string;
  Name: string;
  branch_code: string;
  DEPT_CODE: string;
  DESIGN_CODE: string;
  t_in: string | null;
  t_out: string | null;
  entry_type: string | null;
  STATUS: string;
  status_remarks: string | null;
  CORRECTION_REASON: string | null;
  result_t_in: string | null;
  result_t_out: string | null;
  P: number | string;
  A: number | string;
  HD: number | string;
  MIS: number | string;
  L: number | string;
  crr_status: string | null;
  crr_approval: string | null;
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

interface StatusStyle {
  bgColor: string;
  dots: { color: string; count: number }[];
  text?: string; // For backward compatibility with table view
}

/**
 * Maps BigQuery STATUS field directly to visual style with calendar dots.
 * Colors and dots are determined ONLY by what BigQuery returns in the STATUS field.
 */
function getStatusStyle(status: string): StatusStyle {
  const s = (status || "").toUpperCase().trim();
  
  // DOUBLE ABSENT - Red with 2 black dots
  if (s === "DOUBLE ABSENT" || s === "DOUBLE A" || s.includes("DOUBLE")) {
    return { bgColor: "#ef4444", dots: [{ color: "#000000", count: 2 }] };
  }
  
  // ABSENT - Solid red, NO dots
  if (s === "ABSENT") {
    return { bgColor: "#ef4444", dots: [] };
  }
  
  // PRESENT - Solid green, NO dots
  if (s === "PRESENT") {
    return { bgColor: "#10b981", dots: [] };
  }
  
  // PRESENT LATE - Green with white dot
  if (s === "PRESENT LATE") {
    return { bgColor: "#10b981", dots: [{ color: "#ffffff", count: 1 }] };
  }
  
  // PRESENT EARLY_OUT (blue dot variant) - Green with blue dot
  if (s === "PRESENT EARLY_OUT" || s === "PRESENT E") {
    return { bgColor: "#10b981", dots: [{ color: "#3b82f6", count: 1 }] };
  }
  
  // PRESENT LATE EARLY_OUT - Green with 2 dots (white for LATE, blue for EARLY_OUT)
  if (s === "PRESENT LATE EARLY_OUT" || s === "PRESENT L") {
    return { bgColor: "#10b981", dots: [{ color: "#ffffff", count: 1 }, { color: "#3b82f6", count: 1 }] };
  }
  
  // HALFDAY / HALF DAY - Yellow, NO dots
  if (s === "HALFDAY" || s === "HALF DAY" || s === "HD") {
    return { bgColor: "#eab308", dots: [] };
  }
  
  // MISS OUT - Orange with blue dot
  if (s === "MISS OUT") {
    return { bgColor: "#f97316", dots: [{ color: "#3b82f6", count: 1 }] };
  }
  
  // MISS IN - Orange with blue dot
  if (s === "MISS IN") {
    return { bgColor: "#f97316", dots: [{ color: "#3b82f6", count: 1 }] };
  }
  
  // MISS PENDING - Semantic background with special indicator
  if (s === "MISS PENDING" || s === "MISS PEND") {
    return { bgColor: "var(--muted)", dots: [{ color: "#9ca3af", count: 1 }] };
  }
  
  // LEAVE - Blue, NO dots
  if (s === "LEAVE" || s === "L") {
    return { bgColor: "#3b82f6", dots: [] };
  }
  
  // WEEKLY OFF - Purple, NO dots
  if (s === "WEEKLY OFF" || s === "WO") {
    return { bgColor: "#a855f7", dots: [] };
  }
  
  // Fallback patterns
  if (s.includes("PRESENT") && s.includes("LATE") && s.includes("EARLY")) {
    return { bgColor: "#10b981", dots: [{ color: "#ffffff", count: 1 }, { color: "#3b82f6", count: 1 }] };
  }
  if (s.includes("PRESENT") && s.includes("LATE")) {
    return { bgColor: "#10b981", dots: [{ color: "#ffffff", count: 1 }] };
  }
  if (s.includes("PRESENT") && s.includes("EARLY")) {
    return { bgColor: "#10b981", dots: [{ color: "#3b82f6", count: 1 }] };
  }
  if (s.includes("PRESENT") || s === "P") {
    return { bgColor: "#10b981", dots: [] };
  }
  if (s.includes("ABSENT") || s === "A") {
    return { bgColor: "#ef4444", dots: [] };
  }
  if (s.includes("MISS") || s.includes("MIS")) {
    return { bgColor: "#f97316", dots: [] };
  }
  if (s.includes("HALF") || s === "HD") {
    return { bgColor: "#eab308", dots: [] };
  }
  
  // Unknown status - Gray
  return { bgColor: "#94a3b8", dots: [] };
}

/**
 * Calculate summary counts from BigQuery records
 */
function calculateSummary(records: AttendanceRecord[]) {
  let present = 0;
  let absent = 0;
  let doubleAbsent = 0;
  let halfDay = 0;
  let missInOut = 0;
  
  records.forEach(record => {
    const s = (record.STATUS || "").toUpperCase().trim();
    
    if (s.includes("DOUBLE") && s.includes("ABSENT")) {
      doubleAbsent++;
    } else if (s === "ABSENT" || s === "A") {
      absent++;
    } else if (s.includes("PRESENT") || s === "P") {
      present++;
    } else if (s === "HALFDAY" || s === "HALF DAY" || s === "HD" || s.includes("HALF")) {
      halfDay++;
    } else if (s.includes("MISS")) {
      missInOut++;
    }
  });
  
  return { present, absent, doubleAbsent, halfDay, missInOut, total: records.length };
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const YEARS = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

export default function TeamTaskHistoryPage() {
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [cardNumberFilter, setCardNumberFilter] = useState("");
  const [selectedMonth, setSelectedMonth] = useState<string>(
    MONTHS[new Date().getMonth()]
  );
  const [selectedYear, setSelectedYear] = useState<string>(
    new Date().getFullYear().toString()
  );
  const [selectedRecord, setSelectedRecord] = useState<AttendanceRecord | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [helpTicketOpen, setHelpTicketOpen] = useState(false);

  // Fetch team members
  const { data: teamMembers = [], isLoading: membersLoading, error: membersError } = useQuery<TeamMember[]>({
    queryKey: ["/api/manager/team/members"],
    queryFn: async () => {
      const token = localStorage.getItem("gms_token");
      console.log("[Team Task History] Fetching team members...");
      const res = await fetch("/api/manager/team/members", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      console.log("[Team Task History] Response status:", res.status);
      
      // Check content type to see if we got HTML instead of JSON
      const contentType = res.headers.get("content-type");
      console.log("[Team Task History] Content-Type:", contentType);
      
      if (!res.ok) {
        // Try to get error message, but handle HTML responses
        let errorMessage = "Failed to fetch team members";
        try {
          const errorData = await res.json();
          errorMessage = errorData.message || errorData.error || errorMessage;
        } catch (e) {
          // If JSON parsing fails, we probably got HTML (404/500 page)
          const text = await res.text();
          console.error("[Team Task History] Non-JSON error response:", text.substring(0, 200));
          if (res.status === 404) {
            errorMessage = "API endpoint not found. Please restart the server.";
          } else if (res.status === 500) {
            errorMessage = "Server error. Check server logs.";
          } else {
            errorMessage = `Server returned ${res.status} error`;
          }
        }
        console.error("[Team Task History] Error:", errorMessage);
        throw new Error(errorMessage);
      }
      
      // Check if response is actually JSON
      if (!contentType || !contentType.includes("application/json")) {
        const text = await res.text();
        console.error("[Team Task History] Non-JSON response:", text.substring(0, 200));
        throw new Error("Server returned HTML instead of JSON. The API endpoint may not exist. Please restart the server.");
      }
      
      const data = await res.json();
      console.log("[Team Task History] Team members received:", data.length);
      return data;
    },
  });

  // Filter team members
  const filteredMembers = teamMembers.filter(member => {
    // Filter by search term (name)
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      const fullName = `${member.firstName} ${member.lastName || ""}`.toLowerCase();
      if (!fullName.includes(search)) return false;
    }
    
    // Filter by card number
    if (cardNumberFilter) {
      const cardNo = member.cardNumber?.toLowerCase() || "";
      if (!cardNo.includes(cardNumberFilter.toLowerCase())) return false;
    }
    
    return true;
  });

  // Log for debugging
  console.log("[Team Task History] Current state:", {
    teamMembersCount: teamMembers.length,
    isLoading: membersLoading,
    error: membersError,
    filteredCount: filteredMembers.length,
  });

  // Fetch attendance for selected member
  const monthIndex = MONTHS.indexOf(selectedMonth);
  // Format: YYYY-MM-DD (first day of month) - same as attendance/history page
  const monthParam = monthIndex >= 0 
    ? `${selectedYear}-${String(monthIndex + 1).padStart(2, "0")}-01`
    : undefined;

  const { data: attendanceData, isLoading: attendanceLoading, error: attendanceError } = useQuery<AttendanceResponse>({
    queryKey: ["/api/attendance/history", selectedMember?.cardNumber, monthParam],
    queryFn: async () => {
      if (!selectedMember?.cardNumber) {
        throw new Error("No card number selected");
      }
      
      const url = `/api/attendance/history/${selectedMember.cardNumber}${monthParam ? `?month=${monthParam}` : ""}`;
      console.log("[Team Task History] Fetching attendance for:", {
        cardNumber: selectedMember.cardNumber,
        month: monthParam,
        url,
      });
      
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("gms_token")}`,
        },
      });
      
      console.log("[Team Task History] Attendance response status:", res.status);
      
      // Read response body only once
      const contentType = res.headers.get("content-type");
      const isJson = contentType && contentType.includes("application/json");
      
      let responseBody: string | any = null;
      
      try {
        if (isJson) {
          responseBody = await res.json();
        } else {
          responseBody = await res.text();
        }
      } catch (e) {
        console.error("[Team Task History] Error reading response body:", e);
        throw new Error("Failed to read response from server");
      }
      
      if (!res.ok) {
        let errorMessage = "Failed to fetch attendance";
        
        try {
          if (isJson && typeof responseBody === "object") {
            errorMessage = responseBody.message || errorMessage;
          } else if (typeof responseBody === "string") {
            console.error("[Team Task History] Non-JSON error:", responseBody.substring(0, 200));
            if (res.status === 503) {
              errorMessage = "BigQuery is not configured. Please configure BigQuery credentials.";
            } else if (res.status === 403) {
              // Try to parse as JSON in case it's JSON string
              try {
                const errorJson = JSON.parse(responseBody);
                errorMessage = errorJson.message || "Access denied. The team member may not be in your team scope, or you may need to log out and log back in to refresh your manager permissions.";
              } catch {
                errorMessage = "Access denied. The team member may not be in your team scope, or you may need to log out and log back in to refresh your manager permissions.";
              }
            } else {
              errorMessage = `Server error (${res.status})`;
            }
          }
        } catch (e) {
          console.error("[Team Task History] Error parsing error response:", e);
        }
        
        throw new Error(errorMessage);
      }
      
      // Success response - already parsed if JSON
      if (!isJson) {
        console.error("[Team Task History] Non-JSON attendance response:", typeof responseBody === "string" ? responseBody.substring(0, 200) : "Unknown format");
        throw new Error("Server returned HTML instead of JSON");
      }
      
      const data = responseBody as AttendanceResponse;
      console.log("[Team Task History] Attendance records received:", {
        count: data.records?.length || 0,
        summary: data.summary,
      });
      return data;
    },
    enabled: !!selectedMember?.cardNumber,
  });

  // Calendar grid logic
  const recordsByDate = useMemo(() => {
    const map = new Map<string, AttendanceRecord>();
    if (attendanceData?.records) {
      attendanceData.records.forEach(record => {
        const dateStr = typeof record.dt === 'object' && record.dt !== null 
          ? (record.dt as any).value 
          : record.dt;
        map.set(dateStr, record);
      });
    }
    return map;
  }, [attendanceData?.records]);

  const calendarGrid = useMemo(() => {
    const monthIndex = MONTHS.indexOf(selectedMonth);
    if (monthIndex < 0) return [];
    
    const year = Number(selectedYear);
    const firstDay = new Date(year, monthIndex, 1);
    const lastDay = new Date(year, monthIndex + 1, 0);
    const startDayOfWeek = firstDay.getDay();
    const totalDays = lastDay.getDate();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const cells: { day: number | null; record: AttendanceRecord | null; isFuture: boolean }[] = [];
    
    for (let i = 0; i < startDayOfWeek; i++) {
      cells.push({ day: null, record: null, isFuture: false });
    }

    for (let day = 1; day <= totalDays; day++) {
      const dateStr = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const cellDate = new Date(year, monthIndex, day);
      const isFuture = cellDate > today;
      const record = recordsByDate.get(dateStr) || null;
      
      cells.push({ day, record, isFuture });
    }

    return cells;
  }, [selectedMonth, selectedYear, recordsByDate]);

  // Minimum date: October 2025
  const minDate = new Date(2025, 9, 1); // October is month 9 (0-indexed)
  minDate.setHours(0, 0, 0, 0); // Normalize to start of day
  
  const isMinDate = useMemo(() => {
    // Check if going to previous month would be before minimum date
    const monthIndex = MONTHS.indexOf(selectedMonth);
    const year = Number(selectedYear);
    
    let prevMonthIndex: number;
    let prevYear: number;
    
    if (monthIndex === 0) {
      prevMonthIndex = 11;
      prevYear = year - 1;
    } else {
      prevMonthIndex = monthIndex - 1;
      prevYear = year;
    }
    
    const prevDate = new Date(prevYear, prevMonthIndex, 1);
    prevDate.setHours(0, 0, 0, 0);
    // Disable if previous month would be before October 2025
    return prevDate < minDate;
  }, [selectedMonth, selectedYear]);

  const handlePrevMonth = () => {
    if (isMinDate) return; // Don't allow navigation before minimum date
    
    const monthIndex = MONTHS.indexOf(selectedMonth);
    if (monthIndex === 0) {
      const newYear = Number(selectedYear) - 1;
      const newDate = new Date(newYear, 11, 1); // December of previous year
      if (newDate <= minDate) return; // Check if we'd go below minimum
      setSelectedMonth(MONTHS[11]);
      setSelectedYear(String(newYear));
    } else {
      const newMonthIndex = monthIndex - 1;
      const newDate = new Date(Number(selectedYear), newMonthIndex, 1);
      if (newDate <= minDate) return; // Check if we'd go below minimum
      setSelectedMonth(MONTHS[newMonthIndex]);
    }
  };

  const handleNextMonth = () => {
    const monthIndex = MONTHS.indexOf(selectedMonth);
    if (monthIndex === 11) {
      setSelectedMonth(MONTHS[0]);
      setSelectedYear(String(Number(selectedYear) + 1));
    } else {
      setSelectedMonth(MONTHS[monthIndex + 1]);
    }
  };

  const openDetails = (record: AttendanceRecord) => {
    setSelectedRecord(record);
    setDetailsOpen(true);
  };

  if (selectedMember) {
    // Show attendance/work log for selected member
    return (
      <div className="space-y-6">
        {/* Header with back button */}
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedMember(null)}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Team Members
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-indigo-500 flex items-center justify-center">
                <Calendar className="h-5 w-5 text-white" />
              </div>
              {selectedMember.firstName} {selectedMember.lastName || ""}
            </h1>
            <p className="text-slate-500 mt-1">
              Work Log & Attendance History
              {selectedMember.cardNumber && (
                <span className="ml-2 font-mono text-xs">Card: {selectedMember.cardNumber}</span>
              )}
            </p>
          </div>
        </div>

        {/* Member Info Banner */}
        {attendanceData?.records?.[0] && (
          <Card className="border-border bg-card shadow-sm">
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center gap-x-8 gap-y-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Member:</span>
                  <span className="ml-2 font-medium text-foreground">{attendanceData.records[0].Name}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Card No:</span>
                  <span className="ml-2 font-medium text-foreground">{attendanceData.records[0].card_no}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Policy:</span>
                  <span className="ml-2 font-medium text-foreground">{attendanceData.records[0].POLICY_NAME}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Summary Cards */}
        {attendanceData?.records && (() => {
          const summary = calculateSummary(attendanceData.records);
          const totalAbsent = summary.absent + summary.doubleAbsent;
          return (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Card className="border-border bg-muted/50">
                <CardContent className="p-3 text-center">
                  <div className="text-2xl font-bold text-foreground">{summary.total}</div>
                  <div className="text-xs text-muted-foreground">Total Task</div>
                </CardContent>
              </Card>
              <Card className="border-emerald-500/20 bg-emerald-500/10">
                <CardContent className="p-3 text-center">
                  <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{summary.present}</div>
                  <div className="text-xs text-emerald-600/80 dark:text-emerald-400/80">Completed</div>
                </CardContent>
              </Card>
              <Card className="border-rose-500/20 bg-rose-500/10">
                <CardContent className="p-3 text-center">
                  <div className="text-2xl font-bold text-rose-600 dark:text-rose-400">{totalAbsent}</div>
                  <div className="text-xs text-rose-600/80 dark:text-rose-400/80">Not Completed</div>
                </CardContent>
              </Card>
              <Card className="border-amber-500/20 bg-amber-500/10">
                <CardContent className="p-3 text-center">
                  <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">{summary.halfDay}</div>
                  <div className="text-xs text-amber-600/80 dark:text-amber-400/80">Half Completed</div>
                </CardContent>
              </Card>
            </div>
          );
        })()}

        {/* Calendar View */}
        <Card className="border-border bg-card shadow-sm">
          <CardHeader className="pb-4 px-4 sm:px-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <CardTitle className="text-base font-medium flex items-center gap-2 text-foreground">
                <Calendar className="h-4 w-4" /> Calendar View
              </CardTitle>
              <div className="flex items-center justify-between sm:justify-end gap-2">
                <Button 
                  variant="outline" 
                  size="icon" 
                  onClick={handlePrevMonth} 
                  disabled={isMinDate}
                  className="h-8 w-8"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="font-medium text-foreground min-w-[120px] text-center text-sm">
                  {selectedMonth} {selectedYear}
                </span>
                <Button variant="outline" size="icon" onClick={handleNextMonth} className="h-8 w-8">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-2 sm:px-6">
            {attendanceLoading ? (
              <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : attendanceError ? (
              <div className="flex items-center justify-center h-64 text-rose-500">
                <p>{(attendanceError as Error).message}</p>
              </div>
            ) : !attendanceData || attendanceData.records.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                <p className="text-lg font-medium">No work log data for {selectedMonth} {selectedYear}</p>
                <p className="text-sm">Try selecting a different month</p>
              </div>
            ) : (
              <>
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
                    const isWhite = style.bgColor.toLowerCase() === "#ffffff";
                    
                    return (
                      <div
                        key={index}
                        className="aspect-square sm:h-14 border border-border/50 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:shadow-md hover:scale-[1.02] transition-all relative overflow-hidden"
                        style={{ backgroundColor: style.bgColor }}
                        onClick={() => openDetails(cell.record!)}
                      >
                        <span className={`text-sm sm:text-base font-bold ${(isWhite || isMuted) ? 'text-foreground' : 'text-white shadow-sm'}`}>
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
                      <div className="absolute bottom-0 left-0.5 w-1 h-1 rounded-full bg-black" />
                      <div className="absolute bottom-0 right-0.5 w-1 h-1 rounded-full bg-black" />
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
                    <div className="w-4 h-4 rounded shadow-sm flex items-center justify-center" style={{ backgroundColor: "#f97316" }}>
                      <span className="text-white text-[8px] font-bold">1</span>
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
              </>
            )}
          </CardContent>
        </Card>

        <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
          <DialogContent className="max-w-md bg-card border-border">
            <DialogHeader>
              <DialogTitle className="text-foreground">Work Log Details</DialogTitle>
              <DialogDescription>
                View detailed information about this attendance record.
              </DialogDescription>
            </DialogHeader>
            {selectedRecord && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Date:</span>
                    <div className="font-medium text-foreground">{selectedRecord.dt}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Status:</span>
                    <div>
                      <Badge 
                        className="border-none shadow-sm"
                        style={{ 
                          backgroundColor: getStatusStyle(selectedRecord.STATUS).bgColor,
                          color: getStatusStyle(selectedRecord.STATUS).bgColor.toLowerCase() === "#ffffff" ? "#374151" : "#ffffff"
                        }}
                      >
                        {selectedRecord.STATUS}
                      </Badge>
                    </div>
                  </div>
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Remarks:</span>
                    <div className="font-medium text-sm text-foreground">{selectedRecord.status_remarks || "-"}</div>
                  </div>
                  {selectedRecord.CORRECTION_REASON && (
                    <div className="col-span-2">
                      <span className="text-muted-foreground">Correction Reason:</span>
                      <div className="font-medium text-sm text-foreground">{selectedRecord.CORRECTION_REASON}</div>
                    </div>
                  )}
                  {(() => {
                    const status = (selectedRecord.STATUS || "").toUpperCase().trim();
                    const remarks = (selectedRecord.status_remarks || "").toUpperCase().trim();
                    
                    // Hide both fields for ABSENT/DOUBLE ABSENT
                    const shouldHideBoth = status === "ABSENT" || status === "DOUBLE ABSENT" || status === "DOUBLE A" || status.includes("DOUBLE");
                    
                    if (shouldHideBoth) {
                      return null;
                    }
                    
                    // Check for PRESENT LATE EARLY_OUT first (show both In Time and Out Time)
                    const isPresentLateEarlyOut = status === "PRESENT LATE EARLY_OUT" || status === "PRESENT L" ||
                                                  (status.includes("PRESENT") && status.includes("LATE") && status.includes("EARLY"));
                    
                    if (isPresentLateEarlyOut) {
                      return (
                        <>
                          <div>
                            <span className="text-muted-foreground">In Time:</span>
                            <div className="font-medium text-foreground font-mono">
                              {selectedRecord.t_in || selectedRecord.result_t_in || "--:--"}
                            </div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Out Time:</span>
                            <div className="font-medium text-foreground font-mono">
                              {selectedRecord.t_out || selectedRecord.result_t_out || "--:--"}
                            </div>
                          </div>
                        </>
                      );
                    }
                    
                    // Check for PRESENT LATE (show only In Time, hide Out Time)
                    const isPresentLate = status === "PRESENT LATE" || (status.includes("PRESENT") && status.includes("LATE") && !status.includes("EARLY"));
                    
                    if (isPresentLate) {
                      return (
                        <div>
                          <span className="text-muted-foreground">In Time:</span>
                          <div className="font-medium text-foreground font-mono">
                            {selectedRecord.t_in || selectedRecord.result_t_in || "--:--"}
                          </div>
                        </div>
                      );
                    }
                    
                    // Check for PRESENT EARLY_OUT (show only Out Time, hide In Time)
                    const isPresentEarlyOut = status === "PRESENT EARLY_OUT" || status === "PRESENT E" || 
                                             (status.includes("PRESENT") && status.includes("EARLY") && !status.includes("LATE"));
                    
                    if (isPresentEarlyOut) {
                      return (
                        <div>
                          <span className="text-muted-foreground">Out Time:</span>
                          <div className="font-medium text-foreground font-mono">
                            {selectedRecord.t_out || selectedRecord.result_t_out || "--:--"}
                          </div>
                        </div>
                      );
                    }
                    
                    // Hide both fields for plain PRESENT (including MARKED PRESENT in remarks)
                    if (status === "PRESENT" || status.includes("MARKED PRESENT") || remarks.includes("MARKED PRESENT")) {
                      return null;
                    }
                    
                    // For all other statuses, show both
                    return (
                      <>
                        <div>
                          <span className="text-muted-foreground">In Time:</span>
                          <div className="font-medium text-foreground font-mono">
                            {selectedRecord.t_in || selectedRecord.result_t_in || "--:--"}
                          </div>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Out Time:</span>
                          <div className="font-medium text-foreground font-mono">
                            {selectedRecord.t_out || selectedRecord.result_t_out || "--:--"}
                          </div>
                        </div>
                      </>
                    );
                  })()}
                  <div>
                    <span className="text-muted-foreground">Branch:</span>
                    <div className="font-medium text-foreground">{selectedRecord.branch_code}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Entry Type:</span>
                    <div className="font-medium text-foreground">{selectedRecord.entry_type || "-"}</div>
                  </div>
                </div>
                <div className="pt-4 border-t border-border">
                  <Button
                    onClick={() => setHelpTicketOpen(true)}
                    variant="outline"
                    className="w-full"
                  >
                    <HelpCircle className="h-4 w-4 mr-2" />
                    Raise Help Ticket
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
        
        <HelpTicketForm
          open={helpTicketOpen}
          onOpenChange={setHelpTicketOpen}
          relatedData={selectedRecord ? {
            date: selectedRecord.dt,
            status: selectedRecord.STATUS,
            remarks: selectedRecord.status_remarks,
            inTime: selectedRecord.t_in || selectedRecord.result_t_in,
            outTime: selectedRecord.t_out || selectedRecord.result_t_out,
            branch: selectedRecord.branch_code,
            entryType: selectedRecord.entry_type,
            correctionReason: selectedRecord.CORRECTION_REASON,
            employeeName: selectedRecord.Name,
            cardNo: selectedRecord.card_no,
          } : undefined}
          defaultSubject={selectedRecord ? `Attendance Issue - ${selectedRecord.dt} (${selectedRecord.STATUS})` : ""}
        />
      </div>
    );
  }

  // Show team members list
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-indigo-500 flex items-center justify-center">
            <Users className="h-5 w-5 text-white" />
          </div>
          Team Task History
        </h1>
        <p className="text-slate-500 mt-1">
          Select a team member to view their work log and attendance
        </p>
      </div>

      {/* Stats Card */}
      <Card>
        <CardContent className="pt-6">
          <div className="text-2xl font-bold text-slate-800">{teamMembers.length}</div>
          <div className="text-sm text-slate-500">Total Team Members</div>
        </CardContent>
      </Card>

      {/* Search Member Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Search Member
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div className="space-y-2">
              <Label htmlFor="cardNumber">Card Number</Label>
              <Input
                id="cardNumber"
                placeholder="Enter member card number (e.g., 1001)"
                value={cardNumberFilter}
                onChange={(e) => setCardNumberFilter(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="month">Month</Label>
              <Select 
                value={selectedMonth} 
                onValueChange={(value) => {
                  const monthIndex = MONTHS.indexOf(value);
                  const newDate = new Date(Number(selectedYear), monthIndex, 1);
                  newDate.setHours(0, 0, 0, 0);
                  if (newDate >= minDate) {
                    setSelectedMonth(value);
                  }
                }}
              >
                <SelectTrigger id="month">
                  <SelectValue placeholder="Select month" />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((month, index) => {
                    const monthDate = new Date(Number(selectedYear), index, 1);
                    monthDate.setHours(0, 0, 0, 0);
                    const isDisabled = monthDate < minDate;
                    return (
                      <SelectItem key={month} value={month} disabled={isDisabled}>
                        {month}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="year">Year</Label>
              <Select 
                value={selectedYear} 
                onValueChange={(value) => {
                  const monthIndex = MONTHS.indexOf(selectedMonth);
                  const newDate = new Date(Number(value), monthIndex, 1);
                  newDate.setHours(0, 0, 0, 0);
                  if (newDate >= minDate) {
                    setSelectedYear(value);
                  } else {
                    // If selected month would be before min date, set to October
                    setSelectedYear(value);
                    if (Number(value) === 2025) {
                      setSelectedMonth("October");
                    }
                  }
                }}
              >
                <SelectTrigger id="year">
                  <SelectValue placeholder="Select year" />
                </SelectTrigger>
                <SelectContent>
                  {YEARS.map((year) => (
                    <SelectItem key={year} value={year.toString()}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="nameSearch">Search by Name</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  id="nameSearch"
                  placeholder="Search by name..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Team Members List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Team Members</CardTitle>
            {teamMembers.length > 0 && (
              <Badge variant="secondary" className="text-sm">
                {filteredMembers.length} of {teamMembers.length} members
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>

          {membersLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
              <span className="ml-3 text-slate-500">Loading team members...</span>
            </div>
          ) : membersError ? (
            <div className="text-center py-12 text-red-400">
              <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-lg font-medium">Error loading team members</p>
              <p className="text-sm mt-1">
                {membersError instanceof Error ? membersError.message : "Failed to fetch team members"}
              </p>
              <Button
                onClick={() => window.location.reload()}
                className="mt-4"
                variant="outline"
              >
                Retry
              </Button>
            </div>
          ) : filteredMembers.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-lg font-medium">
                {searchTerm || cardNumberFilter ? "No members found" : "No team members found"}
              </p>
              <p className="text-sm mt-1">
                {searchTerm || cardNumberFilter
                  ? "Try adjusting your search terms"
                  : "Team members under your management will appear here"}
              </p>
              {teamMembers.length > 0 && (searchTerm || cardNumberFilter) && (
                <p className="text-xs mt-2 text-slate-500">
                  Showing 0 of {teamMembers.length} team members (filtered)
                </p>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>S.No</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Card Number</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Designation</TableHead>
                    <TableHead>Org Unit</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMembers.map((member, index) => (
                    <TableRow key={member.id}>
                      <TableCell className="text-slate-500">
                        {index + 1}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">
                          {member.firstName} {member.lastName || ""}
                        </div>
                      </TableCell>
                      <TableCell>
                        {member.cardNumber ? (
                          <span className="font-mono text-sm">{member.cardNumber}</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {member.department ? (
                          <span className="text-slate-700">{member.department.name}</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {member.designation ? (
                          <span className="text-slate-700">{member.designation.name}</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {member.orgUnit ? (
                          <span className="text-slate-700">{member.orgUnit.name}</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          onClick={() => setSelectedMember(member)}
                          className="gap-2"
                        >
                          <Calendar className="h-4 w-4" />
                          View Work Log
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
