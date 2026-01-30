import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, ArrowLeft, Users, RefreshCw, AlertCircle, TrendingUp } from "lucide-react";
import { employeesApi } from "@/lib/api";
import { encodeFullName } from "@/lib/utils";
import SalesExcelPivotTable, { type SalesDataRow } from "@/components/SalesExcelPivotTable";
import { format } from "date-fns";

interface TeamMembersPageProps {
  manager: {
    mid: string;
    mcardno: string;
    mdepartmentIds: string[];
    mdesignationIds: string[];
    morgUnitIds: string[];
    mis_extinct: boolean;
  };
  departmentNames?: string;
  designationNames?: string;
  orgUnitNames?: string;
  onBack: () => void;
}

export default function TeamMembersPage({ 
  manager, 
  departmentNames, 
  designationNames, 
  orgUnitNames,
  onBack
}: TeamMembersPageProps) {
  const queryClient = useQueryClient();
  const [selectedMemberCardNo, setSelectedMemberCardNo] = useState<string>("");
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const YEARS = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

  // Fetch team members based on manager's scope (using arrays)
  // We need to fetch members that match ANY of the selected departments/designations/units
  const { data: response, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["team-members", manager.mid, manager.mdepartmentIds, manager.mdesignationIds, manager.morgUnitIds],
    queryFn: () => employeesApi.getAll({
      // Pass arrays as comma-separated for backend filtering
      departmentIds: manager.mdepartmentIds?.length > 0 ? manager.mdepartmentIds.join(",") : undefined,
      designationIds: manager.mdesignationIds?.length > 0 ? manager.mdesignationIds.join(",") : undefined,
      unitIds: manager.morgUnitIds?.length > 0 ? manager.morgUnitIds.join(",") : undefined,
      statusFilter: "active",
      limit: 10000, // Get all team members
    }),
  });

  const teamMembers = response?.data || [];
  const totalCount = response?.pagination?.total || teamMembers.length;
  const apiDisconnected = (response as any)?.apiDisconnected === true;
  const apiMessage = (response as any)?.message || "Please attach the employees data";

  const teamCardNos = useMemo(() => new Set(teamMembers.map((m: any) => m.cardNumber).filter(Boolean)), [teamMembers]);

  const { data: pivotResponse } = useQuery<{ success: boolean; data: SalesDataRow[]; lastApiHit?: string | null }>({
    queryKey: ["/api/sales/pivot"],
    queryFn: async () => {
      const res = await fetch("/api/sales/pivot", {
        headers: { "X-Session-Id": `${localStorage.getItem("gms_token") || ""}` },
      });
      const result = await res.json();
      if (!res.ok || result.success === false) throw new Error(result.message || "Failed to load pivot");
      return result;
    },
    refetchInterval: 5 * 60 * 1000,
  });

  const pivotData = pivotResponse?.data || [];
  const lastPivotRefresh = pivotResponse?.lastApiHit
    ? (() => {
        const d = new Date(pivotResponse.lastApiHit);
        return isNaN(d.getTime()) ? null : format(d, "dd MMM yyyy, hh:mm a");
      })()
    : null;
  const filteredPivotData = useMemo(
    () => pivotData.filter((row) => teamCardNos.has(String(row.smno))),
    [pivotData, teamCardNos]
  );

  const handleRefresh = () => {
    refetch();
  };

  const getFilterDescription = () => {
    const filters: string[] = [];
    if (manager.morgUnitIds?.length > 0 && orgUnitNames) {
      filters.push(`Org Units: ${orgUnitNames}`);
    }
    if (manager.mdepartmentIds?.length > 0 && departmentNames) {
      filters.push(`Departments: ${departmentNames}`);
    }
    if (manager.mdesignationIds?.length > 0 && designationNames) {
      filters.push(`Designations: ${designationNames}`);
    }
    if (filters.length === 0) {
      return "All active members";
    }
    return filters.join(" • ");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onBack}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-indigo-500 flex items-center justify-center">
                <Users className="h-5 w-5 text-white" />
              </div>
              Team Members
            </h1>
          </div>
          <p className="text-slate-500 mt-1">
            {getFilterDescription()}
          </p>
        </div>
      </div>

      {/* Stats Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-slate-800">{totalCount}</div>
            <div className="text-sm text-slate-500">Total Team Members</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-slate-600">
              Card: {manager.mcardno}
            </div>
            <div className="text-sm text-slate-500">Manager Card Number</div>
          </CardContent>
        </Card>
      </div>

      {/* Team Members Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Team Members List</CardTitle>
              <CardDescription>
                Members under this manager's scope
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isLoading || isFetching}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
            </div>
          ) : apiDisconnected || teamMembers.length === 0 ? (
            <div className="text-center py-12">
              <AlertCircle className="h-12 w-12 mx-auto mb-3 text-amber-500" />
              <p className="text-lg font-medium text-slate-700">0 Employees Found</p>
              <p className="text-sm mt-2 text-slate-500">
                {apiMessage}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                className="mt-4"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {teamMembers.map((member: any, index: number) => (
                    <TableRow key={member.id}>
                      <TableCell className="text-slate-500">
                        {index + 1}
                      </TableCell>
                      <TableCell className="font-medium">
                        {encodeFullName(member.firstName, member.lastName)}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {member.cardNumber || "—"}
                      </TableCell>
                      <TableCell>
                        {member.department ? (
                          <span className="text-slate-700">
                            {member.department.name}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {member.designation ? (
                          <span className="text-slate-700">
                            {member.designation.name}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {member.orgUnit ? (
                          <span className="text-slate-700">
                            {member.orgUnit.name}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Team Sales - same layout as Team Attendance: Select Team Member, Month, Year */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <CardTitle className="text-base font-medium flex items-center gap-2 text-slate-800">
                <TrendingUp className="h-4 w-4 text-indigo-500" />
                Team Sales
              </CardTitle>
              <CardDescription>View division-wise sales for a team member</CardDescription>
            </div>
            {lastPivotRefresh && (
              <span className="text-xs text-slate-500">Last Refresh: {lastPivotRefresh}</span>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <Label className="text-sm text-muted-foreground">Team Member</Label>
              <Select value={selectedMemberCardNo || "all"} onValueChange={(v) => setSelectedMemberCardNo(v === "all" ? "" : v)}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="-- Select a member --" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">-- Select a member --</SelectItem>
                  {teamMembers.map((member: any) => (
                    <SelectItem key={member.id} value={member.cardNumber || member.id}>
                      {encodeFullName(member.firstName, member.lastName)} ({member.cardNumber || "—"})
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
                    <SelectItem key={month} value={String(index)}>{month}</SelectItem>
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
                    <SelectItem key={year} value={String(year)}>{year}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-4">
            <SalesExcelPivotTable
              data={filteredPivotData}
              showSalesmanFilter={!selectedMemberCardNo}
              defaultSmno={selectedMemberCardNo ? parseInt(selectedMemberCardNo, 10) : null}
              employeeName={(() => {
                const m = teamMembers.find((x: any) => (x.cardNumber || x.id) === selectedMemberCardNo);
                return m ? encodeFullName(m.firstName, m.lastName) : "";
              })()}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

