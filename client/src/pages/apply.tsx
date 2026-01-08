import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ExternalLink } from "lucide-react";
import shopmaxLogo from "@/assets/shopmax-logo.jpg";

export default function ApplyPage() {
  const [, setLocation] = useLocation();

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
          <h1 className="text-3xl font-bold text-white mb-2">Join Our Team</h1>
          <p className="text-white/60">Start your career with Goyalsons</p>
        </div>

        <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl p-8 shadow-2xl text-center">
          <div className="mb-6">
            <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 flex items-center justify-center border border-cyan-400/30">
              <ExternalLink className="w-10 h-10 text-cyan-400" />
            </div>
            <h2 className="text-xl font-semibold text-white mb-2">Job Portal</h2>
            <p className="text-white/60 text-sm">
              Visit our careers portal to explore open positions and submit your application
            </p>
          </div>

          <a 
            href="https://Jobs.goyalsons.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button 
              className="w-full h-12 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white font-medium rounded-xl shadow-lg shadow-cyan-500/25 transition-all duration-300 hover:shadow-cyan-500/40 mb-4"
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              Visit Jobs Portal
            </Button>
          </a>

          <button
            onClick={() => setLocation("/login")}
            className="flex items-center justify-center gap-2 w-full text-white/60 hover:text-white text-sm transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Login
          </button>
        </div>
      </div>
    </div>
  );
}
