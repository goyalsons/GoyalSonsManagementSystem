import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  FileText, 
  Users,
  Clock,
  CheckCircle,
  XCircle,
  Calendar,
  IndianRupee,
  Filter,
  Check,
  X
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState } from "react";

interface TeamClaim {
  id: string;
  title: string;
  category: string;
  amount: number;
  status: "pending" | "approved" | "rejected";
  submittedDate: string;
  submittedBy: string;
  submittedByRole: string;
  description: string;
}

export default function TeamClaimsPage() {
  const { hasPolicy } = useAuth();
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: teamClaims = [], isLoading } = useQuery<TeamClaim[]>({
    queryKey: ["/api/claims/team"],
    queryFn: async () => {
      const res = await fetch("/api/claims/team", {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const mockTeamClaims: TeamClaim[] = [
    {
      id: "1",
      title: "Client Visit - Mumbai",
      category: "Travel",
      amount: 8500,
      status: "pending",
      submittedDate: "Dec 03, 2025",
      submittedBy: "Ankit Kumar",
      submittedByRole: "Sales Executive",
      description: "Flight and hotel for client meeting"
    },
    {
      id: "2",
      title: "Marketing Materials",
      category: "Office",
      amount: 4200,
      status: "pending",
      submittedDate: "Dec 02, 2025",
      submittedBy: "Priya Sharma",
      submittedByRole: "Marketing Lead",
      description: "Brochures and banners for trade show"
    },
    {
      id: "3",
      title: "Team Building Event",
      category: "Events",
      amount: 15000,
      status: "approved",
      submittedDate: "Nov 30, 2025",
      submittedBy: "Sneha Patel",
      submittedByRole: "HR Manager",
      description: "Team outing expenses"
    },
    {
      id: "4",
      title: "Software License",
      category: "IT",
      amount: 12000,
      status: "rejected",
      submittedDate: "Nov 28, 2025",
      submittedBy: "Vikram Singh",
      submittedByRole: "IT Admin",
      description: "Annual license renewal - duplicate claim"
    }
  ];

  const displayClaims = teamClaims.length > 0 ? teamClaims : mockTeamClaims;
  
  const filteredClaims = statusFilter === "all" 
    ? displayClaims 
    : displayClaims.filter(c => c.status === statusFilter);

  const canApproveClaims = hasPolicy("claims.approve");

  const totalPending = displayClaims
    .filter(c => c.status === "pending")
    .reduce((sum, c) => sum + c.amount, 0);

  const pendingCount = displayClaims.filter(c => c.status === "pending").length;

  const statusIcons = {
    pending: <Clock className="h-4 w-4" />,
    approved: <CheckCircle className="h-4 w-4" />,
    rejected: <XCircle className="h-4 w-4" />
  };

  const statusColors = {
    pending: "bg-amber-50 text-amber-700 border-amber-200",
    approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
    rejected: "bg-rose-50 text-rose-700 border-rose-200"
  };

  const categoryColors: Record<string, string> = {
    Travel: "bg-blue-100 text-blue-700",
    Office: "bg-purple-100 text-purple-700",
    Events: "bg-pink-100 text-pink-700",
    IT: "bg-cyan-100 text-cyan-700"
  };

  return (
    <>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Team Claims</h1>
          <p className="text-muted-foreground mt-1">
            Review and manage expense claims from your team.
          </p>
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Filter" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Claims</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 md:grid-cols-4 mb-6">
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-amber-600">{pendingCount}</div>
            <p className="text-xs text-muted-foreground">Pending Review</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-1">
              <IndianRupee className="h-4 w-4 text-muted-foreground" />
              <div className="text-2xl font-bold">{totalPending.toLocaleString()}</div>
            </div>
            <p className="text-xs text-muted-foreground">Pending Amount</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-emerald-600">
              {displayClaims.filter(c => c.status === "approved").length}
            </div>
            <p className="text-xs text-muted-foreground">Approved</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-rose-600">
              {displayClaims.filter(c => c.status === "rejected").length}
            </div>
            <p className="text-xs text-muted-foreground">Rejected</p>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="py-4">
                <div className="h-4 bg-muted rounded w-1/4 mb-2"></div>
                <div className="h-3 bg-muted rounded w-1/2"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredClaims.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent>
            <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No claims found</h3>
            <p className="text-muted-foreground">
              {statusFilter !== "all" 
                ? "No claims match the selected filter." 
                : "No claims have been submitted by your team yet."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredClaims.map((claim) => (
            <Card key={claim.id} className="hover:shadow-md transition-shadow">
              <CardContent className="py-4">
                <div className="flex items-start gap-4">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold shrink-0">
                    {claim.submittedBy.split(" ").map(n => n[0]).join("").slice(0, 2)}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h3 className="font-medium">{claim.title}</h3>
                      <Badge className={categoryColors[claim.category] || "bg-slate-100 text-slate-700"}>
                        {claim.category}
                      </Badge>
                      <Badge variant="outline" className={statusColors[claim.status]}>
                        {statusIcons[claim.status]}
                        <span className="ml-1 capitalize">{claim.status}</span>
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-2">{claim.description}</p>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                      <span>By: <span className="font-medium text-foreground">{claim.submittedBy}</span> ({claim.submittedByRole})</span>
                      <span className="flex items-center gap-1 font-medium text-foreground">
                        <IndianRupee className="h-3 w-3" />
                        {claim.amount.toLocaleString()}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {claim.submittedDate}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    {claim.status === "pending" && canApproveClaims && (
                      <>
                        <Button variant="outline" size="sm" className="gap-1 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50">
                          <Check className="h-3 w-3" />
                          Approve
                        </Button>
                        <Button variant="outline" size="sm" className="gap-1 text-rose-600 hover:text-rose-700 hover:bg-rose-50">
                          <X className="h-3 w-3" />
                          Reject
                        </Button>
                      </>
                    )}
                    <Button variant="ghost" size="sm">
                      View
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
