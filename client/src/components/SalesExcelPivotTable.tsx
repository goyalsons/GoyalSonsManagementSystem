import { useMemo, useState, Fragment, useEffect } from "react";
import { format, parseISO } from "date-fns";
import { Calendar, ChevronDown, User, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface SalesDataRow {
  dat: string;           // Date (e.g., "2025-12-21")
  unit: string;
  smno: number;          // Salesman number
  sm: string;            // Salesman name
  divi: string;
  btype: "Y" | "N";
  qty: number;
  netsale: number;
}

interface PivotCell {
  qty: number;
  netsale: number;
}

interface SalesmanInfo {
  smno: number;
  sm: string;
}

interface SalesExcelPivotTableProps {
  data: SalesDataRow[];
  /** If true, shows salesman filter dropdown (for MDO). If false, uses defaultSmno to auto-filter. */
  showSalesmanFilter?: boolean;
  /** For employee mode: auto-filter by this smno (employee's card number) */
  defaultSmno?: number | null;
  /** Employee name to display when in employee mode */
  employeeName?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Formatters
// ─────────────────────────────────────────────────────────────────────────────

function formatINR(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatQty(value: number): string {
  return value.toLocaleString("en-IN");
}

function formatBrandType(btype: string): string {
  if (btype === "N") return "InHouse";
  if (btype === "Y") return "SOR";
  return btype; // Fallback for any other value
}

function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  
  // Handle "21-DEC-2025" format
  const match = dateStr.match(/^(\d{1,2})-([A-Z]{3})-(\d{4})$/i);
  if (match) {
    const months: Record<string, number> = {
      JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
      JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11
    };
    const day = parseInt(match[1], 10);
    const month = months[match[2].toUpperCase()];
    const year = parseInt(match[3], 10);
    if (month !== undefined) {
      return new Date(year, month, day);
    }
  }
  
  // Try ISO format
  try {
    const d = parseISO(dateStr);
    if (!isNaN(d.getTime())) return d;
  } catch {
    // ignore
  }
  
  return null;
}

function formatDateDisplay(dateStr: string): string {
  const d = parseDate(dateStr);
  if (d) {
    return format(d, "dd MMM yyyy");
  }
  return dateStr;
}

function sortDatesDescending(dates: string[]): string[] {
  return dates.sort((a, b) => {
    const dateA = parseDate(a);
    const dateB = parseDate(b);
    if (!dateA && !dateB) return 0;
    if (!dateA) return 1;
    if (!dateB) return -1;
    return dateB.getTime() - dateA.getTime(); // Descending (latest first)
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Aggregation Logic
// ─────────────────────────────────────────────────────────────────────────────

function buildPivotData(data: SalesDataRow[]) {
  const units = Array.from(new Set(data.map((d) => d.unit))).sort();
  const pivotMap = new Map<string, Map<string, Map<string, PivotCell>>>();
  const diviTotals = new Map<string, Map<string, PivotCell>>();
  const grandTotals = new Map<string, PivotCell>();
  units.forEach((u) => grandTotals.set(u, { qty: 0, netsale: 0 }));
  const grandTotal: PivotCell = { qty: 0, netsale: 0 };

  for (const row of data) {
    const { unit, divi, btype, qty, netsale } = row;

    if (!pivotMap.has(divi)) {
      pivotMap.set(divi, new Map());
      const unitMap = new Map<string, PivotCell>();
      units.forEach((u) => unitMap.set(u, { qty: 0, netsale: 0 }));
      diviTotals.set(divi, unitMap);
    }

    const btypeLevel = pivotMap.get(divi)!;
    if (!btypeLevel.has(btype)) {
      const unitMap = new Map<string, PivotCell>();
      units.forEach((u) => unitMap.set(u, { qty: 0, netsale: 0 }));
      btypeLevel.set(btype, unitMap);
    }

    const btypeCell = btypeLevel.get(btype)!.get(unit)!;
    btypeCell.qty += qty;
    btypeCell.netsale += netsale;

    const diviCell = diviTotals.get(divi)!.get(unit)!;
    diviCell.qty += qty;
    diviCell.netsale += netsale;

    const grandCell = grandTotals.get(unit)!;
    grandCell.qty += qty;
    grandCell.netsale += netsale;

    grandTotal.qty += qty;
    grandTotal.netsale += netsale;
  }

  const divis = Array.from(pivotMap.keys()).sort();
  return { units, divis, pivotMap, diviTotals, grandTotals, grandTotal };
}

function sumCells(cells: Iterable<PivotCell>): PivotCell {
  let qty = 0;
  let netsale = 0;
  const cellArray = Array.from(cells);
  for (let i = 0; i < cellArray.length; i++) {
    qty += cellArray[i].qty;
    netsale += cellArray[i].netsale;
  }
  return { qty, netsale };
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function SalesExcelPivotTable({ 
  data, 
  showSalesmanFilter = true,
  defaultSmno = null,
  employeeName = ""
}: SalesExcelPivotTableProps) {
  
  // Extract unique salesmen from data
  const availableSalesmen = useMemo(() => {
    const salesmenMap = new Map<number, string>();
    data.forEach((d) => {
      if (!salesmenMap.has(d.smno)) {
        salesmenMap.set(d.smno, d.sm);
      }
    });
    const salesmen: SalesmanInfo[] = [];
    salesmenMap.forEach((sm, smno) => {
      salesmen.push({ smno, sm });
    });
    return salesmen.sort((a, b) => a.sm.localeCompare(b.sm));
  }, [data]);

  // State for selected salesman
  // For employees (defaultSmno set), always use their smno
  // For MDO (showSalesmanFilter true), default to "all"
  const [selectedSmno, setSelectedSmno] = useState<number | "all">(
    defaultSmno !== null ? defaultSmno : "all"
  );

  // Update selectedSmno when defaultSmno changes (for employee mode)
  useEffect(() => {
    if (defaultSmno !== null) {
      setSelectedSmno(defaultSmno);
    }
  }, [defaultSmno]);

  // For employee mode, find their info from data
  const employeeInfo = useMemo(() => {
    if (defaultSmno === null) return null;
    const record = data.find(d => d.smno === defaultSmno);
    return record ? { smno: record.smno, sm: record.sm } : null;
  }, [data, defaultSmno]);

  // Extract unique dates from data (sorted descending - latest first)
  const availableDates = useMemo(() => {
    const uniqueDates = Array.from(new Set(data.map((d) => d.dat))).filter(d => d);
    return sortDatesDescending(uniqueDates);
  }, [data]);

  // State for selected date (default: "all" to show all dates)
  const [selectedDate, setSelectedDate] = useState<string>("all");

  // Filter data by selected salesman and date
  const filteredData = useMemo(() => {
    let result = data;
    
    // Filter by salesman
    if (selectedSmno !== "all") {
      result = result.filter((row) => row.smno === selectedSmno);
    }
    
    // Filter by date
    if (selectedDate !== "all") {
      result = result.filter((row) => row.dat === selectedDate);
    }
    
    return result;
  }, [data, selectedSmno, selectedDate]);

  // Get selected salesman info
  const selectedSalesmanInfo = useMemo(() => {
    if (selectedSmno === "all") return null;
    return availableSalesmen.find((s) => s.smno === selectedSmno) || null;
  }, [selectedSmno, availableSalesmen]);

  // Build pivot from filtered data
  const pivot = useMemo(() => buildPivotData(filteredData), [filteredData]);
  const { units, divis, pivotMap, diviTotals, grandTotals, grandTotal } = pivot;

  if (data.length === 0) {
    return (
      <div className="text-center py-12 text-slate-500 border border-slate-200 rounded-lg bg-slate-50">
        <Search className="h-10 w-10 mx-auto mb-3 text-slate-300" />
        <p className="font-medium">No sales data available</p>
        <p className="text-sm text-slate-400 mt-1">
          {defaultSmno 
            ? `No sales records found for card number ${defaultSmno}` 
            : "Sales data is not available at the moment"
          }
        </p>
      </div>
    );
  }

  // Check if viewing single salesman (either via filter or employee mode)
  const isViewingSingleSalesman = selectedSmno !== "all";
  const displayName = selectedSalesmanInfo?.sm || employeeName || "Unknown";

  return (
    <div className="space-y-4">
      {/* ─────────────────── Filters Row ─────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Salesman Filter - Only for MDO */}
          {showSalesmanFilter ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="flex items-center gap-2 min-w-[200px] justify-between">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-indigo-500" />
                    <span className="truncate max-w-[140px]">
                      {selectedSmno === "all" 
                        ? "All Salesmen" 
                        : `${selectedSalesmanInfo?.sm || "Unknown"}`
                      }
                    </span>
                  </div>
                  <ChevronDown className="h-4 w-4 text-slate-400 flex-shrink-0" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="max-h-[300px] overflow-y-auto w-[280px]">
                <DropdownMenuItem 
                  onClick={() => setSelectedSmno("all")}
                  className={selectedSmno === "all" ? "bg-indigo-50 text-indigo-700" : ""}
                >
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4" />
                    <span>All Salesmen</span>
                    <Badge variant="secondary" className="ml-auto text-xs">
                      {data.length}
                    </Badge>
                  </div>
                </DropdownMenuItem>
                {availableSalesmen.map((salesman) => {
                  const count = data.filter((d) => d.smno === salesman.smno).length;
                  return (
                    <DropdownMenuItem
                      key={salesman.smno}
                      onClick={() => setSelectedSmno(salesman.smno)}
                      className={selectedSmno === salesman.smno ? "bg-indigo-50 text-indigo-700" : ""}
                    >
                      <div className="flex items-center gap-2 w-full">
                        <Badge variant="outline" className="font-mono text-xs px-1.5">
                          {salesman.smno}
                        </Badge>
                        <span className="truncate flex-1">{salesman.sm}</span>
                        <Badge variant="secondary" className="text-xs">
                          {count}
                        </Badge>
                      </div>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            /* Employee Mode - Show their info as a badge */
            <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50 rounded-lg border border-indigo-200">
              <User className="h-4 w-4 text-indigo-600" />
              <span className="font-medium text-indigo-700">Your Sales</span>
              {defaultSmno && (
                <Badge variant="outline" className="font-mono text-xs bg-white">
                  {defaultSmno}
                </Badge>
              )}
              {(employeeInfo?.sm || employeeName) && (
                <span className="text-indigo-600 text-sm">- {employeeInfo?.sm || employeeName}</span>
              )}
            </div>
          )}

          {/* Date Filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="flex items-center gap-2 min-w-[180px] justify-between">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-indigo-500" />
                  <span>
                    {selectedDate === "all" 
                      ? "All Dates" 
                      : formatDateDisplay(selectedDate)
                    }
                  </span>
                </div>
                <ChevronDown className="h-4 w-4 text-slate-400" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-[300px] overflow-y-auto">
              <DropdownMenuItem 
                onClick={() => setSelectedDate("all")}
                className={selectedDate === "all" ? "bg-indigo-50 text-indigo-700" : ""}
              >
                All Dates ({filteredData.length > 0 ? data.filter(d => selectedSmno === "all" || d.smno === selectedSmno).length : data.length} records)
              </DropdownMenuItem>
              {availableDates.map((date) => {
                const count = data.filter((d) => d.dat === date && (selectedSmno === "all" || d.smno === selectedSmno)).length;
                if (count === 0) return null;
                return (
                  <DropdownMenuItem
                    key={date}
                    onClick={() => setSelectedDate(date)}
                    className={selectedDate === date ? "bg-indigo-50 text-indigo-700" : ""}
                  >
                    {formatDateDisplay(date)} ({count} records)
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
          
          {/* Clear Filters Button */}
          {(selectedDate !== "all" || (showSalesmanFilter && selectedSmno !== "all")) && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => {
                setSelectedDate("all");
                if (showSalesmanFilter) setSelectedSmno("all");
              }}
              className="text-xs text-slate-500"
            >
              Clear Filters
            </Button>
          )}
        </div>

        <div className="text-sm text-slate-500">
          Showing <span className="font-semibold text-slate-700">{filteredData.length}</span> records
          {isViewingSingleSalesman && (
            <span className="text-indigo-600 ml-1">for {displayName}</span>
          )}
        </div>
      </div>

      {/* ─────────────────── Pivot Table ─────────────────── */}
      {filteredData.length === 0 ? (
        <div className="text-center py-12 text-slate-500 border border-slate-200 rounded-lg bg-slate-50">
          <Search className="h-10 w-10 mx-auto mb-3 text-slate-300" />
          <p className="font-medium">No data found</p>
          <p className="text-sm text-slate-400 mt-1">
            {isViewingSingleSalesman 
              ? `No sales records for ${displayName}` 
              : "Try adjusting your filters"
            }
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-slate-300 rounded-lg">
          <table className="w-full border-collapse text-sm font-mono">
            <thead>
              <tr className="bg-slate-200">
                <th
                  rowSpan={2}
                  className="border border-slate-300 px-4 py-2.5 text-left font-bold text-slate-800 bg-slate-100 min-w-[180px]"
                >
                  Row Labels
                </th>
                {units.map((unit) => (
                  <th
                    key={unit}
                    colSpan={2}
                    className="border border-slate-300 px-3 py-2 text-center font-bold text-slate-800"
                  >
                    {unit}
                  </th>
                ))}
                <th
                  colSpan={2}
                  className="border border-slate-300 px-3 py-2 text-center font-bold text-slate-900 bg-amber-100"
                >
                  Grand Total
                </th>
              </tr>
              <tr className="bg-slate-100">
                {units.map((unit) => (
                  <Fragment key={unit}>
                    <th className="border border-slate-300 px-3 py-1.5 text-right text-xs font-semibold text-slate-600 whitespace-nowrap">
                      Sum of QTY
                    </th>
                    <th className="border border-slate-300 px-3 py-1.5 text-right text-xs font-semibold text-slate-600 whitespace-nowrap">
                      Sum of NETSALE
                    </th>
                  </Fragment>
                ))}
                <th className="border border-slate-300 px-3 py-1.5 text-right text-xs font-bold text-slate-700 whitespace-nowrap bg-amber-50">
                  Sum of QTY
                </th>
                <th className="border border-slate-300 px-3 py-1.5 text-right text-xs font-bold text-slate-700 whitespace-nowrap bg-amber-50">
                  Sum of NETSALE
                </th>
              </tr>
            </thead>
            <tbody>
              {divis.map((divi) => {
                const btypeMap = pivotMap.get(divi)!;
                const btypes = Array.from(btypeMap.keys()).sort();
                const diviUnitTotals = diviTotals.get(divi)!;
                const diviRowTotal = sumCells(diviUnitTotals.values());

                return (
                  <Fragment key={divi}>
                    <tr className="bg-slate-50 hover:bg-slate-100">
                      <td className="border border-slate-300 px-4 py-2 font-bold text-slate-800">
                        {divi}
                      </td>
                      {units.map((unit) => {
                        const cell = diviUnitTotals.get(unit) || { qty: 0, netsale: 0 };
                        return (
                          <Fragment key={unit}>
                            <td className="border border-slate-300 px-3 py-2 text-right font-semibold text-slate-700">
                              {formatQty(cell.qty)}
                            </td>
                            <td className="border border-slate-300 px-3 py-2 text-right font-semibold text-slate-700">
                              {formatINR(cell.netsale)}
                            </td>
                          </Fragment>
                        );
                      })}
                      <td className="border border-slate-300 px-3 py-2 text-right font-bold text-slate-800 bg-amber-50">
                        {formatQty(diviRowTotal.qty)}
                      </td>
                      <td className="border border-slate-300 px-3 py-2 text-right font-bold text-slate-800 bg-amber-50">
                        {formatINR(diviRowTotal.netsale)}
                      </td>
                    </tr>

                    {btypes.map((btype) => {
                      const unitCells = btypeMap.get(btype)!;
                      const rowTotal = sumCells(unitCells.values());

                      return (
                        <tr key={`${divi}-${btype}`} className="hover:bg-slate-50">
                          <td className="border border-slate-300 px-4 py-1.5 pl-10 text-slate-600">
                            {formatBrandType(btype)}
                          </td>
                          {units.map((unit) => {
                            const cell = unitCells.get(unit) || { qty: 0, netsale: 0 };
                            return (
                              <Fragment key={unit}>
                                <td className="border border-slate-300 px-3 py-1.5 text-right text-slate-600">
                                  {formatQty(cell.qty)}
                                </td>
                                <td className="border border-slate-300 px-3 py-1.5 text-right text-slate-600">
                                  {formatINR(cell.netsale)}
                                </td>
                              </Fragment>
                            );
                          })}
                          <td className="border border-slate-300 px-3 py-1.5 text-right text-slate-700 bg-amber-50/50">
                            {formatQty(rowTotal.qty)}
                          </td>
                          <td className="border border-slate-300 px-3 py-1.5 text-right text-slate-700 bg-amber-50/50">
                            {formatINR(rowTotal.netsale)}
                          </td>
                        </tr>
                      );
                    })}
                  </Fragment>
                );
              })}

              <tr className="bg-amber-100 font-bold">
                <td className="border border-slate-400 px-4 py-2.5 text-slate-900">
                  Grand Total
                </td>
                {units.map((unit) => {
                  const cell = grandTotals.get(unit) || { qty: 0, netsale: 0 };
                  return (
                    <Fragment key={unit}>
                      <td className="border border-slate-400 px-3 py-2.5 text-right text-slate-900">
                        {formatQty(cell.qty)}
                      </td>
                      <td className="border border-slate-400 px-3 py-2.5 text-right text-slate-900">
                        {formatINR(cell.netsale)}
                      </td>
                    </Fragment>
                  );
                })}
                <td className="border border-slate-400 px-3 py-2.5 text-right text-slate-900 bg-amber-200">
                  {formatQty(grandTotal.qty)}
                </td>
                <td className="border border-slate-400 px-3 py-2.5 text-right text-slate-900 bg-amber-200">
                  {formatINR(grandTotal.netsale)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
