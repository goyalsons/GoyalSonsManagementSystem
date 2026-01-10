import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/lib/auth-context";
import { IndianRupee, User, Building2, Briefcase, Calendar, Calculator, FileText } from "lucide-react";

export default function SalaryPage() {
  const { user } = useAuth();

  // Sample data - replace with actual API data later
  const salaryData = {
    employeeName: user?.name || "John Doe",
    unit: "Unit A",
    department: "Sales",
    basicSalary: 50000,
    incentive: 10000,
    presentDays: 26,
    absentDays: 2,
    weeklyOff: 2,
    netSalary: 60000,
    deductions: {
      lateComing: 500,
      satSun: 500,
      esi: 200,
      pf: 200,
      longAdvanced: 300,
      currentAdvanced: 500,
    }
  };

  const totalDeductions = Object.values(salaryData.deductions).reduce((sum, val) => sum + val, 0);
  const totalReceivedSalary = salaryData.netSalary - totalDeductions;

  return (
    <div className="container mx-auto p-4 md:p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <IndianRupee className="h-8 w-8" />
          Salary Slip
        </h1>
        <p className="text-muted-foreground mt-1">View your monthly salary details</p>
      </div>

      <Card className="shadow-lg">
        <CardHeader className="bg-gradient-to-r from-primary/10 to-primary/5 border-b">
          <div className="flex items-center justify-between">
            <CardTitle className="text-2xl flex items-center gap-2">
              <FileText className="h-6 w-6" />
              Salary Bill
            </CardTitle>
            <Badge variant="outline" className="text-sm">
              {new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="p-6 space-y-6">
          {/* Employee Information */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-start gap-3 p-4 rounded-xl bg-muted/50">
              <User className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <p className="text-xs text-muted-foreground mb-1">Employee Name</p>
                <p className="font-semibold">{salaryData.employeeName}</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-4 rounded-xl bg-muted/50">
              <Building2 className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <p className="text-xs text-muted-foreground mb-1">Unit</p>
                <p className="font-semibold">{salaryData.unit}</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-4 rounded-xl bg-muted/50">
              <Briefcase className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <p className="text-xs text-muted-foreground mb-1">Department</p>
                <p className="font-semibold">{salaryData.department}</p>
              </div>
            </div>
          </div>

          <Separator />

          {/* Salary Details */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Calculator className="h-5 w-5" />
              Salary Details
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl border bg-card">
                <p className="text-sm text-muted-foreground mb-1">Basic Salary</p>
                <p className="text-2xl font-bold text-primary">
                  ₹{salaryData.basicSalary.toLocaleString('en-IN')}
                </p>
              </div>
              
              <div className="p-4 rounded-xl border bg-card">
                <p className="text-sm text-muted-foreground mb-1">Incentive</p>
                <p className="text-2xl font-bold text-green-600">
                  ₹{salaryData.incentive.toLocaleString('en-IN')}
                </p>
              </div>
            </div>

            {/* Attendance Details */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
              <div className="p-4 rounded-xl border bg-card">
                <div className="flex items-center gap-2 mb-2">
                  <Calendar className="h-4 w-4 text-green-600" />
                  <p className="text-sm text-muted-foreground">Present Days</p>
                </div>
                <p className="text-xl font-bold text-green-600">{salaryData.presentDays}</p>
              </div>
              
              <div className="p-4 rounded-xl border bg-card">
                <div className="flex items-center gap-2 mb-2">
                  <Calendar className="h-4 w-4 text-red-600" />
                  <p className="text-sm text-muted-foreground">Absent Days</p>
                </div>
                <p className="text-xl font-bold text-red-600">{salaryData.absentDays}</p>
              </div>
              
              <div className="p-4 rounded-xl border bg-card">
                <div className="flex items-center gap-2 mb-2">
                  <Calendar className="h-4 w-4 text-blue-600" />
                  <p className="text-sm text-muted-foreground">Weekly Off</p>
                </div>
                <p className="text-xl font-bold text-blue-600">{salaryData.weeklyOff}</p>
              </div>
            </div>

            <div className="p-4 rounded-xl border-2 border-primary bg-primary/5">
              <p className="text-sm text-muted-foreground mb-1">Net Salary</p>
              <p className="text-3xl font-bold text-primary">
                ₹{salaryData.netSalary.toLocaleString('en-IN')}
              </p>
            </div>
          </div>

          <Separator />

          {/* Deductions */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-red-600">Deductions</h3>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
                <span className="text-sm">Late Coming</span>
                <span className="font-semibold text-red-600">
                  ₹{salaryData.deductions.lateComing.toLocaleString('en-IN')}
                </span>
              </div>
              
              <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
                <span className="text-sm">Sat/Sun</span>
                <span className="font-semibold text-red-600">
                  ₹{salaryData.deductions.satSun.toLocaleString('en-IN')}
                </span>
              </div>
              
              <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
                <span className="text-sm">ESI</span>
                <span className="font-semibold text-red-600">
                  ₹{salaryData.deductions.esi.toLocaleString('en-IN')}
                </span>
              </div>
              
              <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
                <span className="text-sm">PF</span>
                <span className="font-semibold text-red-600">
                  ₹{salaryData.deductions.pf.toLocaleString('en-IN')}
                </span>
              </div>
              
              <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
                <span className="text-sm">Long Advanced</span>
                <span className="font-semibold text-red-600">
                  ₹{salaryData.deductions.longAdvanced.toLocaleString('en-IN')}
                </span>
              </div>
              
              <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
                <span className="text-sm">Current Advanced</span>
                <span className="font-semibold text-red-600">
                  ₹{salaryData.deductions.currentAdvanced.toLocaleString('en-IN')}
                </span>
              </div>
            </div>

            <div className="p-4 rounded-xl border-2 border-red-200 bg-red-50 dark:bg-red-950/20">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-red-700 dark:text-red-400">Total Deductions</span>
                <span className="text-2xl font-bold text-red-700 dark:text-red-400">
                  ₹{totalDeductions.toLocaleString('en-IN')}
                </span>
              </div>
            </div>
          </div>

          <Separator />

          {/* Total Received Salary */}
          <div className="p-6 rounded-xl border-2 border-green-500 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <IndianRupee className="h-8 w-8 text-green-600" />
                <div>
                  <p className="text-sm text-muted-foreground">Total Received Salary</p>
                  <p className="text-3xl font-bold text-green-700 dark:text-green-400">
                    ₹{totalReceivedSalary.toLocaleString('en-IN')}
                  </p>
                </div>
              </div>
              <Badge variant="outline" className="text-lg px-4 py-2 bg-green-100 dark:bg-green-900">
                Net Amount
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
