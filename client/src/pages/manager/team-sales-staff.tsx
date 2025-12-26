import React, { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth-context";
import { 
  Search, TrendingUp, TrendingDown, Calendar, 
  User, BarChart3, Store, Hash, Loader2,
  AlertCircle, RefreshCw
} from "lucide-react";
import { format } from "date-fns";

type Trend = "up" | "down" | "neutral";

interface StaffCard {
  smno: string;
  name: string;
  unit: string;
  todaySale: number;
  lastSale: number;
  lastLastSale: number;
  todayDate: string | null;
  lastDate: string | null;
  lastLastDate: string | null;
  totalSale: number;
  designation: { code: string; name: string } | null;
}

interface TableRow {
  brandType: string;
  quantity: number;
  netAmount: number;
}

interface SummaryData {
  success: boolean;
  cards: StaffCard[];
  table: {
    month: string | null;
    rows: TableRow[];
    grandTotal: number;
    grandQty: number;
  };
  dateRange: {
    from: string | null;
    to: string | null;
  };
  selectedSmno: string | null;
}

function getTrendMeta(current: number, previous: number) {
  const diff = current - previous;
  const trend: Trend = diff > 0 ? "up" : diff < 0 ? "down" : "neutral";
  const percent = previous ? (diff / previous) * 100 : null;
  return { trend, diff, percent };
}

function formatCurrency(value: number) {
  if (Math.abs(value) >= 10000000) {
    return `₹${(value / 10000000).toFixed(2)} Cr`;
  } else if (Math.abs(value) >= 100000) {
    return `₹${(value / 100000).toFixed(2)} L`;
  } else if (Math.abs(value) >= 1000) {
    return `₹${(value / 1000).toFixed(1)} K`;
  }
  return new Intl.NumberFormat("en-IN", { 
    style: "currency", 
    currency: "INR", 
    maximumFractionDigits: 0 
  }).format(value);
}

function formatMonthDisplay(monthKey: string | null): string {
  if (!monthKey) return "N/A";
  const [year, month] = monthKey.split("-");
  const date = new Date(parseInt(year), parseInt(month) - 1, 1);
  return format(date, "MMMM yyyy");
}

function SaleBlock({ 
  label, 
  value, 
  dateLabel, 
  variant = "default" 
}: { 
  label: string; 
  value: number; 
  dateLabel?: string | null; 
  variant?: "primary" | "secondary" | "default";
}) {
  const bgClass = variant === "primary" 
    ? "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white" 
    : variant === "secondary"
    ? "bg-gradient-to-br from-blue-500 to-blue-600 text-white"
    : "bg-slate-100 text-slate-800";
  
  const labelClass = variant === "default" ? "text-slate-500" : "text-white/80";
  
  return (
    <div className={`rounded-xl p-4 ${bgClass}`}>
      <div className="flex items-center justify-between mb-1">
        <p className={`text-xs font-medium uppercase tracking-wider ${labelClass}`}>{label}</p>
        {dateLabel && (
          <span className={`text-[10px] font-mono ${variant === "default" ? "text-slate-400 bg-slate-200" : "text-white/70 bg-white/20"} px-2 py-0.5 rounded-full`}>
            {dateLabel}
          </span>
        )}
      </div>
      <p className="text-xl font-bold">{formatCurrency(value)}</p>
    </div>
  );
}

function StaffCardCompact({ 
  card, 
  isSelected, 
  onClick 
}: { 
  card: StaffCard; 
  isSelected: boolean; 
  onClick: () => void;
}) {
  const { trend } = getTrendMeta(card.todaySale, card.lastSale);
  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : null;
  const trendColor = trend === "up" ? "text-emerald-500" : trend === "down" ? "text-red-500" : "text-slate-400";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.01 }}
      onClick={onClick}
      className={`bg-white rounded-xl border-2 p-4 cursor-pointer transition-all duration-200 ${
        isSelected 
          ? "border-indigo-500 shadow-lg shadow-indigo-100" 
          : "border-slate-200 hover:border-slate-300 hover:shadow-md"
      }`}
    >
      {/* Header Row */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`h-11 w-11 rounded-xl flex items-center justify-center text-white font-bold text-lg ${
            isSelected ? "bg-indigo-500" : "bg-slate-700"
          }`}>
            {card.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
              <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0 h-5 bg-slate-50">
                <Hash className="h-2.5 w-2.5 mr-0.5" />{card.smno}
              </Badge>
              {card.unit && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 bg-indigo-50 text-indigo-600 border-indigo-200">
                  <Store className="h-2.5 w-2.5 mr-0.5" />{card.unit}
                </Badge>
              )}
              {card.designation && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 bg-purple-50 text-purple-600 border-purple-200">
                  <User className="h-2.5 w-2.5 mr-0.5" />{card.designation.name}
                </Badge>
              )}
            </div>
            <h3 className="font-semibold text-slate-800 text-sm">{card.name}</h3>
          </div>
        </div>
        {TrendIcon && <TrendIcon className={`h-5 w-5 ${trendColor}`} />}
      </div>

      {/* Sales Grid */}
      <div className="grid grid-cols-3 gap-2">
        <SaleBlock label="Today" value={card.todaySale} dateLabel={card.todayDate} variant="primary" />
        <SaleBlock label="Last" value={card.lastSale} dateLabel={card.lastDate} variant="secondary" />
        <SaleBlock label="Prev" value={card.lastLastSale} dateLabel={card.lastLastDate} />
      </div>
    </motion.div>
  );
}

function DetailTable({ 
  card,
  month, 
  rows, 
  grandTotal,
  grandQty
}: { 
  card: StaffCard | null;
  month: string | null; 
  rows: TableRow[]; 
  grandTotal: number;
  grandQty: number;
}) {
  if (!card) {
    return (
      <div className="text-center py-16 text-slate-400">
        <User className="h-16 w-16 mx-auto mb-4 opacity-30" />
        <p className="text-lg font-medium">Select a staff member to view details</p>
      </div>
    );
  }

  const { trend, diff, percent } = getTrendMeta(card.todaySale, card.lastSale);
  const trendCopy = {
    up: "performing better than last recorded sale",
    down: "performing lower than last recorded sale",
    neutral: "matching the last recorded sale",
  }[trend];

  return (
    <div className="space-y-6">
      {/* Staff Info Header */}
      <div className="flex items-center gap-4 pb-4 border-b border-slate-200">
        <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-xl">
          {card.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1">
          <h3 className="text-xl font-bold text-slate-800">{card.name}</h3>
          <div className="flex items-center gap-3 text-sm text-slate-500 mt-1 flex-wrap">
            <span className="flex items-center gap-1">
              <Hash className="h-3.5 w-3.5" /> {card.smno}
            </span>
            {card.unit && (
              <span className="flex items-center gap-1">
                <Store className="h-3.5 w-3.5" /> {card.unit}
              </span>
            )}
            {card.designation && (
              <span className="flex items-center gap-1">
                <User className="h-3.5 w-3.5" /> {card.designation.name}
                <Badge variant="outline" className="text-xs px-1.5 py-0 h-4 bg-purple-50 text-purple-600 border-purple-200">
                  {card.designation.code}
                </Badge>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Month Header */}
      {month && (
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-indigo-500" />
          <span className="font-semibold text-lg text-slate-700">
            {formatMonthDisplay(month)}
          </span>
        </div>
      )}

      {/* Brand Breakdown Table */}
      {rows.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-slate-200">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50">
                <th className="text-left py-3.5 px-5 font-semibold text-slate-600 text-sm">
                  Brand Type
                </th>
                <th className="text-center py-3.5 px-5 font-semibold text-slate-600 text-sm">
                  Quantity
                </th>
                <th className="text-right py-3.5 px-5 font-semibold text-slate-600 text-sm">
                  Net Amount
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row, idx) => (
                <motion.tr 
                  key={row.brandType}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  className="hover:bg-slate-50/50"
                >
                  <td className="py-4 px-5">
                    <Badge 
                      className={`font-mono text-sm px-3 py-1 ${
                        row.brandType.includes("INH") 
                          ? "bg-emerald-100 text-emerald-700 border-emerald-200" 
                          : row.brandType.includes("SOR")
                          ? "bg-amber-100 text-amber-700 border-amber-200"
                          : "bg-slate-100 text-slate-700 border-slate-200"
                      }`}
                    >
                      {row.brandType}
                    </Badge>
                  </td>
                  <td className="py-4 px-5 text-center font-semibold text-slate-700 text-lg">
                    {row.quantity.toLocaleString("en-IN")}
                  </td>
                  <td className="py-4 px-5 text-right font-bold text-slate-800 text-lg">
                    {formatCurrency(row.netAmount)}
                  </td>
                </motion.tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gradient-to-r from-indigo-50 to-purple-50 border-t-2 border-indigo-200">
                <td className="py-4 px-5 font-bold text-indigo-700">
                  Grand Total
                </td>
                <td className="py-4 px-5 text-center font-bold text-indigo-700 text-lg">
                  {grandQty.toLocaleString("en-IN")}
                </td>
                <td className="py-4 px-5 text-right font-bold text-indigo-800 text-xl">
                  {formatCurrency(grandTotal)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <div className="text-center py-12 bg-slate-50 rounded-xl border border-slate-200">
          <BarChart3 className="h-12 w-12 mx-auto mb-3 text-slate-300" />
          <p className="text-slate-500">No detailed breakdown available for this period</p>
        </div>
      )}
    </div>
  );
}

export default function TeamSalesStaffPage() {
  const queryClient = useQueryClient();
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSmno, setSelectedSmno] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data, isLoading, isError, error } = useQuery<SummaryData>({
    queryKey: ["/api/manager/team/sales-staff", selectedSmno],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedSmno) params.set("smno", selectedSmno);
      const res = await fetch(`/api/manager/team/sales-staff?${params}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("gms_token")}` },
      });
      const result = await res.json();
      if (!res.ok || result.success === false) {
        throw new Error(result.message || `HTTP ${res.status}: Failed to load sales data`);
      }
      return result;
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
    retryDelay: 2000,
  });

  // Filter cards based on search query
  const filteredCards = useMemo(() => {
    if (!data?.cards) return [];
    if (!searchQuery.trim()) return data.cards;
    
    const query = searchQuery.toLowerCase().trim();
    return data.cards.filter(card => 
      card.smno.toLowerCase().includes(query) ||
      card.name.toLowerCase().includes(query) ||
      (card.unit && card.unit.toLowerCase().includes(query))
    );
  }, [data?.cards, searchQuery]);

  const summaryTotals = useMemo(() => {
    return filteredCards.reduce(
      (acc, card) => {
        acc.today += card.todaySale;
        acc.last += card.lastSale;
        acc.total += card.totalSale;
        return acc;
      },
      { today: 0, last: 0, total: 0 }
    );
  }, [filteredCards]);

  const handleSearch = () => {
    setSearchQuery(searchInput.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await queryClient.invalidateQueries({ 
        queryKey: ["/api/manager/team/sales-staff"] 
      });
    } catch (error: any) {
      console.error("Refresh error:", error);
      alert(`Failed to refresh: ${error.message}`);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Get selected card details
  const effectiveSelected = selectedSmno || data?.selectedSmno || null;
  const selectedCard = data?.cards?.find((c) => c.smno === effectiveSelected) || null;

  // Auto-select first filtered card if current selection is not in filtered list
  useEffect(() => {
    if (filteredCards.length > 0 && !effectiveSelected) {
      setSelectedSmno(filteredCards[0].smno);
    }
  }, [filteredCards, effectiveSelected]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-10 w-10 animate-spin text-indigo-500" />
          <p className="text-slate-500">Loading team sales staff data...</p>
        </div>
      </div>
    );
  }

  if (isError || data?.success === false) {
    const errorMessage = error instanceof Error 
      ? error.message 
      : (data?.success === false ? (data as any).message : "Team sales staff data is temporarily unavailable");
    
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md border-red-200 bg-red-50">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h3 className="font-semibold text-lg text-slate-800 mb-2">Unable to Load Data</h3>
            <p className="text-slate-600 mb-4">{errorMessage}</p>
            <Button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
              {isRefreshing ? "Refreshing..." : "Try Refresh"}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-indigo-500 flex items-center justify-center">
              <BarChart3 className="h-5 w-5 text-white" />
            </div>
            Team Sales Staff
          </h1>
          <p className="text-slate-500 mt-1">
            View and analyze your team's sales performance
          </p>
        </div>
        <Button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="bg-indigo-600 hover:bg-indigo-700 text-white"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
          {isRefreshing ? "Refreshing..." : "Refresh Data"}
        </Button>
      </div>

      {/* Search Bar */}
      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium flex items-center gap-2 text-slate-700">
            <Search className="h-4 w-4" /> Search Sales Staff
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <Label htmlFor="search" className="text-sm text-slate-500 mb-1.5 block">
                Card Number or Name
              </Label>
              <div className="relative">
                <Input
                  id="search"
                  placeholder="Enter card number (e.g., 5195) or name..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="pr-24 h-11"
                />
                <Button
                  size="sm"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 h-8 px-4 bg-indigo-600 hover:bg-indigo-700"
                  onClick={handleSearch}
                >
                  <Search className="h-4 w-4 mr-1.5" />
                  Search
                </Button>
              </div>
            </div>
          </div>
          {searchQuery && (
            <div className="mt-3 flex items-center gap-2 text-sm text-slate-500">
              <span>Showing results for:</span>
              <Badge variant="secondary" className="font-mono">
                {searchQuery}
              </Badge>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-6 px-2 text-xs"
                onClick={() => { setSearchInput(""); setSearchQuery(""); }}
              >
                Clear
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Summary Stats */}
      {data?.cards && data.cards.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card className="bg-emerald-500 border-emerald-500">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-white">
                {formatCurrency(summaryTotals.today)}
              </div>
              <div className="text-xs text-white/80">Today's Total</div>
            </CardContent>
          </Card>
          <Card className="bg-blue-500 border-blue-500">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-white">
                {formatCurrency(summaryTotals.last)}
              </div>
              <div className="text-xs text-white/80">Last Sale Total</div>
            </CardContent>
          </Card>
          <Card className="border-slate-200">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-slate-700">
                {formatCurrency(summaryTotals.total)}
              </div>
              <div className="text-xs text-slate-500">
                {data.dateRange?.from && data.dateRange?.to 
                  ? `${data.dateRange.from} to ${data.dateRange.to}`
                  : "Total Sales"
                }
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Staff Cards List */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
            <User className="h-4 w-4" />
            Staff Members ({filteredCards.length})
          </h2>
          
          {filteredCards.length === 0 ? (
            <Card className="border-slate-200">
              <CardContent className="py-12 text-center">
                <Search className="h-12 w-12 mx-auto mb-3 text-slate-300" />
                <p className="text-slate-500 font-medium">No staff found</p>
                <p className="text-slate-400 text-sm mt-1">
                  {searchQuery ? "Try a different search term" : "No sales data available for your team"}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
              {filteredCards.map((card) => (
                <StaffCardCompact
                  key={card.smno}
                  card={card}
                  isSelected={effectiveSelected === card.smno}
                  onClick={() => setSelectedSmno(card.smno)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Detail Panel */}
        <div>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2 mb-3">
            <BarChart3 className="h-4 w-4" />
            Sales Breakdown
          </h2>
          
          <Card className="border-slate-200 bg-white">
            <CardContent className="p-6">
              <AnimatePresence mode="wait">
                <motion.div
                  key={effectiveSelected || "empty"}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  <DetailTable
                    card={selectedCard}
                    month={data?.table?.month ?? null}
                    rows={data?.table?.rows ?? []}
                    grandTotal={data?.table?.grandTotal ?? 0}
                    grandQty={data?.table?.grandQty ?? 0}
                  />
                </motion.div>
              </AnimatePresence>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
