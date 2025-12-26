import { useQuery } from "@tanstack/react-query";
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
import { Loader2, ArrowLeft, Users } from "lucide-react";
import { employeesApi } from "@/lib/api";

interface TeamMembersPageProps {
  manager: {
    mid: string;
    mcardno: string;
    mdepartmentId: string | null;
    mdesignationId: string | null;
    morgUnitId: string | null;
    mis_extinct: boolean;
  };
  departmentName?: string;
  designationName?: string;
  orgUnitName?: string;
  onBack: () => void;
}

export default function TeamMembersPage({ 
  manager, 
  departmentName, 
  designationName, 
  orgUnitName,
  onBack
}: TeamMembersPageProps) {

  // Fetch team members based on manager's scope
  const { data: response, isLoading } = useQuery({
    queryKey: ["team-members", manager.mid, manager.mdepartmentId, manager.mdesignationId, manager.morgUnitId],
    queryFn: () => employeesApi.getAll({
      departmentId: manager.mdepartmentId || undefined,
      designationId: manager.mdesignationId || undefined,
      unitId: manager.morgUnitId || undefined,
      statusFilter: "active",
      limit: 10000, // Get all team members
    }),
  });

  const teamMembers = response?.data || [];
  const totalCount = response?.pagination?.total || teamMembers.length;

  const getFilterDescription = () => {
    const filters: string[] = [];
    if (manager.morgUnitId && orgUnitName) {
      filters.push(`Org Unit: ${orgUnitName}`);
    }
    if (manager.mdepartmentId && departmentName) {
      filters.push(`Department: ${departmentName}`);
    }
    if (manager.mdesignationId && designationName) {
      filters.push(`Designation: ${designationName}`);
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
          <CardTitle>Team Members List</CardTitle>
          <CardDescription>
            Members under this manager's scope
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
            </div>
          ) : teamMembers.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-lg font-medium">No team members found</p>
              <p className="text-sm mt-1">
                No members match the manager's assigned scope
              </p>
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
                        {member.firstName} {member.lastName || ""}
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

