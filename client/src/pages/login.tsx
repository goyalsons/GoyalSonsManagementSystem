import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, AlertCircle, CheckCircle2, Phone, CreditCard, Mail } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import shopmaxLogo from "@/assets/shopmax-logo.jpg";

type LoginMethod = "card" | "email";

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  const [loginMethod, setLoginMethod] = useState<LoginMethod>("card");
  
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  
  const [employeeCode, setEmployeeCode] = useState("");
  const [maskedPhone, setMaskedPhone] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpExpiresIn, setOtpExpiresIn] = useState<number | null>(null);
  const [resendTimer, setResendTimer] = useState<number>(0); // Timer for resend button (2 minutes)
  const [canResend, setCanResend] = useState(false);
  
  const { login, user } = useAuth();

  const getDefaultLandingPath = (policies?: string[]) => {
    if (!policies?.length || (policies.length === 1 && policies[0] === "no_policy.view")) return "/no-policy";
    const p = new Set(policies || []);
    if (p.has("attendance.history.view")) return "/attendance/history";
    if (p.has("staff-sales.view")) return "/sales";
    if (p.has("requests.view")) return "/requests";
    return "/";
  };

  useEffect(() => {
    if (user) {
      setLocation(getDefaultLandingPath(user.policies));
    }
  }, [user, setLocation]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const errorParam = params.get("error");
    if (errorParam) {
      setError(decodeURIComponent(errorParam));
      window.history.replaceState({}, "", "/login");
    }
  }, []);

  useEffect(() => {
    if (otpExpiresIn && otpExpiresIn > 0) {
      const timer = setInterval(() => {
        setOtpExpiresIn((prev) => {
          if (prev && prev > 0) return prev - 1;
          return null;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [otpExpiresIn]);

  // Resend timer - 2 minutes countdown
  useEffect(() => {
    if (otpSent && resendTimer > 0) {
      const timer = setInterval(() => {
        setResendTimer((prev) => {
          if (prev <= 1) {
            setCanResend(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [otpSent, resendTimer]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleEmployeeCodeSubmit = async () => {
    if (!employeeCode || employeeCode.length < 3) {
      setError("Please enter a valid card number");
      return;
    }
    
    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const lookupRes = await fetch("/api/auth/employee-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeCode }),
      });

      const lookupData = await lookupRes.json();

      if (!lookupRes.ok) {
        setError(lookupData.message || "Member not found");
        setIsLoading(false);
        return;
      }

      setMaskedPhone(lookupData.maskedPhone);

      const otpRes = await fetch("/api/auth/send-employee-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeCode }),
      });

      const otpData = await otpRes.json();

      if (otpRes.ok) {
        setOtpSent(true);
        if (otpData.existingOtp) {
          setOtpExpiresIn(otpData.remainingSeconds);
          // Calculate resend timer: if OTP was sent less than 2 minutes ago, set timer
          const timeSinceSent = 300 - otpData.remainingSeconds; // 5 min total - remaining = elapsed
          const resendTimeLeft = Math.max(0, 120 - timeSinceSent); // 2 min - elapsed
          setResendTimer(resendTimeLeft);
          setCanResend(resendTimeLeft === 0);
          setSuccess(`OTP already sent. Expires in ${formatTime(otpData.remainingSeconds)}`);
        } else {
          setOtpExpiresIn(300); // 5 minutes total validity
          setResendTimer(120); // 2 minutes before resend button activates
          setCanResend(false);
          setSuccess(`OTP sent to ${lookupData.maskedPhone}`);
        }
      } else {
        setError(otpData.message || "Failed to send OTP");
      }
    } catch (err) {
      setError("Network error. Please try again.");
    }
    
    setIsLoading(false);
  };

  const handleOtpLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp || otp.length !== 6) {
      setError("Please enter a valid 6-digit OTP");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/verify-employee-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeCode, otp }),
      });

      const data = await res.json();

      if (res.ok) {
        localStorage.setItem("gms_token", data.token);
        localStorage.setItem("gms_login_at", String(Date.now()));
        
        if (!data.user?.policies?.length || (data.user.policies.length === 1 && data.user.policies[0] === "no_policy.view")) {
          window.location.href = "/no-policy";
        } else {
          window.location.href = getDefaultLandingPath(data.user?.policies);
        }
      } else {
        setError(data.message || "Invalid or expired OTP");
      }
    } catch (err) {
      setError("Network error. Please try again.");
    }
    
    setIsLoading(false);
  };

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const result = await login(email, password);
    
    if (result.success) {
      setLocation("/");
    } else {
      setError(result.error || "Login failed");
    }
    
    setIsLoading(false);
  };

  const handleGoogleLogin = () => {
    window.location.href = "/api/auth/google";
  };

  const handleResendOtp = async () => {
    if (!canResend || !employeeCode) return;
    
    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/auth/resend-employee-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeCode }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        if (data.remainingSeconds) {
          setOtpExpiresIn(data.remainingSeconds);
          // Reset resend timer to 2 minutes
          setResendTimer(120);
          setCanResend(false);
        }
        setSuccess(data.message || "OTP resent successfully");
      } else {
        setError(data.message || "Failed to resend OTP");
      }
    } catch (err) {
      setError("Network error. Please try again.");
    }
    
    setIsLoading(false);
  };

  const resetOtpState = () => {
    setOtpSent(false);
    setOtp("");
    setMaskedPhone(null);
    setOtpExpiresIn(null);
    setResendTimer(0);
    setCanResend(false);
    setEmployeeCode("");
    setSuccess(null);
    setError(null);
  };

  const switchMethod = (method: LoginMethod) => {
    setLoginMethod(method);
    resetOtpState();
    setEmail("");
    setPassword("");
    setError(null);
    setSuccess(null);
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900" />
      
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full border border-purple-500/20 animate-pulse" style={{ animationDuration: '4s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full border border-blue-500/30 animate-spin" style={{ animationDuration: '20s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full border-2 border-cyan-400/20 animate-ping" style={{ animationDuration: '3s' }} />
        
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-600/30 rounded-full blur-[120px] animate-pulse" style={{ animationDuration: '5s' }} />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-600/30 rounded-full blur-[120px] animate-pulse" style={{ animationDuration: '7s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-cyan-500/20 rounded-full blur-[100px]" />
        
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-gradient-to-r from-purple-500/10 to-blue-500/10 blur-3xl animate-spin" style={{ animationDuration: '30s' }} />
      </div>

      <div className="relative z-10 w-full max-w-md px-6">
        <div className="text-center mb-8">
          <div className="inline-block p-4 rounded-2xl bg-white/10 backdrop-blur-xl border border-white/20 shadow-2xl mb-6">
            <img 
              src={shopmaxLogo} 
              alt="Shopmax" 
              className="h-16 w-auto object-contain"
              width="64"
              height="64"
              loading="eager"
              fetchPriority="high"
              decoding="async"
            />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Welcome Back</h1>
          <p className="text-white/60">Sign in to continue</p>
        </div>

        <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl p-8 shadow-2xl">
          <div className="flex gap-2 p-1 bg-white/10 rounded-2xl mb-6">
            <button
              onClick={() => switchMethod("card")}
              className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-medium transition-all duration-300 ${
                loginMethod === "card"
                  ? "bg-white text-slate-900 shadow-lg"
                  : "text-white/70 hover:text-white hover:bg-white/10"
              }`}
            >
              <CreditCard className="h-4 w-4" />
              Login by Card
            </button>
            <button
              onClick={() => switchMethod("email")}
              className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-medium transition-all duration-300 ${
                loginMethod === "email"
                  ? "bg-white text-slate-900 shadow-lg"
                  : "text-white/70 hover:text-white hover:bg-white/10"
              }`}
            >
              <Mail className="h-4 w-4" />
              Login by Email
            </button>
          </div>

          {error && (
            <div className="mb-4 flex items-center gap-3 p-3 text-sm bg-red-500/20 text-red-200 rounded-xl border border-red-500/30 backdrop-blur-sm">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
          
          {success && (
            <div className="mb-4 flex items-center gap-3 p-3 text-sm bg-emerald-500/20 text-emerald-200 rounded-xl border border-emerald-500/30 backdrop-blur-sm">
              <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
              <span>{success}</span>
            </div>
          )}

          {loginMethod === "card" ? (
            <div className="space-y-4">
              {!otpSent ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="emp-code" className="text-sm font-medium text-white/80">Card Number</Label>
                    <Input 
                      id="emp-code" 
                      type="text" 
                      placeholder="Enter your card number" 
                      value={employeeCode}
                      onChange={(e) => setEmployeeCode(e.target.value.replace(/\s/g, ""))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && employeeCode.length >= 3) {
                          handleEmployeeCodeSubmit();
                        }
                      }}
                      className="h-12 bg-white/10 border-white/20 text-white placeholder:text-white/40 rounded-xl focus:border-cyan-400 focus:ring-cyan-400/20"
                      autoFocus
                    />
                  </div>
                  <Button 
                    type="button" 
                    className="w-full h-12 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white font-medium rounded-xl shadow-lg shadow-cyan-500/25 transition-all duration-300 hover:shadow-cyan-500/40" 
                    onClick={handleEmployeeCodeSubmit}
                    disabled={isLoading || employeeCode.length < 3}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Sending OTP...
                      </>
                    ) : (
                      <>
                        <Phone className="mr-2 h-4 w-4" />
                        Send OTP
                      </>
                    )}
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleOtpLogin} className="space-y-4">
                  <div className="bg-white/10 rounded-xl p-4 text-center border border-white/10">
                    <p className="text-xs text-white/50 mb-1">OTP sent to</p>
                    <p className="font-semibold text-white">{maskedPhone}</p>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="otp" className="text-sm font-medium text-white/80">Enter OTP</Label>
                    <Input 
                      id="otp" 
                      type="text" 
                      placeholder="000000"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      className="text-center text-xl tracking-[0.4em] font-mono h-14 bg-white/10 border-white/20 text-white placeholder:text-white/30 rounded-xl"
                      maxLength={6}
                      autoFocus
                    />
                    {otpExpiresIn !== null && otpExpiresIn > 0 && (
                      <p className="text-xs text-center text-white/50">
                        Expires in <span className="font-medium text-cyan-400">{formatTime(otpExpiresIn)}</span>
                      </p>
                    )}
                    {otpExpiresIn === 0 && (
                      <p className="text-xs text-center text-red-400 font-medium">
                        OTP expired
                      </p>
                    )}
                  </div>
                  
                  <Button 
                    type="submit" 
                    className="w-full h-12 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white font-medium rounded-xl shadow-lg shadow-cyan-500/25" 
                    disabled={isLoading || otp.length !== 6 || otpExpiresIn === 0}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Verifying...
                      </>
                    ) : (
                      "Verify & Sign In"
                    )}
                  </Button>

                  {/* Resend OTP Button */}
                  <Button
                    type="button"
                    onClick={handleResendOtp}
                    disabled={!canResend || isLoading || otpExpiresIn === 0}
                    className="w-full h-10 bg-white/10 border border-white/20 hover:bg-white/20 text-white font-medium rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Resending...
                      </>
                    ) : canResend ? (
                      <>
                        <Phone className="mr-2 h-4 w-4" />
                        Resend OTP
                      </>
                    ) : (
                      <>
                        Resend OTP in <span className="ml-1 font-semibold text-cyan-400">{formatTime(resendTimer)}</span>
                      </>
                    )}
                  </Button>
                  
                  <button 
                    type="button" 
                    className="w-full text-white/50 hover:text-white text-sm transition-colors" 
                    onClick={resetOtpState}
                  >
                    Use Different Card
                  </button>
                </form>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <Button 
                type="button"
                variant="outline"
                className="w-full h-12 bg-white/10 border-white/20 hover:bg-white/20 text-white font-medium rounded-xl flex items-center justify-center gap-3 transition-all duration-300"
                onClick={handleGoogleLogin}
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Sign in with Google
              </Button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-white/20"></div>
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="px-3 bg-transparent text-white/40">or</span>
                </div>
              </div>

              <form onSubmit={handlePasswordLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm font-medium text-white/80">Email</Label>
                  <Input 
                    id="email" 
                    type="email" 
                    placeholder="you@example.com" 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-12 bg-white/10 border-white/20 text-white placeholder:text-white/40 rounded-xl focus:border-cyan-400 focus:ring-cyan-400/20"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-sm font-medium text-white/80">Password</Label>
                  <Input 
                    id="password" 
                    type="password" 
                    placeholder="Enter password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-12 bg-white/10 border-white/20 text-white placeholder:text-white/40 rounded-xl focus:border-cyan-400 focus:ring-cyan-400/20"
                  />
                </div>
                <Button 
                  type="submit" 
                  className="w-full h-12 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white font-medium rounded-xl shadow-lg shadow-cyan-500/25 transition-all duration-300 hover:shadow-cyan-500/40" 
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    "Sign In"
                  )}
                </Button>
              </form>
            </div>
          )}
        </div>

        <div className="mt-6 text-center">
          <button 
            onClick={() => setLocation("/apply")}
            className="text-white/60 hover:text-white text-sm font-medium transition-colors duration-300 hover:underline underline-offset-4"
          >
            Apply for Job / New Signup
          </button>
        </div>
      </div>
    </div>
  );
}
