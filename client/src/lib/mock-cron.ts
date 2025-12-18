// Mock Cron Jobs Service
// Simulates background worker configurations

export const cronJobs = [
  { 
    id: "job-001", 
    name: "Daily Attendance Sync", 
    schedule: "0 * * * *", 
    status: "active", 
    lastRun: new Date().toISOString() 
  },
  { 
    id: "job-002", 
    name: "Expense Report Generation", 
    schedule: "0 21 * * *", 
    status: "scheduled", 
    lastRun: new Date(Date.now() - 86400000).toISOString() 
  },
  { 
    id: "job-003", 
    name: "Database Backup", 
    schedule: "0 0 * * *", 
    status: "completed", 
    lastRun: new Date(Date.now() - 28800000).toISOString() 
  }
];
