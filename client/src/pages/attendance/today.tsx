import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchInput } from "@/components/ui/search-input";
import { Loader } from "@/components/ui/loader";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  Users, 
  UserCheck, 
  UserX, 
  Calendar, 
  Search, 
  RefreshCw,
  Clock,
  Percent,
  Building2,
  Filter,
} from "lucide-react";
import { 
  attendanceApi, 
  branchesApi, 
  departmentsApi, 
  designationsApi,
  TodayAttendanceRecord,
} from "@/lib/api";

export default function TodayAttendancePage() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [unitId, setUnitId] = useState<string>("");
  const [departmentId, setDepartmentId] = useState<string>("");
  const [designationId, setDesignationId] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data: branches } = useQuery({
    queryKey: ["branches"],
    queryFn: () => branchesApi.getAll(),
  });

  const { data: departments } = useQuery({
    queryKey: ["departments", unitId],
    queryFn: () => departmentsApi.getAll({ unitId: unitId || undefined }),
  });

  const { data: designations } = useQuery({
    queryKey: ["designations", unitId, departmentId],
    queryFn: () => designationsApi.getAll({ 
      unitId: unitId || undefined, 
      departmentId: departmentId || undefined 
    }),
  });

  const { data: attendanceData, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["attendance-today", unitId, departmentId, designationId, statusFilter],
    queryFn: () => attendanceApi.getToday({
      unitId: unitId || undefined,
      departmentId: departmentId || undefined,
      designationId: designationId || undefined,
      status: statusFilter || undefined,
      limit: 1000,
    }),
    refetchInterval: 60000,
  });

  const filteredData = attendanceData?.data?.filter((record: TodayAttendanceRecord) => {
    if (!debouncedSearch) return true;
    const searchLower = debouncedSearch.toLowerCase();
    return (
      record.firstName?.toLowerCase().includes(searchLower) ||
      record.lastName?.toLowerCase().includes(searchLower) ||
      record.cardNumber?.toLowerCase().includes(searchLower) ||
      record.phone?.includes(searchLower)
    );
  }) || [];

  const formatTime = (dateStr: string | null) => {
    if (!dateStr) return "-";
    const date = new Date(dateStr);
    return date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  };

  const getInitials = (firstName: string, lastName?: string | null) => {
    return `${firstName?.[0] || ""}${lastName?.[0] || ""}`.toUpperCase() || "?";
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-taupe">Today's Work Log</h1>
          <p className="text-grey_olive mt-1 flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            {attendanceData?.date ? formatDate(attendanceData.date) : "Loading..."}
          </p>
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-parchment bg-white shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-grey_olive">Total Employees</p>
                <p className="text-3xl font-bold text-taupe">{attendanceData?.summary?.total || 0}</p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-parchment flex items-center justify-center">
                <Users className="h-6 w-6 text-taupe" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-parchment bg-white shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-grey_olive">Present</p>
                <p className="text-3xl font-bold text-emerald-600">{attendanceData?.summary?.present || 0}</p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-emerald-50 flex items-center justify-center">
                <UserCheck className="h-6 w-6 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-parchment bg-white shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-grey_olive">Absent</p>
                <p className="text-3xl font-bold text-rose-600">{attendanceData?.summary?.absent || 0}</p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-rose-50 flex items-center justify-center">
                <UserX className="h-6 w-6 text-rose-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-parchment bg-white shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-grey_olive">Attendance Rate</p>
                <p className="text-3xl font-bold text-taupe">{attendanceData?.summary?.attendanceRate || 0}%</p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-parchment flex items-center justify-center">
                <Percent className="h-6 w-6 text-taupe" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-parchment bg-white shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Filter className="h-4 w-4" /> Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <SearchInput
              placeholder="Search by name, code, phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onSearch={() => setDebouncedSearch(search)}
            />

            <Select value={unitId || "all"} onValueChange={(val) => setUnitId(val === "all" ? "" : val)}>
              <SelectTrigger>
                <SelectValue placeholder="All Units" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Units</SelectItem>
                {branches?.map((branch) => (
                  <SelectItem key={branch.id} value={branch.id}>
                    {branch.name} ({branch.employeeCount || 0})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={departmentId || "all"} onValueChange={(val) => setDepartmentId(val === "all" ? "" : val)}>
              <SelectTrigger>
                <SelectValue placeholder="All Departments" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Departments</SelectItem>
                {departments?.map((dept) => (
                  <SelectItem key={dept.id} value={dept.id}>
                    {dept.name} ({dept.employeeCount || 0})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={designationId || "all"} onValueChange={(val) => setDesignationId(val === "all" ? "" : val)}>
              <SelectTrigger>
                <SelectValue placeholder="All Designations" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Designations</SelectItem>
                {designations?.map((desig) => (
                  <SelectItem key={desig.id} value={desig.id}>
                    {desig.name} ({desig.employeeCount || 0})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={statusFilter || "all"} onValueChange={(val) => setStatusFilter(val === "all" ? "" : val)}>
              <SelectTrigger>
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="present">Present</SelectItem>
                <SelectItem value="absent">Absent</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card className="border-parchment bg-white shadow-sm overflow-hidden">
        <CardContent className="p-0">
          <div className="max-h-[600px] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10">
                <TableRow className="bg-parchment">
                  <TableHead className="w-16 bg-parchment">#</TableHead>
                  <TableHead className="bg-parchment">Employee</TableHead>
                  <TableHead className="bg-parchment">Emp Code</TableHead>
                  <TableHead className="bg-parchment">Phone</TableHead>
                  <TableHead className="bg-parchment">Unit</TableHead>
                  <TableHead className="bg-parchment">Department</TableHead>
                  <TableHead className="text-center bg-parchment">Status</TableHead>
                  <TableHead className="bg-parchment">In Time</TableHead>
                  <TableHead className="bg-parchment">Out Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-12">
                      <div className="flex flex-col items-center gap-2">
                        <RefreshCw className="h-6 w-6 animate-spin text-grey_olive" />
                        <span className="text-grey_olive">Loading work log data...</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : filteredData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-12">
                      <div className="flex flex-col items-center gap-2">
                        <Users className="h-8 w-8 text-grey_olive" />
                        <span className="text-grey_olive">No work log records found</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredData.map((record: TodayAttendanceRecord, index: number) => (
                    <TableRow key={record.id} className="hover:bg-parchment/30 transition-colors">
                      <TableCell className="font-mono text-grey_olive">
                        {index + 1}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          {record.profileImageUrl ? (
                            <img 
                              src={record.profileImageUrl} 
                              alt={record.firstName}
                              className="h-10 w-10 rounded-full object-cover border-2 border-parchment"
                            />
                          ) : (
                            <div className="h-10 w-10 rounded-full bg-powder_blush flex items-center justify-center text-taupe font-medium">
                              {getInitials(record.firstName, record.lastName)}
                            </div>
                          )}
                          <div>
                            <p className="font-medium text-taupe">
                              {record.firstName} {record.lastName || ""}
                            </p>
                            {record.designation && (
                              <p className="text-xs text-grey_olive">{record.designation.name}</p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-sm bg-parchment px-2 py-1 rounded">
                          {record.cardNumber || "-"}
                        </span>
                      </TableCell>
                      <TableCell className="text-grey_olive">
                        {record.phone || "-"}
                      </TableCell>
                      <TableCell>
                        {record.unit ? (
                          <div className="flex items-center gap-1.5">
                            <Building2 className="h-3.5 w-3.5 text-grey_olive" />
                            <span className="text-sm">{record.unit.name}</span>
                          </div>
                        ) : "-"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {record.department?.name || "-"}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge 
                          variant="outline"
                          className={`font-medium ${
                            record.status === "present" 
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
                              : "bg-rose-50 text-rose-700 border-rose-200"
                          }`}
                        >
                          {record.status === "present" ? "Present" : "Absent"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {record.checkInAt ? (
                          <div className="flex items-center gap-1.5 text-sm">
                            <Clock className="h-3.5 w-3.5 text-emerald-600" />
                            <span className="font-mono">{formatTime(record.checkInAt)}</span>
                          </div>
                        ) : (
                          <span className="text-grey_olive">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {record.checkOutAt ? (
                          <div className="flex items-center gap-1.5 text-sm">
                            <Clock className="h-3.5 w-3.5 text-rose-600" />
                            <span className="font-mono">{formatTime(record.checkOutAt)}</span>
                          </div>
                        ) : (
                          <span className="text-grey_olive">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {filteredData.length > 0 && (
            <div className="px-6 py-3 border-t border-parchment bg-parchment/30">
              <p className="text-sm text-grey_olive">
                Showing {filteredData.length} of {attendanceData?.pagination?.total || filteredData.length} employees
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
