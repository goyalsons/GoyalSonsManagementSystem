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
  Edit,
  Trash2,
  Pin,
  MoreHorizontal
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState } from "react";

interface TeamAnnouncement {
  id: string;
  title: string;
  content: string;
  category: string;
  priority: "normal" | "important" | "urgent";
  createdAt: string;
  createdBy: string;
  createdByRole: string;
  isPinned: boolean;
  targetAudience: string;
  viewCount: number;
  status: "draft" | "published" | "archived";
}

export default function TeamAnnouncementsPage() {
  const { hasPolicy } = useAuth();
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: announcements = [], isLoading } = useQuery<TeamAnnouncement[]>({
    queryKey: ["/api/announcements/team"],
    queryFn: async () => {
      const res = await fetch("/api/announcements/team", {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const mockAnnouncements: TeamAnnouncement[] = [
    {
      id: "1",
      title: "Department Meeting Schedule",
      content: "Monthly department sync meeting has been rescheduled to December 10th at 3 PM. Please update your calendars accordingly.",
      category: "Meeting",
      priority: "normal",
      createdAt: "Dec 03, 2025",
      createdBy: "Priya Sharma",
      createdByRole: "Management",
      isPinned: true,
      targetAudience: "Department",
      viewCount: 28,
      status: "published"
    },
    {
      id: "2",
      title: "New Project Kickoff",
      content: "We are starting the Q1 client project next week. Team leads please schedule onboarding sessions with your respective members.",
      category: "Project",
      priority: "important",
      createdAt: "Dec 02, 2025",
      createdBy: "Rajesh Goyal",
      createdByRole: "CEO",
      isPinned: false,
      targetAudience: "All Teams",
      viewCount: 45,
      status: "published"
    },
    {
      id: "3",
      title: "Training Session Reminder",
      content: "Compliance training sessions are mandatory for all team members. Please complete before December 20th.",
      category: "Training",
      priority: "urgent",
      createdAt: "Dec 01, 2025",
      createdBy: "Sneha Patel",
      createdByRole: "HR Manager",
      isPinned: false,
      targetAudience: "All Employees",
      viewCount: 89,
      status: "published"
    },
    {
      id: "4",
      title: "Budget Review Draft",
      content: "Q4 budget review presentation draft. Please review and provide feedback.",
      category: "Finance",
      priority: "normal",
      createdAt: "Nov 30, 2025",
      createdBy: "Rahul Verma",
      createdByRole: "Finance Lead",
      isPinned: false,
      targetAudience: "Management",
      viewCount: 12,
      status: "draft"
    }
  ];

  const displayAnnouncements = announcements.length > 0 ? announcements : mockAnnouncements;
  
  const filteredAnnouncements = statusFilter === "all"
    ? displayAnnouncements
    : displayAnnouncements.filter(a => a.status === statusFilter);

  const canCreateAnnouncements = hasPolicy("announcements.create");

  const priorityColors = {
    normal: "bg-slate-100 text-slate-700",
    important: "bg-amber-100 text-amber-700",
    urgent: "bg-rose-100 text-rose-700"
  };

  const statusColors = {
    draft: "bg-slate-100 text-slate-600",
    published: "bg-emerald-100 text-emerald-700",
    archived: "bg-gray-100 text-gray-600"
  };

  return (
    <>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Team Announcements</h1>
          <p className="text-muted-foreground mt-1">
            Create and manage announcements for your team.
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="published">Published</SelectItem>
              <SelectItem value="draft">Drafts</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
          {canCreateAnnouncements && (
            <Button className="gap-2 shadow-sm">
              <Plus className="h-4 w-4" />
              New Announcement
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{displayAnnouncements.length}</div>
            <p className="text-xs text-muted-foreground">Total</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-emerald-600">
              {displayAnnouncements.filter(a => a.status === "published").length}
            </div>
            <p className="text-xs text-muted-foreground">Published</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-slate-600">
              {displayAnnouncements.filter(a => a.status === "draft").length}
            </div>
            <p className="text-xs text-muted-foreground">Drafts</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-rose-600">
              {displayAnnouncements.filter(a => a.priority === "urgent").length}
            </div>
            <p className="text-xs text-muted-foreground">Urgent</p>
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
      ) : filteredAnnouncements.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent>
            <Megaphone className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No announcements found</h3>
            <p className="text-muted-foreground mb-4">
              {statusFilter !== "all"
                ? "No announcements match the selected filter."
                : "Create your first team announcement."}
            </p>
            {canCreateAnnouncements && (
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Create Announcement
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredAnnouncements
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
                        <Badge variant="outline" className={statusColors[announcement.status]}>
                          {announcement.status}
                        </Badge>
                      </div>
                      <CardDescription className="line-clamp-2">
                        {announcement.content}
                      </CardDescription>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem className="gap-2">
                          <Eye className="h-4 w-4" /> View
                        </DropdownMenuItem>
                        <DropdownMenuItem className="gap-2">
                          <Edit className="h-4 w-4" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem className="gap-2">
                          <Pin className="h-4 w-4" /> {announcement.isPinned ? "Unpin" : "Pin"}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="gap-2 text-rose-600">
                          <Trash2 className="h-4 w-4" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                    <span>By: <span className="font-medium text-foreground">{announcement.createdBy}</span></span>
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
