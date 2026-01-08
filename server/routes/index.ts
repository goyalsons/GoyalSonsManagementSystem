import type { Express } from "express";
import type { Server } from "http";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { loadUserFromSession, requireMDO, hashPassword } from "../lib/auth-middleware";
import { prisma } from "../lib/prisma";
import { registerSalesRoutes } from "./sales.routes";
import { registerSalesStaffRoutes } from "./sales-staff.routes";
import { registerLookupRoutes } from "./lookup.routes";
import { registerEmpManagerRoutes } from "./emp-manager.routes";
import { registerHelpTicketsRoutes } from "./help-tickets.routes";
import { registerLegacyRoutes } from "../routes-legacy";

// Import OAuth initialization functions from the main routes file
// TODO: Move these to a separate auth utilities file
const getBaseUrl = () => {
  if (process.env.BASE_URL) {
    return process.env.BASE_URL;
  }
  if (process.env.GOOGLE_CALLBACK_URL) {
    const url = new URL(process.env.GOOGLE_CALLBACK_URL);
    return `${url.protocol}//${url.host}`;
  }
  if (process.env.NODE_ENV === "production") {
    return "https://goyalsons.com";
  }
  return "http://localhost:5000";
};

const getCallbackUrl = () => {
  if (process.env.GOOGLE_CALLBACK_URL) {
    return process.env.GOOGLE_CALLBACK_URL;
  }
  return `${getBaseUrl()}/api/auth/google/callback`;
};

// Initialize Google OAuth Strategy
function initializeGoogleOAuth(): boolean {
  const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
  const GOOGLE_OAUTH_ENABLED = !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);

  if (!GOOGLE_OAUTH_ENABLED) {
    return false;
  }

  try {

    const getAllowedGoogleEmails = (): string[] => {
      if (process.env.ALLOWED_GOOGLE_EMAILS) {
        return process.env.ALLOWED_GOOGLE_EMAILS.split(",")
          .map(email => email.trim().toLowerCase())
          .filter(email => email.length > 0);
      }
      return [];
    };

    const MDO_EMAIL_WHITELIST = getAllowedGoogleEmails();

    passport.use(new GoogleStrategy({
      clientID: GOOGLE_CLIENT_ID,
      clientSecret: GOOGLE_CLIENT_SECRET,
      callbackURL: getCallbackUrl(),
    }, async (accessToken: string, refreshToken: string, profile: any, done: any) => {
      try {
        const email = profile.emails?.[0]?.value?.toLowerCase();
        if (!email) {
          return done(null, false, { message: "No email found in Google profile" });
        }
        
        const isAllowedEmail = MDO_EMAIL_WHITELIST.includes(email);
        if (!isAllowedEmail) {
          return done(null, false, { 
            message: "Access denied. Your email is not authorized to sign in with Google." 
          });
        }
        
        let user = await prisma.user.findUnique({
          where: { email },
        });
        
        if (!user) {
          const passwordHash = hashPassword(`google_oauth_${Date.now()}_${Math.random()}`);
          user = await prisma.user.create({
            data: {
              email,
              name: profile.displayName || profile.name?.givenName || email.split("@")[0],
              passwordHash,
              status: "active",
              isSuperAdmin: false,
            },
          });
        }
        
        return done(null, user);
      } catch (error) {
        return done(error as Error);
      }
    }));
    
    passport.serializeUser((user: any, done: any) => {
      done(null, user.id);
    });
    
    passport.deserializeUser(async (id: any, done: any) => {
      try {
        const user = await prisma.user.findUnique({ where: { id: String(id) } });
        done(null, user);
      } catch (error) {
        done(error);
      }
    });

    return true;
  } catch (error) {
    console.error("[Google OAuth] ❌ Failed to register Google Strategy:", error);
    return false;
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Health check endpoint for Railway
  app.get("/api/health", (req, res) => {
    res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
  });
  
  // Initialize passport BEFORE registering strategies
  app.use(passport.initialize());
  
  // Initialize Google OAuth Strategy
  const GOOGLE_OAUTH_ENABLED = initializeGoogleOAuth();
  
  app.use(loadUserFromSession);
  
  // Google OAuth routes
  if (GOOGLE_OAUTH_ENABLED) {
    app.get("/api/auth/google", (req, res, next) => {
      passport.authenticate("google", {
        scope: ["profile", "email"],
        session: false,
      })(req, res, next);
    });
    
    app.get("/api/auth/google/callback", (req, res, next) => {
      passport.authenticate("google", { session: false }, async (err: any, user: any, info: any) => {
        try {
          if (err) {
            if (err.message?.includes("invalid_client") || err.oauthError === "invalid_client") {
              return res.redirect("/login?error=invalid_client_config");
            }
            return res.redirect("/login?error=oauth_error");
          }
          
          if (!user) {
            const message = info?.message || "Authentication failed";
            return res.redirect(`/login?error=${encodeURIComponent(message)}`);
          }
          
          const loginType = "mdo";
          const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
          const session = await prisma.session.create({
            data: {
              userId: user.id,
              expiresAt,
              loginType: loginType,
            },
          });
          
          res.redirect(`/auth-callback?token=${session.id}`);
        } catch (error) {
          console.error("Google OAuth callback error:", error);
          res.redirect("/login?error=session_error");
        }
      })(req, res, next);
    });
  }

  // Protect all /api/mdo/* routes with requireMDO middleware
  app.use("/api/mdo", requireMDO);

  // Register all route modules
  registerSalesRoutes(app);
  registerSalesStaffRoutes(app);
  registerLookupRoutes(app);
  registerEmpManagerRoutes(app);
  registerHelpTicketsRoutes(app);
  
  // TODO: Import and register other route modules as they are created:
  // registerAuthRoutes(app);
  // registerRolesRoutes(app);
  // registerManagerRoutes(app);
  // etc.

  // For now, import the rest from the legacy routes file
  // This allows incremental migration - routes will be moved to separate files gradually
  // TODO: As routes are extracted to separate files, remove them from routes-legacy.ts
  // and register them here instead
  // Note: Sales routes (lines 4270-4799 in legacy) are already moved to sales.routes.ts
  // Comment out or remove the sales section from routes-legacy.ts to avoid duplication
  await registerLegacyRoutes(httpServer, app);

  return httpServer;
}

