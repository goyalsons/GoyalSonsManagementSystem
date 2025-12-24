import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Clock, CheckCircle2, Loader2, Calendar } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function AttendancePage() {
  const [isCheckedIn, setIsCheckedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [locationStatus, setLocationStatus] = useState<"idle" | "locating" | "verified" | "error">("idle");
  const [currentTime, setCurrentTime] = useState(new Date());
  const { toast } = useToast();

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleCheckIn = () => {
    setIsLoading(true);
    setLocationStatus("locating");

    // Simulate geolocation and API call
    setTimeout(() => {
      setLocationStatus("verified");
      setTimeout(() => {
        setIsLoading(false);
        setIsCheckedIn(true);
        toast({
          title: "Checked In Successfully",
          description: `Time: ${new Date().toLocaleTimeString()} • Location: Verified`,
        });
      }, 1000);
    }, 1500);
  };

  const handleCheckOut = () => {
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      setIsCheckedIn(false);
      setLocationStatus("idle");
      toast({
        title: "Checked Out Successfully",
        description: `Time: ${new Date().toLocaleTimeString()}`,
      });
    }, 1000);
  };

  return (
    <div className="flex flex-col md:flex-row gap-8 items-start">
        {/* Main Action Area */}
        <div className="w-full md:w-1/3 space-y-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Work Log</h1>
            <p className="text-muted-foreground mt-1">
              Daily check-in and checkout.
            </p>
          </div>

          <Card className="border-0 shadow-xl overflow-hidden relative bg-slate-900 dark:bg-slate-950 text-white">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-purple-500" />
            <CardHeader className="text-center pb-4 pt-8">
              <CardTitle className="text-5xl font-mono font-light tracking-wider">
                {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </CardTitle>
              <CardDescription className="text-sm uppercase tracking-widest font-medium text-slate-400 dark:text-slate-500">
                {currentTime.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-8 pb-10">
              <div className="relative group">
                <div className={`absolute inset-0 rounded-full blur-2xl opacity-20 transition-colors duration-500 ${isCheckedIn ? 'bg-rose-500' : 'bg-emerald-500'}`} />
                <Button 
                  size="lg" 
                  className={`h-56 w-56 rounded-full flex flex-col items-center justify-center gap-3 text-xl border-8 transition-all transform duration-300 shadow-2xl ${
                    isCheckedIn 
                      ? "bg-rose-600 hover:bg-rose-700 border-rose-800 dark:border-rose-900 hover:scale-105" 
                      : "bg-emerald-600 hover:bg-emerald-700 border-emerald-800 dark:border-emerald-900 hover:scale-105"
                  }`}
                  onClick={isCheckedIn ? handleCheckOut : handleCheckIn}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <Loader2 className="h-16 w-16 animate-spin" />
                  ) : isCheckedIn ? (
                    <>
                      <Clock className="h-12 w-12" />
                      <span className="font-bold tracking-wider text-lg">CHECK OUT</span>
                    </>
                  ) : (
                    <>
                      <MapPin className="h-12 w-12" />
                      <span className="font-bold tracking-wider text-lg">CHECK IN</span>
                    </>
                  )}
                </Button>
              </div>

              <div className="flex items-center gap-2 text-sm font-medium bg-white/5 py-2 px-4 rounded-full backdrop-blur-sm border border-white/10">
                {locationStatus === "idle" && (
                  <span className="text-slate-400 dark:text-slate-500 flex items-center gap-2">
                    <MapPin className="h-4 w-4" /> Location required
                  </span>
                )}
                {locationStatus === "locating" && (
                  <span className="text-blue-400 flex items-center gap-2">
                    <Loader2 className="h-3 w-3 animate-spin" /> Acquiring GPS...
                  </span>
                )}
                {locationStatus === "verified" && (
                  <span className="text-emerald-400 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4" /> GPS Verified: Office HQ
                  </span>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Today's Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Check In</span>
                <span className="font-mono font-medium">08:58 AM</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Break Time</span>
                <span className="font-mono font-medium">45m</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Check Out</span>
                <span className="font-mono font-medium text-muted-foreground">--:--</span>
              </div>
              <div className="pt-2 border-t border-border flex justify-between items-center">
                <span className="text-sm font-medium">Total Hours</span>
                <span className="font-mono font-bold text-primary">4h 12m</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* History/Map Area */}
        <div className="flex-1 space-y-6 w-full">
           <div className="flex items-center justify-between">
             <h2 className="text-lg font-semibold">Work Log History</h2>
             <Button variant="outline" size="sm">View Full Report</Button>
           </div>

           <div className="space-y-3">
             {[
               { date: "Today", checkIn: "08:58 AM", checkOut: "Pending", status: "Present", hours: "4h 12m" },
               { date: "Yesterday", checkIn: "09:02 AM", checkOut: "06:15 PM", status: "Late", hours: "9h 13m" },
               { date: "Nov 30, 2025", checkIn: "08:45 AM", checkOut: "05:50 PM", status: "Present", hours: "9h 05m" },
               { date: "Nov 29, 2025", checkIn: "08:55 AM", checkOut: "06:00 PM", status: "Present", hours: "9h 05m" },
               { date: "Nov 28, 2025", checkIn: "-", checkOut: "-", status: "Weekend", hours: "-" },
             ].map((record, i) => (
               <div key={i} className="bg-card rounded-lg border border-border p-4 flex flex-col sm:flex-row items-start sm:items-center gap-4 justify-between hover:shadow-md transition-all">
                 <div className="flex items-center gap-4">
                   <div className={`h-12 w-12 rounded-full flex items-center justify-center border ${
                     record.status === "Present" ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-500/20" :
                     record.status === "Late" ? "bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-100 dark:border-amber-500/20" :
                     "bg-muted text-muted-foreground border-border"
                   }`}>
                     <Calendar className="h-5 w-5" />
                   </div>
                   <div>
                     <p className="font-medium text-base text-foreground">{record.date}</p>
                     <p className="text-xs text-muted-foreground flex gap-2 mt-1">
                        <span className="bg-secondary px-1.5 py-0.5 rounded text-secondary-foreground">In: {record.checkIn}</span>
                        <span className="bg-secondary px-1.5 py-0.5 rounded text-secondary-foreground">Out: {record.checkOut}</span>
                     </p>
                   </div>
                 </div>
                 <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end pl-16 sm:pl-0">
                    <div className="text-right">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Duration</p>
                      <p className="font-mono font-medium text-sm text-foreground">{record.hours}</p>
                    </div>
                    <Badge variant="outline" className={`w-20 justify-center ${
                      record.status === "Present" ? "border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10" :
                      record.status === "Late" ? "border-amber-200 dark:border-amber-500/20 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10" :
                      "bg-secondary text-muted-foreground"
                    }`}>
                      {record.status}
                    </Badge>
                 </div>
               </div>
             ))}
           </div>
        </div>
      </div>
  );
}
