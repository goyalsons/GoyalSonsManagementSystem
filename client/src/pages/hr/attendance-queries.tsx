import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Link } from "wouter";
import { ClipboardList, Loader2, ChevronRight } from "lucide-react";
import { getHrQueries } from "@/api/attendanceVerification.api";
import type { HrQueryBatch, HrStatus } from "@/api/attendanceVerification.types";

const HR_STATUSES: HrStatus[] = ["IN_PROGRESS", "NEED_INFO", "RESOLVED", "REJECTED"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function HrAttendanceQueriesPage() {
  const [monthFilter, setMonthFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [searchFilter, setSearchFilter] = useState("");

  const monthParam = useMemo(() => {
    if (!monthFilter) return undefined;
    const [y, m] = monthFilter.split("-").map(Number);
    if (isNaN(y) || isNaN(m)) return undefined;
    return `${y}-${String(m).padStart(2, "0")}`;
  }, [monthFilter]);

  const { data, isLoading } = useQuery({
    queryKey: ["hr-queries", monthParam, statusFilter || undefined, searchFilter.trim() || undefined],
    queryFn: () =>
      getHrQueries({
        month: monthParam,
        status: statusFilter || undefined,
        search: searchFilter.trim() || undefined,
      }),
    staleTime: 30_000, // 30s - reduce refetches when navigating back
  });

  const batches: HrQueryBatch[] = data?.batches ?? [];

  const currentYear = new Date().getFullYear();
  const monthOptions = useMemo(() => {
    const out: string[] = [];
    for (let y = currentYear; y >= currentYear - 2; y--) {
      for (let m = 1; m <= 12; m++) {
        out.push(`${y}-${m}`);
      }
    }
    return out;
  }, [currentYear]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-indigo-500 flex items-center justify-center">
            <ClipboardList className="h-5 w-5 text-white" />
          </div>
          Attendance Queries
        </h1>
        <p className="text-muted-foreground mt-1">HR dashboard: per-submission cards, resolve or reject tickets</p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          <div>
            <label className="text-sm text-muted-foreground block mb-1.5">Month</label>
            <Select value={monthFilter || "all"} onValueChange={(v) => setMonthFilter(v === "all" ? "" : v)}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="All months" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All months</SelectItem>
                {monthOptions.map((opt) => {
                  const [y, m] = opt.split("-").map(Number);
                  return (
                    <SelectItem key={opt} value={opt}>
                      {MONTHS[m - 1]} {y}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm text-muted-foreground block mb-1">Status</label>
            <Select value={statusFilter || "all"} onValueChange={(v) => setStatusFilter(v === "all" ? "" : v)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {HR_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm text-muted-foreground block mb-1">Search (name / card)</label>
            <Input
              placeholder="Search..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="w-48"
            />
          </div>
        </CardContent>
      </Card>

      {isLoading && (
        <div className="py-12 flex items-center justify-center gap-2">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="text-muted-foreground">Loading...</span>
        </div>
      )}

      {!isLoading && batches.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No submissions match the filters.
          </CardContent>
        </Card>
      )}

      {!isLoading && batches.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {batches.map((batch) => {
            const [y, m] = batch.monthStart.split("-").map(Number);
            const monthLabel = !isNaN(y) && !isNaN(m) ? `${MONTHS[m - 1]} ${y}` : batch.monthStart;
            const displayDate = batch.submittedAt ? batch.submittedAt.slice(0, 10) : batch.monthStart;
            return (
              <Card key={batch.id} className="flex flex-col min-h-[180px] w-full max-w-[280px]">
                <CardHeader className="flex-1 flex flex-col gap-3 py-4">
                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Manager:</span>{" "}
                      <strong className="block truncate">{batch.managerName}</strong>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Card No:</span>{" "}
                      <strong className="font-mono">{batch.managerCardNo}</strong>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Unit No:</span>{" "}
                      <strong>{batch.managerUnitNo}</strong>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Month:</span>{" "}
                      <strong>{monthLabel}</strong>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {displayDate} · {batch.tickets.length} item{batch.tickets.length !== 1 ? "s" : ""}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-auto gap-1.5 w-full"
                    asChild
                  >
                    <Link href={`/hr/attendance-queries/${batch.id}`}>
                      <ChevronRight className="h-4 w-4" />
                      Open
                    </Link>
                  </Button>
                </CardHeader>
              </Card>
            );
          })}
        </div>
      )}

    </div>
  );
}
