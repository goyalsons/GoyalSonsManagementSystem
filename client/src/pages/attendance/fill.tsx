import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Camera, Clock, MapPin, Calendar, User, CheckCircle2, AlertCircle } from "lucide-react";

export default function FillAttendancePage() {
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  
  const [punchType, setPunchType] = useState("");
  const [staffId, setStaffId] = useState("");
  const [staffName, setStaffName] = useState("");
  const [punchDate, setPunchDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [attendanceType, setAttendanceType] = useState("");
  const [punchTime, setPunchTime] = useState(() => {
    const now = new Date();
    return now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  });
  const [selfieImage, setSelfieImage] = useState<string | null>(null);
  const [locationReason, setLocationReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setPunchTime(now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!authLoading && !user) {
      setLocation("/login");
    }
  }, [user, authLoading, setLocation]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelfieImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!punchType) {
      setError("Please select a punch type");
      return;
    }
    if (!staffId) {
      setError("Please enter Staff ID");
      return;
    }
    if (!attendanceType) {
      setError("Please select attendance type");
      return;
    }
    if (!locationReason) {
      setError("Please fill your current location with reason");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/attendance/fill", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Session-Id": `${localStorage.getItem("gms_token") || ""}`,
        },
        body: JSON.stringify({
          punchType,
          staffId,
          staffName,
          punchDate,
          attendanceType,
          punchTime,
          selfieImage,
          locationReason,
        }),
      });

      if (response.ok) {
        setSuccess("Attendance submitted successfully!");
        handleReset();
      } else {
        const data = await response.json();
        setError(data.message || "Failed to submit attendance");
      }
    } catch (err) {
      setError("Network error. Please try again.");
    }

    setIsSubmitting(false);
  };

  const handleReset = () => {
    setPunchType("");
    setStaffId("");
    setStaffName("");
    setAttendanceType("");
    setSelfieImage(null);
    setLocationReason("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Fill Work Log</h1>
        <p className="text-slate-500 mt-1">Submit your work log record</p>
      </div>

      {success && (
        <div className="mb-4 flex items-center gap-3 p-4 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-200">
          <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {error && (
        <div className="mb-4 flex items-center gap-3 p-4 bg-red-50 text-red-700 rounded-xl border border-red-200">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <Card className="bg-white border-slate-200 shadow-sm">
        <CardHeader className="border-b border-slate-100">
          <CardTitle className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <Calendar className="h-5 w-5 text-blue-600" />
            Work Log Form
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-2">
                <Label htmlFor="punchType" className="text-sm font-medium text-slate-700 flex items-center gap-1">
                  PUNCH TYPE <span className="text-red-500">*</span>
                </Label>
                <Select value={punchType} onValueChange={setPunchType}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="-Select-" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="IN">IN</SelectItem>
                    <SelectItem value="OUT">OUT</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="staffId" className="text-sm font-medium text-slate-700 flex items-center gap-1">
                  Staff ID <span className="text-red-500">*</span>
                </Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    id="staffId"
                    value={staffId}
                    onChange={(e) => setStaffId(e.target.value)}
                    className="h-11 pl-10"
                    placeholder="Enter staff ID"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="staffName" className="text-sm font-medium text-slate-700">
                Staff Name
              </Label>
              <Input
                id="staffName"
                value={staffName}
                onChange={(e) => setStaffName(e.target.value)}
                className="h-11"
                placeholder="First_Name"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-2">
                <Label htmlFor="punchDate" className="text-sm font-medium text-slate-700 flex items-center gap-1">
                  PUNCH Date <span className="text-red-500">*</span>
                </Label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    id="punchDate"
                    type="date"
                    value={punchDate}
                    onChange={(e) => setPunchDate(e.target.value)}
                    className="h-11 pl-10"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="attendanceType" className="text-sm font-medium text-slate-700 flex items-center gap-1">
                  Attendance Type <span className="text-red-500">*</span>
                </Label>
                <Select value={attendanceType} onValueChange={setAttendanceType}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="-Select-" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="REGULAR">Regular</SelectItem>
                    <SelectItem value="LATE">Late</SelectItem>
                    <SelectItem value="HALF_DAY">Half Day</SelectItem>
                    <SelectItem value="OUTDOOR">Outdoor Duty</SelectItem>
                    <SelectItem value="WFH">Work From Home</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="punchTime" className="text-sm font-medium text-slate-700 flex items-center gap-1">
                PUNCH Time <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  id="punchTime"
                  value={punchTime}
                  readOnly
                  className="h-11 pl-10 bg-slate-50"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700">
                Take Selfie
              </Label>
              <div 
                className="border-2 border-dashed border-slate-200 rounded-xl p-4 text-center hover:border-blue-300 transition-colors cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
              >
                {selfieImage ? (
                  <div className="relative">
                    <img 
                      src={selfieImage} 
                      alt="Selfie preview" 
                      className="max-h-40 mx-auto rounded-lg"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute top-2 right-2 bg-white/80 hover:bg-white"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelfieImage(null);
                        if (fileInputRef.current) fileInputRef.current.value = "";
                      }}
                    >
                      Remove
                    </Button>
                  </div>
                ) : (
                  <div className="py-4">
                    <Camera className="h-8 w-8 mx-auto text-slate-400 mb-2" />
                    <p className="text-sm text-slate-500">Select Image</p>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="user"
                  onChange={handleImageSelect}
                  className="hidden"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="locationReason" className="text-sm font-medium text-slate-700 flex items-center gap-1">
                <MapPin className="h-4 w-4 text-slate-400" />
                Fill Your Current Location With Reason <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="locationReason"
                value={locationReason}
                onChange={(e) => setLocationReason(e.target.value)}
                placeholder="e.g., At office - Regular work day"
                rows={3}
                className="resize-none"
              />
            </div>

            <div className="flex justify-center gap-3 pt-4">
              <Button
                type="submit"
                className="px-8 bg-blue-600 hover:bg-blue-700"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  "Submit"
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="px-8"
                onClick={handleReset}
              >
                Reset
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
