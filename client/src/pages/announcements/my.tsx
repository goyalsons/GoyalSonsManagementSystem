import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Megaphone, 
  Plus, 
  Calendar,
  Eye,
  Users,
  Bell,
  Pin
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useState } from "react";

interface Announcement {
  id: string;
  title: string;
  content: string;
  category: string;
  priority: "normal" | "important" | "urgent";
  createdAt: string;
  isPinned: boolean;
  targetAudience: string;
  viewCount: number;
}

export default function MyAnnouncementsPage() {
  const { user, hasPolicy } = useAuth();
  const [filter, setFilter] = useState("all");

  const { data: announcements = [], isLoading } = useQuery<Announcement[]>({
    queryKey: ["/api/announcements/my"],
    queryFn: async () => {
      const res = await fetch("/api/announcements/my", {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const mockAnnouncements: Announcement[] = [
    {
      id: "1",
      title: "Year-End Performance Reviews",
      content: "All employees are requested to complete their self-assessment forms by December 15th. Managers will schedule one-on-one review meetings thereafter.",
      category: "HR",
      priority: "important",
      createdAt: "Dec 03, 2025",
      isPinned: true,
      targetAudience: "All Employees",
      viewCount: 156
    },
    {
      id: "2",
      title: "Office Holiday Schedule 2025",
      content: "Please note the office will be closed from December 24th to January 1st for the holiday season. Emergency contacts have been shared via email.",
      category: "General",
      priority: "normal",
      createdAt: "Dec 02, 2025",
      isPinned: true,
      targetAudience: "All Employees",
      viewCount: 203
    },
    {
      id: "3",
      title: "New Sales Incentive Program",
      content: "We are excited to announce enhanced sales incentives for Q1 2026. Top performers will receive additional bonuses and recognition awards.",
      category: "Sales",
      priority: "important",
      createdAt: "Dec 01, 2025",
      isPinned: false,
      targetAudience: "Sales Team",
      viewCount: 45
    },
    {
      id: "4",
      title: "IT System Maintenance Notice",
      content: "Scheduled maintenance on December 7th from 10 PM to 2 AM. All internal systems will be temporarily unavailable during this window.",
      category: "IT",
      priority: "urgent",
      createdAt: "Nov 30, 2025",
      isPinned: false,
      targetAudience: "All Employees",
      viewCount: 189
    }
  ];

  const displayAnnouncements = announcements.length > 0 ? announcements : mockAnnouncements;

  const canCreateAnnouncements = hasPolicy("announcements.create");

  const priorityColors = {
    normal: "bg-slate-100 text-slate-700",
    important: "bg-amber-100 text-amber-700",
    urgent: "bg-rose-100 text-rose-700"
  };

  const categoryColors: Record<string, string> = {
    HR: "bg-purple-50 text-purple-700 border-purple-200",
    General: "bg-blue-50 text-blue-700 border-blue-200",
    Sales: "bg-emerald-50 text-emerald-700 border-emerald-200",
    IT: "bg-cyan-50 text-cyan-700 border-cyan-200"
  };

  return (
    <>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">My Announcements</h1>
          <p className="text-muted-foreground mt-1">
            Stay updated with important company news and updates.
          </p>
        </div>
        {canCreateAnnouncements && (
          <Button className="gap-2 shadow-sm">
            <Plus className="h-4 w-4" />
            Create Announcement
          </Button>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-3 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-primary" />
              <div className="text-2xl font-bold">{displayAnnouncements.length}</div>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Total Announcements</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Pin className="h-5 w-5 text-amber-600" />
              <div className="text-2xl font-bold text-amber-600">
                {displayAnnouncements.filter(a => a.isPinned).length}
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Pinned</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Megaphone className="h-5 w-5 text-rose-600" />
              <div className="text-2xl font-bold text-rose-600">
                {displayAnnouncements.filter(a => a.priority === "urgent").length}
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Urgent</p>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-5 bg-muted rounded w-1/3"></div>
                <div className="h-3 bg-muted rounded w-2/3 mt-2"></div>
              </CardHeader>
            </Card>
          ))}
        </div>
      ) : displayAnnouncements.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent>
            <Megaphone className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No announcements</h3>
            <p className="text-muted-foreground">
              There are no announcements for you at the moment.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {displayAnnouncements
            .sort((a, b) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0))
            .map((announcement) => (
              <Card 
                key={announcement.id} 
                className={`hover:shadow-md transition-shadow ${announcement.isPinned ? "border-l-4 border-l-amber-500" : ""}`}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        {announcement.isPinned && (
                          <Pin className="h-4 w-4 text-amber-600" />
                        )}
                        <CardTitle className="text-lg">{announcement.title}</CardTitle>
                        <Badge className={priorityColors[announcement.priority]}>
                          {announcement.priority}
                        </Badge>
                        <Badge variant="outline" className={categoryColors[announcement.category] || "bg-slate-50"}>
                          {announcement.category}
                        </Badge>
                      </div>
                      <CardDescription className="line-clamp-2">
                        {announcement.content}
                      </CardDescription>
                    </div>
                    <Button variant="ghost" size="sm">
                      Read More
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {announcement.createdAt}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {announcement.targetAudience}
                    </span>
                    <span className="flex items-center gap-1">
                      <Eye className="h-3 w-3" />
                      {announcement.viewCount} views
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
        </div>
      )}
    </>
  );
}
