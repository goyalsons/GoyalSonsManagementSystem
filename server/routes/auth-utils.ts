import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { prisma } from "../lib/prisma";
import { hashPassword } from "../lib/auth-middleware";

// MDO email whitelist
const getAllowedGoogleEmails = (): string[] => {
  if (process.env.ALLOWED_GOOGLE_EMAILS) {
    return process.env.ALLOWED_GOOGLE_EMAILS.split(",")
      .map(email => email.trim().toLowerCase())
      .filter(email => email.length > 0);
  }
  return [];
};

const MDO_EMAIL_WHITELIST = getAllowedGoogleEmails();

// Helper functions for OAuth configuration
export const getBaseUrl = () => {
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

export const getCallbackUrl = () => {
  if (process.env.GOOGLE_CALLBACK_URL) {
    return process.env.GOOGLE_CALLBACK_URL;
  }
  return `${getBaseUrl()}/api/auth/google/callback`;
};

// Initialize Google OAuth Strategy
export function initializeGoogleOAuth(): boolean {
  const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
  const GOOGLE_OAUTH_ENABLED = !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);

  console.log("\n" + "=".repeat(60));
  console.log("[Google OAuth] 🔐 Initializing Google OAuth Strategy");
  console.log("=".repeat(60));

  if (!GOOGLE_CLIENT_ID) {
    console.error("[Google OAuth] ❌ GOOGLE_CLIENT_ID is not set in environment variables");
  }
  if (!GOOGLE_CLIENT_SECRET) {
    console.error("[Google OAuth] ❌ GOOGLE_CLIENT_SECRET is not set in environment variables");
  }

  if (!GOOGLE_OAUTH_ENABLED) {
    console.warn("[Google OAuth] ⚠️  OAuth is DISABLED - Missing required environment variables");
    console.warn("[Google OAuth]    Required: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET");
    console.log("=".repeat(60) + "\n");
    return false;
  }

  const maskedClientId = GOOGLE_CLIENT_ID.length > 30 
    ? `${GOOGLE_CLIENT_ID.substring(0, 25)}...${GOOGLE_CLIENT_ID.substring(GOOGLE_CLIENT_ID.length - 15)}`
    : GOOGLE_CLIENT_ID;
  const maskedSecret = GOOGLE_CLIENT_SECRET 
    ? `***${GOOGLE_CLIENT_SECRET.substring(GOOGLE_CLIENT_SECRET.length - 4)}`
    : "NOT SET";

  console.log(`[Google OAuth] ✅ OAuth is ENABLED`);
  console.log(`[Google OAuth]    Client ID: ${maskedClientId}`);
  console.log(`[Google OAuth]    Client ID Length: ${GOOGLE_CLIENT_ID.length} characters`);
  console.log(`[Google OAuth]    Client Secret: ${maskedSecret}`);
  console.log(`[Google OAuth]    Client Secret Length: ${GOOGLE_CLIENT_SECRET.length} characters`);

  const callbackURL = getCallbackUrl();
  console.log(`[Google OAuth]    Callback URL: ${callbackURL}`);
  console.log(`[Google OAuth]    Base URL: ${getBaseUrl()}`);
  console.log(`[Google OAuth]    NODE_ENV: ${process.env.NODE_ENV || "not set"}`);

  try {
    passport.use(new GoogleStrategy({
      clientID: GOOGLE_CLIENT_ID,
      clientSecret: GOOGLE_CLIENT_SECRET,
      callbackURL: callbackURL,
    }, async (accessToken: string, refreshToken: string, profile: any, done: any) => {
      try {
        const email = profile.emails?.[0]?.value?.toLowerCase();
        if (!email) {
          console.error("[Google OAuth] ❌ No email found in Google profile");
          return done(null, false, { message: "No email found in Google profile" });
        }
        
        console.log(`[Google OAuth] 🔍 Authenticating user: ${email}`);
        
        const isAllowedEmail = MDO_EMAIL_WHITELIST.includes(email);
        if (!isAllowedEmail) {
          console.warn(`[Google OAuth] ❌ Access denied for email: ${email}. Email not in whitelist.`);
          console.warn(`[Google OAuth]    Allowed emails: ${MDO_EMAIL_WHITELIST.join(", ")}`);
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
            },
          });
          const defaultRole = await prisma.role.findUnique({
            where: { name: "MDO" },
            select: { id: true },
          });
          if (defaultRole) {
            await prisma.userRole.upsert({
              where: { userId_roleId: { userId: user.id, roleId: defaultRole.id } },
              update: {},
              create: { userId: user.id, roleId: defaultRole.id },
            });
          }
          console.log(`[Google OAuth] ✅ Created new MDO user via Google OAuth: ${email}`);
        } else {
          console.log(`[Google OAuth] ✅ Found existing user: ${email}`);
        }
        
        return done(null, user);
      } catch (error) {
        console.error("[Google OAuth] ❌ Strategy callback error:", error);
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
        console.error("[Google OAuth] ❌ Deserialize user error:", error);
        done(error);
      }
    });

    console.log("[Google OAuth] ✅ Google Strategy registered successfully");
    console.log("=".repeat(60) + "\n");
    return true;
  } catch (error) {
    console.error("[Google OAuth] ❌ Failed to register Google Strategy:", error);
    console.log("=".repeat(60) + "\n");
    return false;
  }
}

