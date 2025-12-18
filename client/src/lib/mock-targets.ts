import { z } from "zod";

export interface Target {
  id: string;
  title: string;
  description: string;
  metric: string;
  targetValue: number;
  achievedValue: number;
  period: "Daily" | "Weekly" | "Monthly";
  status: "On Track" | "At Risk" | "Completed";
}

export const mockTargets: Target[] = [
  {
    id: "TGT-001",
    title: "Sales Calls",
    description: "Complete 50 outbound calls per day",
    metric: "Calls",
    targetValue: 50,
    achievedValue: 32,
    period: "Daily",
    status: "On Track",
  },
  {
    id: "TGT-002",
    title: "Revenue Generation",
    description: "Close $10k in new deals this month",
    metric: "USD",
    targetValue: 10000,
    achievedValue: 4500,
    period: "Monthly",
    status: "At Risk",
  },
  {
    id: "TGT-003",
    title: "Client Meetings",
    description: "Conduct 5 client demos",
    metric: "Meetings",
    targetValue: 5,
    achievedValue: 5,
    period: "Weekly",
    status: "Completed",
  },
];
