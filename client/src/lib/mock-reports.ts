import { z } from "zod";

export interface ReportConfig {
  id: string;
  name: string;
  type: "pdf" | "excel" | "csv";
  frequency: "daily" | "weekly" | "monthly";
  recipients: string[];
}

export const reportTemplates: ReportConfig[] = [
  {
    id: "rpt-001",
    name: "Monthly Attendance Summary",
    type: "pdf",
    frequency: "monthly",
    recipients: ["hr@goyalsons.com", "admin@goyalsons.com"]
  },
  {
    id: "rpt-002",
    name: "Expense Claim Analysis",
    type: "excel",
    frequency: "monthly",
    recipients: ["finance@goyalsons.com"]
  },
  {
    id: "rpt-003",
    name: "Employee Performance Review",
    type: "pdf",
    frequency: "monthly",
    recipients: ["managers@goyalsons.com"]
  }
];
