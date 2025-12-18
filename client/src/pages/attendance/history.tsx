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
  
  // MISS PENDING - White with special "today" indicator (using gray dot)
  if (s === "MISS PENDING" || s === "MISS PEND") {
    return { bgColor: "#ffffff", dots: [{ color: "#9ca3af", count: 1 }] };
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
  return { bgColor: "#9ca3af", dots: [] };
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
          <h1 className="text-2xl font-bold text-taupe">Task History</h1>
          <p className="text-grey_olive">View member work log records from BigQuery</p>
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
        <h1 className="text-2xl font-bold text-taupe">
          {isEmployee ? "My Work Log History" : "Task History"}
        </h1>
        <p className="text-grey_olive">
          {isEmployee ? "View your work log records" : "View member work log records by card number"}
        </p>
      </div>

      {/* Search Card - Only show for MDO users, employees auto-load their own data */}
      {!isEmployee && (
        <Card className="border-parchment bg-white shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <Search className="h-4 w-4" /> Search Member
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <Label htmlFor="cardNo" className="text-sm text-grey_olive">Card Number</Label>
                <div className="relative mt-1">
                  <Input
                    id="cardNo"
                    placeholder="Enter member card number (e.g., 1001)"
                    value={cardNo}
                    onChange={(e) => setCardNo(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSearch();
                    }}
                    className="pr-24"
                  />
                  <Button
                    size="sm"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-8 px-4 bg-blue-600 hover:bg-blue-700"
                    onClick={handleSearch}
                    disabled={!cardNo.trim()}
                  >
                    <Search className="h-4 w-4 mr-1" />
                    Search
                  </Button>
                </div>
              </div>

              <div className="flex gap-2">
                <div>
                  <Label className="text-sm text-grey_olive">Month</Label>
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
                  <Label className="text-sm text-grey_olive">Year</Label>
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
            </div>
          </CardContent>
        </Card>
      )}

      {/* Month/Year selector for employees - simplified */}
      {isEmployee && (
        <Card className="border-parchment bg-white shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-grey_olive font-medium">Select Period</span>
              <div className="flex gap-2">
                <Select value={String(selectedMonth)} onValueChange={(v) => setSelectedMonth(Number(v))}>
                  <SelectTrigger className="w-32">
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
                  <SelectTrigger className="w-24">
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
            <Card className="border-parchment bg-white shadow-sm">
              <CardContent className="p-4">
                <div className="flex flex-wrap items-center gap-6 text-sm">
                  <div>
                    <span className="text-grey_olive">Member:</span>
                    <span className="ml-2 font-medium text-taupe">{data.records[0].Name}</span>
                  </div>
                  <div>
                    <span className="text-grey_olive">Card No:</span>
                    <span className="ml-2 font-medium text-taupe">{data.records[0].card_no}</span>
                  </div>
                  <div>
                    <span className="text-grey_olive">Policy:</span>
                    <span className="ml-2 font-medium text-taupe">{data.records[0].POLICY_NAME}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {data?.records && (() => {
            const summary = calculateSummary(data.records);
            const totalAbsent = summary.absent + summary.doubleAbsent;
            return (
              <div className="grid grid-cols-4 gap-3">
                <Card className="border-gray-200 bg-gray-50">
                  <CardContent className="p-3 text-center">
                    <div className="text-2xl font-bold text-gray-700">{summary.total}</div>
                    <div className="text-xs text-gray-500">Total Days</div>
                  </CardContent>
                </Card>
                <Card style={{ backgroundColor: "#10b981", borderColor: "#10b981" }}>
                  <CardContent className="p-3 text-center">
                    <div className="text-2xl font-bold text-white">{summary.present}</div>
                    <div className="text-xs text-white/80">Present</div>
                  </CardContent>
                </Card>
                <Card style={{ backgroundColor: "#ef4444", borderColor: "#ef4444" }}>
                  <CardContent className="p-3 text-center">
                    <div className="text-2xl font-bold text-white">{totalAbsent}</div>
                    <div className="text-xs text-white/80">Absent</div>
                  </CardContent>
                </Card>
                <Card style={{ backgroundColor: "#eab308", borderColor: "#eab308" }}>
                  <CardContent className="p-3 text-center">
                    <div className="text-2xl font-bold text-white">{summary.halfDay}</div>
                    <div className="text-xs text-white/80">Half Day</div>
                  </CardContent>
                </Card>
              </div>
            );
          })()}

          <Card className="border-parchment bg-white shadow-sm">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-medium flex items-center gap-2">
                  <Calendar className="h-4 w-4" /> Calendar View
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="icon" onClick={handlePrevMonth}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="font-medium text-taupe min-w-32 text-center">
                    {MONTHS[selectedMonth]} {selectedYear}
                  </span>
                  <Button variant="outline" size="icon" onClick={handleNextMonth}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center h-64">
                  <Loader2 className="h-8 w-8 animate-spin text-grey_olive" />
                </div>
              ) : error ? (
                <div className="flex items-center justify-center h-64 text-red-500">
                  <AlertCircle className="h-5 w-5 mr-2" />
                  {(error as Error).message}
                </div>
              ) : data?.records?.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-grey_olive">
                  <AlertCircle className="h-8 w-8 mb-2 opacity-50" />
                  <p className="text-lg font-medium">No work log data for {MONTHS[selectedMonth]} {selectedYear}</p>
                  <p className="text-sm">Try selecting a different month</p>
                </div>
              ) : (
                <div className="grid grid-cols-7 gap-1">
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                    <div key={day} className="text-center text-sm font-medium text-grey_olive py-2">
                      {day}
                    </div>
                  ))}

                  {calendarGrid.map((cell, index) => {
                    if (cell.day === null) {
                      return <div key={index} className="h-14" />;
                    }

                    if (cell.isFuture) {
                      return (
                        <div key={index} className="h-14 border rounded-lg flex items-center justify-center bg-gray-100 opacity-50">
                          <span className="text-base font-semibold text-gray-400">{cell.day}</span>
                        </div>
                      );
                    }

                    if (!cell.record) {
                      return (
                        <div key={index} className="h-14 border rounded-lg flex items-center justify-center bg-gray-50">
                          <span className="text-base font-semibold text-gray-400">{cell.day}</span>
                        </div>
                      );
                    }

                    const style = getStatusStyle(cell.record.STATUS);
                    const isLightBg = style.bgColor === "#ffffff" || style.bgColor === "#f5f5f4";
                    const hasDots = style.dots.length > 0;
                    
                    return (
                      <div
                        key={index}
                        className="h-14 border rounded-lg flex flex-col items-center justify-center cursor-pointer hover:shadow-md hover:scale-105 transition-all relative"
                        style={{ backgroundColor: style.bgColor }}
                        onClick={() => openDetails(cell.record!)}
                      >
                        <span className={`text-base font-semibold ${isLightBg ? 'text-gray-700' : 'text-white'}`}>
                          {cell.day}
                        </span>
                        {hasDots && (
                          <div className="absolute bottom-1 left-0 right-0 flex justify-center gap-0.5">
                            {style.dots.flatMap((dot, dotIndex) =>
                              Array.from({ length: dot.count }, (_, i) => (
                                <div
                                  key={`${dotIndex}-${i}`}
                                  className="w-2 h-2 rounded-full"
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

              <div className="mt-6 flex flex-wrap gap-4 text-xs border-t pt-4">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded flex items-center justify-center" style={{ backgroundColor: "#10b981" }}>
                    <span className="text-white text-[10px] font-bold">1</span>
                  </div>
                  <span>Present</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded relative flex items-center justify-center" style={{ backgroundColor: "#10b981" }}>
                    <span className="text-white text-[10px] font-bold">1</span>
                    <div className="absolute bottom-0 w-1.5 h-1.5 rounded-full bg-white" />
                  </div>
                  <span>Present Late</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded relative flex items-center justify-center" style={{ backgroundColor: "#10b981" }}>
                    <span className="text-white text-[10px] font-bold">1</span>
                    <div className="absolute bottom-0 w-1.5 h-1.5 rounded-full bg-blue-500" />
                  </div>
                  <span>Early Out</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded flex items-center justify-center" style={{ backgroundColor: "#ef4444" }}>
                    <span className="text-white text-[10px] font-bold">1</span>
                  </div>
                  <span>Absent</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded relative flex items-center justify-center" style={{ backgroundColor: "#ef4444" }}>
                    <span className="text-white text-[10px] font-bold">1</span>
                    <div className="absolute bottom-0 flex gap-0.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-black" />
                      <div className="w-1.5 h-1.5 rounded-full bg-black" />
                    </div>
                  </div>
                  <span>Double Absent</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded flex items-center justify-center" style={{ backgroundColor: "#eab308" }}>
                    <span className="text-white text-[10px] font-bold">1</span>
                  </div>
                  <span>Half Day</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded relative flex items-center justify-center" style={{ backgroundColor: "#f97316" }}>
                    <span className="text-white text-[10px] font-bold">1</span>
                    <div className="absolute bottom-0 w-1.5 h-1.5 rounded-full bg-blue-500" />
                  </div>
                  <span>Miss In/Out</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded relative flex items-center justify-center" style={{ backgroundColor: "#ffffff", border: "1px solid #e5e7eb" }}>
                    <span className="text-gray-700 text-[10px] font-bold">1</span>
                    <div className="absolute bottom-0 w-1.5 h-1.5 rounded-full bg-gray-400" />
                  </div>
                  <span>Miss Pending</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Work Log Details</DialogTitle>
          </DialogHeader>
          {selectedRecord && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-grey_olive">Date:</span>
                  <div className="font-medium">{selectedRecord.dt}</div>
                </div>
                <div>
                  <span className="text-grey_olive">Status:</span>
                  <div>
                    <Badge 
                      style={{ 
                        backgroundColor: getStatusStyle(selectedRecord.STATUS).bgColor,
                        color: getStatusStyle(selectedRecord.STATUS).bgColor === "#ffffff" ? "#374151" : "#ffffff"
                      }}
                    >
                      {selectedRecord.STATUS}
                    </Badge>
                  </div>
                </div>
                <div>
                  <span className="text-grey_olive">Time In:</span>
                  <div className="font-medium">{selectedRecord.result_t_in || selectedRecord.t_in || "-"}</div>
                </div>
                <div>
                  <span className="text-grey_olive">Time Out:</span>
                  <div className="font-medium">{selectedRecord.result_t_out || selectedRecord.t_out || "-"}</div>
                </div>
                <div className="col-span-2">
                  <span className="text-grey_olive">Remarks:</span>
                  <div className="font-medium text-sm">{selectedRecord.status_remarks || "-"}</div>
                </div>
                {selectedRecord.CORRECTION_REASON && (
                  <div className="col-span-2">
                    <span className="text-grey_olive">Correction Reason:</span>
                    <div className="font-medium text-sm">{selectedRecord.CORRECTION_REASON}</div>
                  </div>
                )}
                <div>
                  <span className="text-grey_olive">Branch:</span>
                  <div className="font-medium">{selectedRecord.branch_code}</div>
                </div>
                <div>
                  <span className="text-grey_olive">Entry Type:</span>
                  <div className="font-medium">{selectedRecord.entry_type || "-"}</div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
