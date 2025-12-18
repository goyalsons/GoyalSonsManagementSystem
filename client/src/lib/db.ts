// Mock Database Client
// In a real Next.js app, this would export the PrismaClient instance

export const db = {
  user: {
    findUnique: async () => ({ id: "user_1", name: "Admin User" }),
    findMany: async () => [],
  },
  employee: {
    findMany: async () => [],
    create: async (data: any) => data,
  },
  attendance: {
    create: async (data: any) => data,
    findMany: async () => [],
  }
};
