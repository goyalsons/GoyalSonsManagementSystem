// Mock Integrations Service
// In a real app, these would be actual API calls to external services

export const integrations = {
  googleSheets: {
    status: "connected",
    lastSync: "2 mins ago",
    sync: async () => {
      console.log("Syncing to Google Sheets...");
      return { success: true };
    }
  },
  email: {
    provider: "SendGrid",
    status: "active",
    sendTest: async (email: string) => {
      console.log(`Sending test email to ${email}`);
      return { success: true };
    }
  },
  storage: {
    provider: "AWS S3",
    usage: "42.5 GB",
    limit: "50 GB",
    upload: async (file: any) => {
      console.log("Uploading file to S3...", file);
      return { url: "https://s3.aws.com/bucket/file.jpg" };
    }
  }
};
