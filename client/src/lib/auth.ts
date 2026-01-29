// Mock Authentication Service
// In a real Next.js app, this would integrate with NextAuth.js

export const auth = {
  signIn: async (provider: string, credentials: any) => {
    console.log("Signing in with", provider, credentials);
    return { ok: true };
  },
  signOut: async () => {
    console.log("Signing out");
    return { ok: true };
  },
  getSession: async () => {
    return {
      user: {
        name: "Admin User",
        email: "admin@example.com",
        image: "https://github.com/shadcn.png",
      },
    };
  },
};
