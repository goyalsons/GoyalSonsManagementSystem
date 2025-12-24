import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BookOpen, PlayCircle, FileText, Search, ChevronRight, Download, Video } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

export default function TrainingPage() {
  return (
    <div className="flex flex-col md:flex-row gap-8 h-[calc(100vh-8rem)]">
        {/* Sidebar */}
        <div className="w-full md:w-64 shrink-0 flex flex-col gap-4 h-full">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Training</h1>
            <p className="text-muted-foreground text-sm">
              Documentation & Resources
            </p>
          </div>
          
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search topics..." className="pl-8 h-9" />
          </div>

          <Card className="flex-1 overflow-hidden border-none shadow-none bg-transparent">
            <ScrollArea className="h-full pr-4">
              <div className="space-y-6">
                <div>
                  <h4 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground mb-3">Getting Started</h4>
                  <nav className="space-y-1">
                    <Button variant="secondary" className="w-full justify-start text-sm font-medium h-9">
                      <BookOpen className="mr-2 h-4 w-4" /> System Overview
                    </Button>
                    <Button variant="ghost" className="w-full justify-start text-sm font-normal h-9 text-muted-foreground hover:text-foreground">
                      <ChevronRight className="mr-2 h-4 w-4" /> Navigation
                    </Button>
                    <Button variant="ghost" className="w-full justify-start text-sm font-normal h-9 text-muted-foreground hover:text-foreground">
                      <ChevronRight className="mr-2 h-4 w-4" /> User Roles
                    </Button>
                  </nav>
                </div>

                <div>
                  <h4 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground mb-3">Attendance</h4>
                  <nav className="space-y-1">
                     <Button variant="ghost" className="w-full justify-start text-sm font-normal h-9 text-muted-foreground hover:text-foreground">
                      <ChevronRight className="mr-2 h-4 w-4" /> Check-in Policy
                    </Button>
                    <Button variant="ghost" className="w-full justify-start text-sm font-normal h-9 text-muted-foreground hover:text-foreground">
                      <ChevronRight className="mr-2 h-4 w-4" /> Geolocation
                    </Button>
                  </nav>
                </div>

                <div>
                  <h4 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground mb-3">HR & Claims</h4>
                  <nav className="space-y-1">
                     <Button variant="ghost" className="w-full justify-start text-sm font-normal h-9 text-muted-foreground hover:text-foreground">
                      <ChevronRight className="mr-2 h-4 w-4" /> Submitting Claims
                    </Button>
                    <Button variant="ghost" className="w-full justify-start text-sm font-normal h-9 text-muted-foreground hover:text-foreground">
                      <ChevronRight className="mr-2 h-4 w-4" /> Leave Requests
                    </Button>
                  </nav>
                </div>
              </div>
            </ScrollArea>
          </Card>
        </div>

        <Separator orientation="vertical" className="hidden md:block" />

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto pr-2">
          <div className="max-w-3xl mx-auto space-y-8 pb-12">
            <div className="space-y-4 border-b pb-6">
              <div className="flex items-center gap-2 text-sm text-primary font-medium">
                <span className="hover:underline cursor-pointer">Training</span>
                <ChevronRight className="h-3 w-3" />
                <span>Getting Started</span>
              </div>
              <h1 className="text-4xl font-bold text-foreground tracking-tight">System Overview</h1>
              <p className="text-lg text-muted-foreground leading-relaxed">
                Welcome to the Goyalsons Management System (GMS). This comprehensive platform is designed to streamline our internal operations, from employee attendance to resource planning.
              </p>
            </div>

            <div className="grid gap-8">
              <Card className="bg-slate-50 dark:bg-slate-900 border-none overflow-hidden">
                <CardContent className="p-0">
                   <div className="flex flex-col md:flex-row">
                      <div className="p-6 md:w-2/3 space-y-4">
                         <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                               <Video className="h-4 w-4" />
                            </div>
                            <h3 className="font-semibold text-lg">Video Walkthrough</h3>
                         </div>
                         <p className="text-muted-foreground text-sm">A 5-minute guide to understanding the new dashboard metrics, navigating the sidebar, and using the quick action buttons efficiently.</p>
                         <Button className="gap-2 mt-2">
                           <PlayCircle className="h-4 w-4" /> Watch Now
                         </Button>
                      </div>
                      <div className="bg-slate-200 dark:bg-slate-800 md:w-1/3 min-h-[160px] flex items-center justify-center relative group cursor-pointer overflow-hidden">
                         <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors" />
                         <PlayCircle className="h-12 w-12 text-white opacity-80 group-hover:scale-110 transition-transform" />
                      </div>
                   </div>
                </CardContent>
              </Card>

              <div className="prose prose-slate dark:prose-invert max-w-none">
                <h3>Key Features</h3>
                <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                  <li>
                    <strong className="text-foreground">Unified Dashboard:</strong> Get a real-time overview of attendance, pending tasks, and announcements.
                  </li>
                  <li>
                    <strong className="text-foreground">Smart Attendance:</strong> Geo-fenced check-ins ensure accurate reporting for on-site employees.
                  </li>
                  <li>
                    <strong className="text-foreground">Claims Processing:</strong> Submit and track expense claims directly through the portal.
                  </li>
                </ul>

                <h3 className="mt-8">Downloadable Resources</h3>
                <div className="not-prose grid sm:grid-cols-2 gap-4 mt-4">
                  <Button variant="outline" className="h-auto py-4 justify-start gap-4 border-border hover:border-primary/50 hover:bg-muted transition-all">
                    <div className="h-10 w-10 bg-rose-500/10 text-rose-600 dark:text-rose-400 rounded-lg flex items-center justify-center shrink-0">
                      <FileText className="h-5 w-5" />
                    </div>
                    <div className="text-left overflow-hidden">
                      <div className="font-medium truncate">User Manual PDF</div>
                      <div className="text-xs text-muted-foreground">v2.4 • 2.4 MB</div>
                    </div>
                    <Download className="ml-auto h-4 w-4 text-muted-foreground" />
                  </Button>
                  <Button variant="outline" className="h-auto py-4 justify-start gap-4 border-border hover:border-primary/50 hover:bg-muted transition-all">
                    <div className="h-10 w-10 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-lg flex items-center justify-center shrink-0">
                      <FileText className="h-5 w-5" />
                    </div>
                    <div className="text-left overflow-hidden">
                      <div className="font-medium truncate">HR Policies & Guidelines</div>
                      <div className="text-xs text-muted-foreground">Updated Dec 2025</div>
                    </div>
                    <Download className="ml-auto h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
  );
}
