import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Calendar,
  Clock,
  Users,
  UserCheck,
  UserX,
  AlertCircle,
  ArrowUpCircle,
  ArrowDownCircle,
  RefreshCw,
  TrendingUp,
} from "lucide-react";
import { format } from "date-fns";
import { useAuth } from "@/lib/auth-context";

interface DashboardAttendanceRecord {
  id: string;
  cardNumber: string | null;
  firstName: string;
  lastName: string | null;
  unit: string | null;
  department: string | null;
  designation: string | null;
  status: "present" | "absent" | "mis" | "half";
  checkInAt: string | null;
  checkOutAt: string | null;
  attendanceStatus: string | null;
  isLate: boolean;
  isEarlyOut: boolean;
  dataSource: string;
}

interface DashboardData {
  date: string;
  dateType: "today" | "lastday";
  summary: {
    total: number;
    present: number;
    absent: number;
    mis: number;
    half: number;
    late: number;
    earlyOut: number;
  };
  data: DashboardAttendanceRecord[];
}

function getStatusBadge(status: string) {
  switch (status) {
    case "present":
      return (
        <Badge className="bg-emerald-500 text-white border-emerald-600">
          Present
        </Badge>
      );
    case "absent":
      return (
        <Badge className="bg-red-500 text-white border-red-600">
          Absent
        </Badge>
      );
    case "mis":
      return (
        <Badge className="bg-orange-500 text-white border-orange-600">
          Mis
        </Badge>
      );
    case "half":
      return (
        <Badge className="bg-yellow-500 text-white border-yellow-600">
          Half
        </Badge>
      );
    default:
      return (
        <Badge variant="outline">
          {status}
        </Badge>
      );
  }
}

export default function ManagerDashboard() {
  const { user } = useAuth();
  const [dateType, setDateType] = useState<"today" | "lastday">("today");

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<DashboardData>({
    queryKey: ["/api/manager/dashboard/attendance", dateType],
    queryFn: async () => {
      const token = localStorage.getItem("gms_token");
      const res = await fetch(`/api/manager/dashboard/attendance?dateType=${dateType}`, {
        headers: {
          "X-Session-Id": token,
          "Content-Type": "application/json",
        },
        credentials: "include",
      });
      const result = await res.json();
      if (!res.ok || !result.date) {
        throw new Error(result.message || `HTTP ${res.status}: Failed to load dashboard data`);
      }
      return result;
    },
    staleTime: 30000, // 30 seconds
    refetchInterval: 60000, // Refetch every minute
    retry: 1,
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        {/* Header Skeleton */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <Skeleton className="h-9 w-64 mb-2" />
            <Skeleton className="h-5 w-48" />
          </div>
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-32" />
            <Skeleton className="h-9 w-24" />
          </div>
        </div>

        {/* Summary Cards Skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="border-slate-200">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-8 w-16" />
                  </div>
                  <Skeleton className="h-10 w-10 rounded-xl" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Late/Early Indicators Skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card className="border-slate-200">
            <CardContent className="p-4">
              <Skeleton className="h-16 w-full" />
            </CardContent>
          </Card>
          <Card className="border-slate-200">
            <CardContent className="p-4">
              <Skeleton className="h-16 w-full" />
            </CardContent>
          </Card>
        </div>

        {/* Date Display Skeleton */}
        <Card className="border-slate-200">
          <CardHeader>
            <Skeleton className="h-5 w-32" />
          </CardHeader>
        </Card>

        {/* Table Skeleton */}
        <Card className="border-slate-200">
          <CardHeader>
            <Skeleton className="h-5 w-48" />
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Table Header */}
              <div className="grid grid-cols-4 gap-4 pb-2 border-b">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
              {/* Table Rows */}
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="grid grid-cols-4 gap-4">
                  {[1, 2, 3, 4].map((j) => (
                    <Skeleton key={j} className="h-16 w-full" />
                  ))}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isError || !data) {
    const errorMessage = error instanceof Error 
      ? error.message 
      : "Dashboard data is temporarily unavailable";
    
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md border-red-200 bg-red-50">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h3 className="font-semibold text-lg text-slate-800 mb-2">Unable to Load Data</h3>
            <p className="text-slate-600 mb-4">{errorMessage}</p>
            <Button onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const displayDate = data.date ? format(new Date(data.date + 'T00:00:00'), "dd MMM yyyy") : "-";
  const currentDateTime = format(new Date(), "dd MMM yyyy, hh:mm:ss a");

  // Group employees by status
  const employeesByStatus = {
    present: data.data.filter(emp => emp.status === "present"),
    absent: data.data.filter(emp => emp.status === "absent"),
    mis: data.data.filter(emp => emp.status === "mis"),
    half: data.data.filter(emp => emp.status === "half"),
  };

  // Get max length for equal column heights
  const maxLength = Math.max(
    employeesByStatus.present.length,
    employeesByStatus.absent.length,
    employeesByStatus.mis.length,
    employeesByStatus.half.length
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-indigo-500 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-white" />
            </div>
            Manager Dashboard
          </h1>
          <p className="text-slate-500 mt-1">
            Attendance overview for your team
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Date and Time Box */}
          <Card className="border-indigo-200 bg-indigo-50">
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-indigo-600" />
                <div>
                  <p className="text-xs font-medium text-indigo-800">Date: {displayDate}</p>
                  <p className="text-xs text-indigo-600 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {currentDateTime}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex items-center gap-2 bg-slate-100 rounded-lg p-1">
            <Button
              variant={dateType === "today" ? "default" : "ghost"}
              size="sm"
              onClick={() => setDateType("today")}
              className={dateType === "today" ? "bg-indigo-600 text-white" : ""}
            >
              Today
            </Button>
            <Button
              variant={dateType === "lastday" ? "default" : "ghost"}
              size="sm"
              onClick={() => setDateType("lastday")}
              className={dateType === "lastday" ? "bg-indigo-600 text-white" : ""}
            >
              Last Day
            </Button>
          </div>
          <Button
            variant="outline"
            onClick={() => refetch()}
            disabled={isFetching}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-emerald-500 to-emerald-600 border-emerald-600">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-emerald-100 text-sm font-medium">Present</p>
                <p className="text-3xl font-bold text-white mt-1">{data.summary.present}</p>
              </div>
              <UserCheck className="h-10 w-10 text-emerald-100" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-red-500 to-red-600 border-red-600">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-red-100 text-sm font-medium">Absent</p>
                <p className="text-3xl font-bold text-white mt-1">{data.summary.absent}</p>
              </div>
              <UserX className="h-10 w-10 text-red-100" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-orange-500 to-orange-600 border-orange-600">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-orange-100 text-sm font-medium">Mis</p>
                <p className="text-3xl font-bold text-white mt-1">{data.summary.mis}</p>
              </div>
              <AlertCircle className="h-10 w-10 text-orange-100" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-yellow-500 to-yellow-600 border-yellow-600">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-yellow-100 text-sm font-medium">Half</p>
                <p className="text-3xl font-bold text-white mt-1">{data.summary.half}</p>
              </div>
              <Clock className="h-10 w-10 text-yellow-100" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Late/Early Indicators */}
      {(data.summary.late > 0 || data.summary.earlyOut > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {data.summary.late > 0 && (
            <Card className="border-amber-200 bg-amber-50">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <ArrowUpCircle className="h-8 w-8 text-amber-600" />
                  <div>
                    <p className="text-sm font-medium text-amber-800">Late Arrivals</p>
                    <p className="text-2xl font-bold text-amber-900">{data.summary.late}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
          {data.summary.earlyOut > 0 && (
            <Card className="border-blue-200 bg-blue-50">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <ArrowDownCircle className="h-8 w-8 text-blue-600" />
                  <div>
                    <p className="text-sm font-medium text-blue-800">Early Departures</p>
                    <p className="text-2xl font-bold text-blue-900">{data.summary.earlyOut}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Attendance Table by Status */}
      <Card className="border-slate-200 bg-white">
        <CardHeader>
          <CardTitle className="text-base font-medium text-slate-700">
            Team Attendance ({data.summary.total} employees)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-center bg-emerald-50 border-emerald-200">
                    <div className="flex items-center justify-center gap-2">
                      <UserCheck className="h-4 w-4 text-emerald-600" />
                      <span className="font-semibold text-emerald-700">Present ({employeesByStatus.present.length})</span>
                    </div>
                  </TableHead>
                  <TableHead className="text-center bg-red-50 border-red-200">
                    <div className="flex items-center justify-center gap-2">
                      <UserX className="h-4 w-4 text-red-600" />
                      <span className="font-semibold text-red-700">Absent ({employeesByStatus.absent.length})</span>
                    </div>
                  </TableHead>
                  <TableHead className="text-center bg-orange-50 border-orange-200">
                    <div className="flex items-center justify-center gap-2">
                      <AlertCircle className="h-4 w-4 text-orange-600" />
                      <span className="font-semibold text-orange-700">Miss ({employeesByStatus.mis.length})</span>
                    </div>
                  </TableHead>
                  <TableHead className="text-center bg-yellow-50 border-yellow-200">
                    <div className="flex items-center justify-center gap-2">
                      <Clock className="h-4 w-4 text-yellow-600" />
                      <span className="font-semibold text-yellow-700">Half ({employeesByStatus.half.length})</span>
                    </div>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {maxLength === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-slate-500">
                      No attendance data available for this date
                    </TableCell>
                  </TableRow>
                ) : (
                  Array.from({ length: maxLength }).map((_, index) => (
                    <TableRow key={index}>
                      {/* Present Column */}
                      <TableCell className="align-top border-emerald-200 bg-emerald-50/30">
                        {employeesByStatus.present[index] ? (
                          <div className="py-2">
                            <div className="font-medium text-slate-800">
                              {employeesByStatus.present[index].firstName} {employeesByStatus.present[index].lastName || ""}
                            </div>
                            <div className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                              {employeesByStatus.present[index].cardNumber && (
                                <span className="font-mono">{employeesByStatus.present[index].cardNumber}</span>
                              )}
                              {employeesByStatus.present[index].isLate && (
                                <span className="text-amber-600 flex items-center gap-0.5">
                                  <ArrowUpCircle className="h-3 w-3" />
                                  Late
                                </span>
                              )}
                              {employeesByStatus.present[index].isEarlyOut && (
                                <span className="text-blue-600 flex items-center gap-0.5">
                                  <ArrowDownCircle className="h-3 w-3" />
                                  Early
                                </span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="py-2 text-slate-300">-</div>
                        )}
                      </TableCell>
                      
                      {/* Absent Column */}
                      <TableCell className="align-top border-red-200 bg-red-50/30">
                        {employeesByStatus.absent[index] ? (
                          <div className="py-2">
                            <div className="font-medium text-slate-800">
                              {employeesByStatus.absent[index].firstName} {employeesByStatus.absent[index].lastName || ""}
                            </div>
                            <div className="text-xs text-slate-500 mt-1">
                              {employeesByStatus.absent[index].cardNumber && (
                                <span className="font-mono">{employeesByStatus.absent[index].cardNumber}</span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="py-2 text-slate-300">-</div>
                        )}
                      </TableCell>
                      
                      {/* Miss Column */}
                      <TableCell className="align-top border-orange-200 bg-orange-50/30">
                        {employeesByStatus.mis[index] ? (
                          <div className="py-2">
                            <div className="font-medium text-slate-800">
                              {employeesByStatus.mis[index].firstName} {employeesByStatus.mis[index].lastName || ""}
                            </div>
                            <div className="text-xs text-slate-500 mt-1">
                              {employeesByStatus.mis[index].cardNumber && (
                                <span className="font-mono">{employeesByStatus.mis[index].cardNumber}</span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="py-2 text-slate-300">-</div>
                        )}
                      </TableCell>
                      
                      {/* Half Column */}
                      <TableCell className="align-top border-yellow-200 bg-yellow-50/30">
                        {employeesByStatus.half[index] ? (
                          <div className="py-2">
                            <div className="font-medium text-slate-800">
                              {employeesByStatus.half[index].firstName} {employeesByStatus.half[index].lastName || ""}
                            </div>
                            <div className="text-xs text-slate-500 mt-1">
                              {employeesByStatus.half[index].cardNumber && (
                                <span className="font-mono">{employeesByStatus.half[index].cardNumber}</span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="py-2 text-slate-300">-</div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

