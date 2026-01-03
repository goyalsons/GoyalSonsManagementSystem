import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Store, ArrowLeft, Briefcase, Award, Calendar, ChevronRight
} from "lucide-react";
import { format } from "date-fns";
import { encodeName } from "@/lib/utils";

interface DepartmentData {
  success: boolean;
  unit: string;
  departments: Array<{
    name: string;
    totalSale: number;
    inhouseSale: number;
    staffCount: number;
  }>;
}

interface StaffData {
  success: boolean;
  staff: Array<{
    smno: string;
    name: string;
    email: string;
    unit: string;
    department: string;
    totalSale: number;
    inhouseSale: number;
    presentDays: number;
    dailySale: number;
    performance: 'high' | 'average' | 'low';
    isNegative: boolean;
    brandList: Array<{ name: string; sale: number; inhouse: number }>;
    lastUpdated: string;
  }>;
}

const GLASS_STYLE = "backdrop-blur-xl bg-card/70 border border-border shadow-xl";

function formatCurrency(value: number) {
  if (Math.abs(value) >= 10000000) {
    return `₹${(value / 10000000).toFixed(2)}Cr`;
  } else if (Math.abs(value) >= 100000) {
    return `₹${(value / 100000).toFixed(2)}L`;
  }
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);
}

function StaffRow({ staff, isExpanded, onToggle }: { staff: StaffData['staff'][0]; isExpanded: boolean; onToggle: () => void }) {
  const performanceColors = { 
    high: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-500/10 dark:text-green-400 dark:border-green-500/20', 
    average: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20', 
    low: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20' 
  };
  
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={`${GLASS_STYLE} rounded-xl overflow-hidden ${staff.isNegative ? 'border-red-300 dark:border-red-500/50 bg-red-50/50 dark:bg-red-500/5' : ''}`}
    >
      <div 
        onClick={onToggle}
        className="p-4 cursor-pointer hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`h-10 w-10 rounded-full flex items-center justify-center text-white font-bold ${staff.performance === 'high' ? 'bg-green-500' : staff.performance === 'average' ? 'bg-amber-500' : 'bg-red-500'}`}>
              {staff.name.charAt(0)}
            </div>
            <div>
              <p className="font-medium text-foreground">{encodeName(staff.name)}</p>
              <p className="text-xs text-muted-foreground">{staff.department}</p>
            </div>
          </div>
          <div className="text-right">
            <p className={`font-bold ${staff.isNegative ? 'text-red-600 dark:text-red-400' : 'text-green-700 dark:text-green-400'}`}>
              {formatCurrency(staff.totalSale)}
              {staff.isNegative && <span className="text-xs ml-1" title="Return / Adjustment">⚠️</span>}
            </p>
            <Badge className={`text-xs ${performanceColors[staff.performance]}`}>
              {staff.performance === 'high' ? 'Top Performer' : staff.performance === 'average' ? 'Average' : 'Needs Attention'}
            </Badge>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4 mt-3 text-sm">
          <div><span className="text-muted-foreground">In-House:</span> <span className="font-medium text-foreground">{formatCurrency(staff.inhouseSale)}</span></div>
          <div><span className="text-muted-foreground">Days:</span> <span className="font-medium text-foreground">{staff.presentDays}</span></div>
          <div><span className="text-muted-foreground">Daily Avg:</span> <span className="font-medium text-foreground">{formatCurrency(staff.dailySale)}</span></div>
        </div>
      </div>
      
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-border bg-muted/30"
          >
            <div className="p-4">
              <h4 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                <Award className="h-4 w-4" /> Brand Breakdown
              </h4>
              <div className="space-y-2">
                {staff.brandList.map((brand, idx) => (
                  <div key={idx} className="flex justify-between items-center text-sm p-2 bg-muted/50 rounded-lg">
                    <Badge variant="outline">{brand.name}</Badge>
                    <div className="flex gap-4">
                      <span className={brand.sale < 0 ? 'text-red-600 dark:text-red-400' : 'text-foreground'}>Sale: {formatCurrency(brand.sale)}</span>
                      <span className="text-muted-foreground">In-House: {formatCurrency(brand.inhouse)}</span>
                    </div>
                  </div>
                ))}
              </div>
              {staff.lastUpdated && (
                <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
                  <Calendar className="h-3 w-3" /> Last updated: {format(new Date(staff.lastUpdated), 'MMM dd, yyyy')}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function SalesUnitPage() {
  const [, params] = useRoute("/sales/unit/:unitName");
  const [, setLocation] = useLocation();
  const unitName = params?.unitName ? decodeURIComponent(params.unitName) : '';
  const [selectedDepartment, setSelectedDepartment] = useState<string | null>(null);
  const [expandedStaff, setExpandedStaff] = useState<string | null>(null);

  const { data: departmentData, isLoading: loadingDepts } = useQuery<DepartmentData>({
    queryKey: ['/api/sales/units', unitName, 'departments'],
    queryFn: async () => {
      const res = await fetch(`/api/sales/units/${encodeURIComponent(unitName)}/departments`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('gms_token')}` }
      });
      return res.json();
    },
    enabled: !!unitName,
    staleTime: 5 * 60 * 1000,
  });

  const { data: staffData, isLoading: loadingStaff } = useQuery<StaffData>({
    queryKey: ['/api/sales/staff', unitName, selectedDepartment],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('unit', unitName);
      if (selectedDepartment) params.set('department', selectedDepartment);
      const res = await fetch(`/api/sales/staff?${params}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('gms_token')}` }
      });
      return res.json();
    },
    enabled: !!unitName && !!selectedDepartment,
    staleTime: 5 * 60 * 1000,
  });

  return (
    <div className="p-4 sm:p-6 space-y-6 bg-background min-h-screen">
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => setLocation('/sales')} className="gap-2 text-foreground hover:bg-muted">
          <ArrowLeft className="h-4 w-4" /> Back to Sales
        </Button>
      </div>

      <div className="flex items-center gap-4">
        <div className="h-14 w-14 rounded-2xl bg-muted flex items-center justify-center">
          <Store className="h-7 w-7 text-primary" />
        </div>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">{unitName}</h1>
          <p className="text-muted-foreground text-sm">
            {selectedDepartment ? `${selectedDepartment} Staff` : 'Department Breakdown'}
          </p>
        </div>
      </div>

      {!selectedDepartment ? (
        <Card className={GLASS_STYLE}>
          <CardHeader>
            <CardTitle className="text-foreground flex items-center gap-2">
              <Briefcase className="h-5 w-5" /> Departments
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingDepts ? (
              <div className="text-center py-8 text-muted-foreground animate-pulse">Loading departments...</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {departmentData?.departments?.map((dept, idx) => (
                  <motion.div
                    key={dept.name}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    onClick={() => setSelectedDepartment(dept.name)}
                    className={`${GLASS_STYLE} rounded-xl p-5 cursor-pointer hover:bg-muted/50 transition-colors group`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold text-foreground">{dept.name}</h4>
                      <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Total Sale</span>
                        <span className="font-bold text-green-700 dark:text-green-400">{formatCurrency(dept.totalSale)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">In-House</span>
                        <span className="font-medium text-foreground">{formatCurrency(dept.inhouseSale)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Staff</span>
                        <span className="font-medium text-foreground">{dept.staffCount}</span>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <Button variant="outline" onClick={() => setSelectedDepartment(null)} className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Back to Departments
          </Button>
          
          <Card className={GLASS_STYLE}>
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2">
                <Briefcase className="h-5 w-5" /> {selectedDepartment} Staff
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingStaff ? (
                <div className="text-center py-8 text-muted-foreground animate-pulse">Loading staff...</div>
              ) : staffData?.staff?.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No staff found in this department</div>
              ) : (
                <div className="space-y-3">
                  {staffData?.staff?.map((staff) => (
                    <StaffRow
                      key={staff.smno}
                      staff={staff}
                      isExpanded={expandedStaff === staff.smno}
                      onToggle={() => setExpandedStaff(expandedStaff === staff.smno ? null : staff.smno)}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
