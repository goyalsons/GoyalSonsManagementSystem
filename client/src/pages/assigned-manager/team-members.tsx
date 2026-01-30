import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, ArrowLeft, Users, RefreshCw, AlertCircle } from "lucide-react";
import { employeesApi } from "@/lib/api";
import { encodeFullName } from "@/lib/utils";

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
    </div>
  );
}

