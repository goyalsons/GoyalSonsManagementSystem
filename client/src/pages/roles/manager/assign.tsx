import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, ArrowLeft, User, Building2, Briefcase, CheckCircle2, AlertCircle } from "lucide-react";
import { managerApi, branchesApi, departmentsApi } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

export default function AssignManagerPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [cardNumber, setCardNumber] = useState("");
  const [searchCardNumber, setSearchCardNumber] = useState("");
  const [selectedUnitId, setSelectedUnitId] = useState<string>("");
  const [selectedDepartmentIds, setSelectedDepartmentIds] = useState<string[]>([]);
  
  // Fetch employee by card number - auto-search on debounce
  const { data: employeeData, isLoading: loadingEmployee, error: employeeError } = useQuery({
    queryKey: ["employee-by-card", searchCardNumber],
    queryFn: () => managerApi.getEmployeeByCard(searchCardNumber),
    enabled: !!searchCardNumber && searchCardNumber.trim() !== "",
    retry: false,
  });

  // Fetch branches/units
  const { data: branches = [] } = useQuery({
    queryKey: ["branches"],
    queryFn: () => branchesApi.getAll(),
  });

  // Fetch departments (filtered by selected unit)
  const { data: departments = [] } = useQuery({
    queryKey: ["departments", selectedUnitId],
    queryFn: () => departmentsApi.getAll({ unitId: selectedUnitId || undefined }),
    enabled: !!selectedUnitId,
  });

  // Assign manager mutation
  const assignManagerMutation = useMutation({
    mutationFn: (data: { cardNumber: string; orgUnitId: string; departmentIds: string[] }) =>
      managerApi.assignManager(data),
    onSuccess: (data) => {
      toast({
        title: "Manager Assigned Successfully",
        description: data.message || "Manager has been assigned successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      // Reset form
      setCardNumber("");
      setSearchCardNumber("");
      setSelectedUnitId("");
      setSelectedDepartmentIds([]);
    },
    onError: (error: Error) => {
      toast({
        title: "Assignment Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSearch = () => {
    if (cardNumber.trim()) {
      setSearchCardNumber(cardNumber.trim());
    } else {
      setSearchCardNumber("");
    }
  };

  // Auto-search when card number is entered (debounced)
  const handleCardNumberChange = (value: string) => {
    setCardNumber(value);
    // Clear previous search if input is cleared
    if (!value.trim()) {
      setSearchCardNumber("");
    }
  };

  // Trigger search on Enter key or when user stops typing
  const handleCardNumberBlur = () => {
    if (cardNumber.trim()) {
      setSearchCardNumber(cardNumber.trim());
    }
  };

  const handleUnitChange = (unitId: string) => {
    setSelectedUnitId(unitId);
    setSelectedDepartmentIds([]); // Reset departments when unit changes
  };

  const handleDepartmentToggle = (deptId: string) => {
    setSelectedDepartmentIds((prev) =>
      prev.includes(deptId)
        ? prev.filter((id) => id !== deptId)
        : [...prev, deptId]
    );
  };

  const handleSubmit = () => {
    if (!searchCardNumber) {
      toast({
        title: "Validation Error",
        description: "Please search for an employee first",
        variant: "destructive",
      });
      return;
    }

    if (!selectedUnitId) {
      toast({
        title: "Validation Error",
        description: "Please select a unit",
        variant: "destructive",
      });
      return;
    }

    if (selectedDepartmentIds.length === 0) {
      toast({
        title: "Validation Error",
        description: "Please select at least one department",
        variant: "destructive",
      });
      return;
    }

    assignManagerMutation.mutate({
      cardNumber: searchCardNumber,
      orgUnitId: selectedUnitId,
      departmentIds: selectedDepartmentIds,
    });
  };

  const employee = employeeData?.data;
  const hasError = employeeError || (employeeData && !employeeData.success);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setLocation("/roles")}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Assign Manager
          </h1>
          <p className="text-muted-foreground mt-1">
            Assign an employee as a manager for specific units and departments
          </p>
        </div>
      </div>

      {/* Card Number Input */}
      <Card className="border-border bg-card shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <User className="h-4 w-4" />
            Search Employee
          </CardTitle>
          <CardDescription>
            Enter the employee's card number to fetch their details
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <Label htmlFor="cardNumber">Card Number</Label>
              <Input
                id="cardNumber"
                placeholder="Enter card number (e.g., 1001)"
                value={cardNumber}
                onChange={(e) => handleCardNumberChange(e.target.value)}
                onBlur={handleCardNumberBlur}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleSearch();
                  }
                }}
                className="mt-1"
                required
              />
            </div>
            <div className="flex items-end">
              <Button
                onClick={handleSearch}
                disabled={!cardNumber.trim() || loadingEmployee}
                className="w-full sm:w-auto"
              >
                {loadingEmployee ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Searching...
                  </>
                ) : (
                  "Search"
                )}
              </Button>
            </div>
          </div>

          {/* Employee Preview */}
          {loadingEmployee && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {hasError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-1">
                  <p>{employeeData?.message || (employeeError as Error)?.message || "Employee not found"}</p>
                  <p className="text-xs opacity-90 mt-2">
                    Tip: Make sure the card number is correct. You can also check the employee list to verify card numbers.
                  </p>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {employee && (
            <div className="p-4 rounded-lg bg-muted/50 border border-border">
              <div className="flex items-start gap-4">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold">
                  {employee.firstName[0]}{employee.lastName?.[0] || ""}
                </div>
                <div className="flex-1 space-y-2">
                  <div>
                    <p className="font-semibold text-foreground">
                      {employee.firstName} {employee.lastName || ""}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Card: {employee.cardNumber}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3 text-sm">
                    {employee.designation && (
                      <div className="flex items-center gap-1.5">
                        <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-foreground">{employee.designation.name}</span>
                      </div>
                    )}
                    {employee.orgUnit && (
                      <div className="flex items-center gap-1.5">
                        <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-foreground">{employee.orgUnit.name}</span>
                      </div>
                    )}
                  </div>
                </div>
                <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Assignment Form */}
      {employee && (
        <Card className="border-border bg-card shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Manager Assignment
            </CardTitle>
            <CardDescription>
              Select the unit and departments this manager will oversee
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Unit Selection */}
            <div className="space-y-2">
              <Label htmlFor="unit">Unit <span className="text-destructive">*</span></Label>
              <Select value={selectedUnitId} onValueChange={handleUnitChange}>
                <SelectTrigger id="unit" className="bg-background">
                  <SelectValue placeholder="Select a unit" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((branch) => (
                    <SelectItem key={branch.id} value={branch.id}>
                      {branch.name} ({branch.employeeCount || 0} employees)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Department Multi-Select */}
            {selectedUnitId && (
              <div className="space-y-3">
                <Label>
                  Departments <span className="text-destructive">*</span>
                </Label>
                {departments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No departments available for the selected unit
                  </p>
                ) : (
                  <div className="space-y-2 max-h-[300px] overflow-y-auto border border-border rounded-lg p-3 bg-muted/30">
                    {departments.map((dept) => (
                      <div
                        key={dept.id}
                        className="flex items-center space-x-2 p-2 rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        <Checkbox
                          id={`dept-${dept.id}`}
                          checked={selectedDepartmentIds.includes(dept.id)}
                          onCheckedChange={() => handleDepartmentToggle(dept.id)}
                        />
                        <Label
                          htmlFor={`dept-${dept.id}`}
                          className="flex-1 cursor-pointer font-normal"
                        >
                          {dept.name}
                          {dept.employeeCount !== undefined && (
                            <span className="text-muted-foreground ml-2">
                              ({dept.employeeCount} employees)
                            </span>
                          )}
                        </Label>
                      </div>
                    ))}
                  </div>
                )}
                {selectedDepartmentIds.length > 0 && (
                  <p className="text-sm text-muted-foreground">
                    {selectedDepartmentIds.length} department(s) selected
                  </p>
                )}
              </div>
            )}

            {/* Submit Button */}
            <div className="flex justify-end gap-3 pt-4 border-t border-border">
              <Button
                variant="outline"
                onClick={() => {
                  setCardNumber("");
                  setSearchCardNumber("");
                  setSelectedUnitId("");
                  setSelectedDepartmentIds([]);
                }}
              >
                Reset
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={
                  !selectedUnitId ||
                  selectedDepartmentIds.length === 0 ||
                  assignManagerMutation.isPending
                }
              >
                {assignManagerMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Assigning...
                  </>
                ) : (
                  "Assign Manager"
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

