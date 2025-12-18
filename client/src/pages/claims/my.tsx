import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  FileText, 
  Plus, 
  Clock,
  CheckCircle,
  XCircle,
  Calendar,
  IndianRupee,
  Upload
} from "lucide-react";
import { useState } from "react";

interface Claim {
  id: string;
  title: string;
  category: string;
  amount: number;
  status: "pending" | "approved" | "rejected";
  submittedDate: string;
  description: string;
  receiptUrl?: string;
}

export default function MyClaimsPage() {
  const [filter, setFilter] = useState<string>("all");

  const { data: claims = [], isLoading } = useQuery<Claim[]>({
    queryKey: ["/api/claims/my"],
    queryFn: async () => {
      const res = await fetch("/api/claims/my", {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const mockClaims: Claim[] = [
    {
      id: "1",
      title: "Client Meeting Travel",
      category: "Travel",
      amount: 2500,
      status: "approved",
      submittedDate: "Dec 01, 2025",
      description: "Cab fare for client meeting at XYZ Corp"
    },
    {
      id: "2",
      title: "Office Supplies",
      category: "Office",
      amount: 1200,
      status: "pending",
      submittedDate: "Dec 03, 2025",
      description: "Stationery and printer cartridges"
    },
    {
      id: "3",
      title: "Team Lunch",
      category: "Meals",
      amount: 3500,
      status: "pending",
      submittedDate: "Dec 02, 2025",
      description: "Team celebration lunch for project completion"
    },
    {
      id: "4",
      title: "Conference Registration",
      category: "Training",
      amount: 5000,
      status: "rejected",
      submittedDate: "Nov 28, 2025",
      description: "Annual Tech Conference registration fee"
    }
  ];

  const displayClaims = claims.length > 0 ? claims : mockClaims;
  
  const filteredClaims = filter === "all" 
    ? displayClaims 
    : displayClaims.filter(c => c.status === filter);

  const totalPending = displayClaims
    .filter(c => c.status === "pending")
    .reduce((sum, c) => sum + c.amount, 0);
  
  const totalApproved = displayClaims
    .filter(c => c.status === "approved")
    .reduce((sum, c) => sum + c.amount, 0);

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
    Meals: "bg-orange-100 text-orange-700",
    Training: "bg-cyan-100 text-cyan-700"
  };

  return (
    <>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">My Claims</h1>
          <p className="text-muted-foreground mt-1">
            Submit and track your expense claims.
          </p>
        </div>
        <Button className="gap-2 shadow-sm">
          <Plus className="h-4 w-4" />
          Submit New Claim
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <IndianRupee className="h-5 w-5 text-amber-600" />
              <div className="text-2xl font-bold text-amber-600">{totalPending.toLocaleString()}</div>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Pending Amount</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <IndianRupee className="h-5 w-5 text-emerald-600" />
              <div className="text-2xl font-bold text-emerald-600">{totalApproved.toLocaleString()}</div>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Approved This Month</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{displayClaims.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Total Claims</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        {["all", "pending", "approved", "rejected"].map((status) => (
          <Button
            key={status}
            variant={filter === status ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(status)}
            className="capitalize"
          >
            {status === "all" ? "All Claims" : status}
            <Badge variant="secondary" className="ml-2 text-[10px]">
              {status === "all" 
                ? displayClaims.length 
                : displayClaims.filter(c => c.status === status).length}
            </Badge>
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="py-4">
                <div className="h-4 bg-muted rounded w-1/3 mb-2"></div>
                <div className="h-3 bg-muted rounded w-2/3"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredClaims.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent>
            <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No claims found</h3>
            <p className="text-muted-foreground mb-4">
              {filter !== "all" 
                ? "No claims match the selected filter." 
                : "You haven't submitted any claims yet."}
            </p>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Submit Your First Claim
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredClaims.map((claim) => (
            <Card key={claim.id} className="hover:shadow-md transition-shadow">
              <CardContent className="py-4">
                <div className="flex items-start gap-4">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                    <FileText className="h-5 w-5" />
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
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1 font-medium text-foreground">
                        <IndianRupee className="h-3 w-3" />
                        {claim.amount.toLocaleString()}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        Submitted: {claim.submittedDate}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="gap-1">
                      <Upload className="h-3 w-3" />
                      Receipt
                    </Button>
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
