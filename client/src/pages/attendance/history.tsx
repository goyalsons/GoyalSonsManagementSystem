import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { 
  Calendar, 
  Search, 
  ChevronLeft, 
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  XCircle,
  MinusCircle,
  Loader2
} from "lucide-react";
import { apiGet } from "@/lib/api";

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

interface ConfigResponse {
  configured: boolean;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const YEARS = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

interface StatusStyle {
  bgColor: string;
  dots: { color: string; count: number }[];
}

/**
 * Maps BigQuery STATUS field directly to visual style.
 * Exact mapping from user specification - NO client-side calculations.
 * Colors are determined ONLY by what BigQuery returns in the STATUS field.
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
  
  // PRESENT LATE EARLY_OUT - Green with blue dot (combined)
  if (s === "PRESENT LATE EARLY_OUT" || s === "PRESENT L") {
    return { bgColor: "#10b981", dots: [{ color: "#3b82f6", count: 1 }] };
  }
  
  // HALFDAY / HALF DAY - Yellow, NO dots
  if (s === "HALFDAY" || s === "HALF DAY") {
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
  
  // MISS PENDING - Semantic background with special "today" indicator
  if (s === "MISS PENDING" || s === "MISS PEND") {
    return { bgColor: "var(--muted)", dots: [{ color: "#9ca3af", count: 1 }] };
  }
  
  // LEAVE - Blue, NO dots
  if (s === "LEAVE") {
    return { bgColor: "#3b82f6", dots: [] };
  }
  
  // WEEKLY OFF - Purple, NO dots
  if (s === "WEEKLY OFF" || s === "WO") {
    return { bgColor: "#a855f7", dots: [] };
  }
  
  // Fallback patterns based on BigQuery STATUS content
  if (s.includes("PRESENT") && s.includes("LATE") && s.includes("EARLY")) {
    return { bgColor: "#10b981", dots: [{ color: "#3b82f6", count: 1 }] };
  }
  if (s.includes("PRESENT") && s.includes("LATE")) {
    return { bgColor: "#10b981", dots: [{ color: "#ffffff", count: 1 }] };
  }
  if (s.includes("PRESENT") && s.includes("EARLY")) {
    return { bgColor: "#10b981", dots: [{ color: "#3b82f6", count: 1 }] };
  }
  if (s.includes("PRESENT")) {
    return { bgColor: "#10b981", dots: [] };
  }
  if (s.includes("ABSENT")) {
    return { bgColor: "#ef4444", dots: [] };
  }
  if (s.includes("MISS")) {
    return { bgColor: "#f97316", dots: [] };
  }
  if (s.includes("HALF")) {
    return { bgColor: "#eab308", dots: [] };
  }
  
  // Unknown status - Gray
  return { bgColor: "var(--muted)", dots: [] };
}

/**
 * Calculate summary counts from BigQuery records based on STATUS field
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
    } else if (s === "ABSENT") {
      absent++;
    } else if (s.includes("PRESENT")) {
      present++;
    } else if (s === "HALFDAY" || s === "HALF DAY" || s.includes("HALF")) {
      halfDay++;
    } else if (s.includes("MISS")) {
      missInOut++;
    }
  });
  
  return { present, absent, doubleAbsent, halfDay, missInOut, total: records.length };
}

export default function AttendanceHistoryPage() {
  const { user, isEmployeeLogin } = useAuth();
  const isEmployee = isEmployeeLogin();
  const employeeCardNo = user?.employeeCardNo;
  
  const [cardNo, setCardNo] = useState("");
  const [searchCardNo, setSearchCardNo] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedRecord, setSelectedRecord] = useState<AttendanceRecord | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  // Auto-load employee's own data on mount
  useEffect(() => {
    if (isEmployee && employeeCardNo) {
      setCardNo(employeeCardNo);
      setSearchCardNo(employeeCardNo);
    }
  }, [isEmployee, employeeCardNo]);

  const monthDate = useMemo(() => {
    const month = String(selectedMonth + 1).padStart(2, "0");
    return `${selectedYear}-${month}-01`;
  }, [selectedMonth, selectedYear]);

  const { data: configData } = useQuery<ConfigResponse>({
    queryKey: ["attendance-history-config"],
    queryFn: () => apiGet("/attendance/history/config"),
  });

  const { data, isLoading, error } = useQuery<AttendanceResponse>({
    queryKey: ["attendance-history", searchCardNo, monthDate],
    queryFn: () => apiGet(`/attendance/history/${searchCardNo}?month=${monthDate}`),
    enabled: !!searchCardNo && configData?.configured,
    staleTime: 0,
    refetchOnMount: true,
  });

  const handleSearch = () => {
    if (cardNo.trim()) {
      setSearchCardNo(cardNo.trim());
    }
  };

  const recordsByDate = useMemo(() => {
    const map = new Map<string, AttendanceRecord>();
    if (data?.records) {
      data.records.forEach(record => {
        const dateStr = typeof record.dt === 'object' && record.dt !== null 
          ? (record.dt as any).value 
          : record.dt;
        map.set(dateStr, record);
      });
    }
    return map;
  }, [data?.records]);

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
      const record = recordsByDate.get(dateStr) || null;
      
      cells.push({ day, record, isFuture });
    }

    return cells;
  }, [selectedMonth, selectedYear, recordsByDate]);

  const handlePrevMonth = () => {
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

  const openDetails = (record: AttendanceRecord) => {
    setSelectedRecord(record);
    setDetailsOpen(true);
  };

  if (!configData?.configured) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Task History</h1>
          <p className="text-muted-foreground">View member work log records from BigQuery</p>
        </div>

        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="flex items-center gap-4 p-6">
            <AlertCircle className="h-8 w-8 text-amber-600" />
            <div>
              <h3 className="font-semibold text-amber-800">BigQuery Not Configured</h3>
              <p className="text-amber-700 text-sm">
                Please add your Google Cloud Service Account credentials as BIGQUERY_CREDENTIALS secret to enable work log history.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          {isEmployee ? "My Work Log History" : "Task History"}
        </h1>
        <p className="text-muted-foreground">
          {isEmployee ? "View your work log records" : "View member work log records by card number"}
        </p>
      </div>

      {/* Search Card - Only show for MDO users, employees auto-load their own data */}
      {!isEmployee && (
        <Card className="border-border bg-card shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-medium flex items-center gap-2 text-foreground">
              <Search className="h-4 w-4" /> Search Member
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <Label htmlFor="cardNo" className="text-sm text-muted-foreground">Card Number</Label>
                <div className="relative mt-1">
                  <Input
                    id="cardNo"
                    placeholder="Enter member card number (e.g., 1001)"
                    value={cardNo}
                    onChange={(e) => setCardNo(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSearch();
                    }}
                    className="pr-24 bg-background"
                  />
                  <Button
                    size="sm"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-8 px-4 bg-primary hover:bg-primary/90 text-primary-foreground"
                    onClick={handleSearch}
                    disabled={!cardNo.trim()}
                  >
                    <Search className="h-4 w-4 mr-1" />
                    Search
                  </Button>
                </div>
              </div>

              <div className="flex gap-2">
                <div className="flex-1 sm:flex-none">
                  <Label className="text-sm text-muted-foreground">Month</Label>
                  <Select value={String(selectedMonth)} onValueChange={(v) => setSelectedMonth(Number(v))}>
                    <SelectTrigger className="w-full sm:w-32 mt-1 bg-background">
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

                <div className="flex-1 sm:flex-none">
                  <Label className="text-sm text-muted-foreground">Year</Label>
                  <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
                    <SelectTrigger className="w-full sm:w-24 mt-1 bg-background">
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
            </div>
          </CardContent>
        </Card>
      )}

      {/* Month/Year selector for employees - simplified */}
      {isEmployee && (
        <Card className="border-border bg-card shadow-sm">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <span className="text-sm text-muted-foreground font-medium">Select Period</span>
              <div className="flex gap-2 w-full sm:w-auto">
                <Select value={String(selectedMonth)} onValueChange={(v) => setSelectedMonth(Number(v))}>
                  <SelectTrigger className="flex-1 sm:w-32 bg-background">
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
                <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
                  <SelectTrigger className="flex-1 sm:w-24 bg-background">
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
      )}

      {searchCardNo && (
        <>
          {data?.records?.[0] && (
            <Card className="border-border bg-card shadow-sm">
              <CardContent className="p-4">
                <div className="flex flex-wrap items-center gap-x-8 gap-y-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Member:</span>
                    <span className="ml-2 font-medium text-foreground">{data.records[0].Name}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Card No:</span>
                    <span className="ml-2 font-medium text-foreground">{data.records[0].card_no}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Policy:</span>
                    <span className="ml-2 font-medium text-foreground">{data.records[0].POLICY_NAME}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {data?.records && (() => {
            const summary = calculateSummary(data.records);
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

          <Card className="border-border bg-card shadow-sm">
            <CardHeader className="pb-4 px-4 sm:px-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <CardTitle className="text-base font-medium flex items-center gap-2 text-foreground">
                  <Calendar className="h-4 w-4" /> Calendar View
                </CardTitle>
                <div className="flex items-center justify-between sm:justify-end gap-2">
                  <Button variant="outline" size="icon" onClick={handlePrevMonth} className="h-8 w-8">
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
              {isLoading ? (
                <div className="flex items-center justify-center h-64">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : error ? (
                <div className="flex items-center justify-center h-64 text-rose-500">
                  <AlertCircle className="h-5 w-5 mr-2" />
                  {(error as Error).message}
                </div>
              ) : data?.records?.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                  <AlertCircle className="h-8 w-8 mb-2 opacity-50" />
                  <p className="text-lg font-medium">No work log data for {MONTHS[selectedMonth]} {selectedYear}</p>
                  <p className="text-sm">Try selecting a different month</p>
                </div>
              ) : (
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
              )}

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
        </>
      )}

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Work Log Details</DialogTitle>
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
                <div>
                  <span className="text-muted-foreground">Branch:</span>
                  <div className="font-medium text-foreground">{selectedRecord.branch_code}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Entry Type:</span>
                  <div className="font-medium text-foreground">{selectedRecord.entry_type || "-"}</div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
