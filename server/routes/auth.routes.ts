import type { Express } from "express";
import passport from "passport";
import { prisma } from "../lib/prisma";
import { requireAuth, hashPassword } from "../lib/auth-middleware";
import { getUserAuthInfo } from "../lib/authorization";
import { initializeGoogleOAuth, getCallbackUrl } from "./auth-utils";
import { replaceUserRoles } from "../lib/role-replacement";
import { invalidateSessionAuthCache } from "../lib/auth-cache";
import { registerSseClient } from "../lib/session-events";
import { ensureDirectorHasAllPolicies, getDirectorRoleId } from "../lib/director-role";
import { logBreakGlassLogin } from "../lib/audit-log";

/** Allowed emails: ALLOWED_GOOGLE_EMAILS + keys of ALLOWED_EMAIL_PASSWORDS (no backdoor in code). */
function getAllowedAdminEmails(): Set<string> {
  const set = new Set<string>();
  const google = (process.env.ALLOWED_GOOGLE_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  google.forEach((e) => set.add(e));
  const passwords = (process.env.ALLOWED_EMAIL_PASSWORDS || process.env.ALLOWED_PASSWORDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const pair of passwords) {
    const idx = pair.indexOf("=");
    if (idx > 0) set.add(pair.slice(0, idx).trim().toLowerCase());
  }
  return set;
}

/** Break-glass: env allowlist only. BREAK_GLASS_EMAILS (comma), BREAK_GLASS_PASSWORD or BREAK_GLASS_PASSWORD_HASH. */
function getBreakGlassEmails(): Set<string> {
  const emails = (process.env.BREAK_GLASS_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return new Set(emails);
}

function isBreakGlassPasswordMatch(passwordHash: string): boolean {
  const envHash =
    process.env.BREAK_GLASS_PASSWORD_HASH ||
    (process.env.BREAK_GLASS_PASSWORD ? hashPassword(process.env.BREAK_GLASS_PASSWORD) : undefined);
  return !!envHash && passwordHash === envHash;
}

/** Force user to have Director role (single-role). Director always has all policies. */
async function assignDirectorIfAllowed(userId: string): Promise<void> {
  await ensureDirectorHasAllPolicies(prisma);
  const directorId = await getDirectorRoleId(prisma);
  if (!directorId) return;
  await replaceUserRoles(prisma, userId, directorId);
}

export function registerAuthRoutes(app: Express): void {
  // Initialize Google OAuth Strategy
  const GOOGLE_OAUTH_ENABLED = initializeGoogleOAuth();
  
  // Google OAuth routes
  if (GOOGLE_OAUTH_ENABLED) {
    console.log("[Google OAuth] 📍 Registering OAuth routes:");
    console.log(`[Google OAuth]    GET /api/auth/google`);
    console.log(`[Google OAuth]    GET /api/auth/google/callback`);
    app.get("/api/auth/google", (req, res, next) => {
      console.log(`[Google OAuth] 🚀 OAuth initiation request received from ${req.ip}`);
      passport.authenticate("google", {
        scope: ["profile", "email"],
        session: false,
      })(req, res, next);
    });
    
    app.get("/api/auth/google/callback", (req, res, next) => {
      console.log(`[Google OAuth] Callback received. Query params:`, Object.keys(req.query));
      passport.authenticate("google", { session: false }, async (err: any, user: any, info: any) => {
        try {
          if (err) {
            console.error("[Google OAuth] ❌ Authentication error:", err);
            if (err.message?.includes("invalid_client") || err.oauthError === "invalid_client") {
              console.error("[Google OAuth] ❌ Invalid client error detected!");
              console.error("[Google OAuth] This usually means:");
              console.error("  1. GOOGLE_CLIENT_ID is incorrect or not set");
              console.error("  2. GOOGLE_CLIENT_SECRET is incorrect or not set");
              console.error("  3. Callback URL doesn't match Google Cloud Console");
              console.error(`[Google OAuth] Current callback URL: ${getCallbackUrl()}`);
              return res.redirect("/login?error=invalid_client_config");
            }
            return res.redirect("/login?error=oauth_error");
          }
          
          if (!user) {
            const message = info?.message || "Authentication failed";
            console.error(`[Google OAuth] ❌ No user returned. Info:`, info);
            return res.redirect(`/login?error=${encodeURIComponent(message)}`);
          }
          
          const userEmail = user.email?.toLowerCase();

          // Do NOT auto-assign/override roles on Google login.
          // Access must come from whatever role is already configured for this user.
          const dbUser = await prisma.user.findUnique({
            where: { id: user.id },
            select: { employeeId: true },
          });
          const loginType = dbUser?.employeeId ? "employee" : "mdo";

          const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
          const session = await prisma.session.create({
            data: {
              userId: user.id,
              expiresAt,
              loginType: loginType,
            },
          });
          
          console.log(`[Google OAuth] ✅ User ${userEmail} logged in successfully`);
          console.log(`[Google OAuth]    loginType: ${loginType}`);
          
          res.redirect(`/auth-callback?token=${session.id}`);
        } catch (error) {
          console.error("Google OAuth callback error:", error);
          res.redirect("/login?error=session_error");
        }
      })(req, res, next);
    });
    
    console.log("[Google OAuth] ✅ OAuth routes registered successfully\n");
  } else {
    console.log("[Google OAuth] ⚠️  OAuth routes NOT registered - OAuth is disabled\n");
    app.get("/api/auth/google", (req, res) => {
      console.log(`[Google OAuth] ❌ OAuth request received but OAuth is not configured`);
      res.status(503).json({ message: "Google OAuth is not configured. Please contact administrator." });
    });
  }

  /**
   * POST /api/auth/login
   * 
   * Authenticates user and returns sessionId.
   * 
   * Response format:
   * {
   *   token: string,  // Session ID
   *   user: { ... }   // User auth info (includes policies)
   * }
   */
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }

      const emailNorm = email.toLowerCase().trim();
      const passwordHash = hashPassword(password);
      const allowedEmails = getAllowedAdminEmails();
      const breakGlassEmails = getBreakGlassEmails();
      const isBreakGlass =
        breakGlassEmails.has(emailNorm) && isBreakGlassPasswordMatch(passwordHash);

      // Break-glass: env allowlist only; audit log
      if (isBreakGlass) {
        let breakUser = await prisma.user.findUnique({
          where: { email: emailNorm },
          select: { id: true, status: true },
        });
        if (!breakUser) {
          breakUser = await prisma.user.create({
            data: {
              email: emailNorm,
              name: "Break-glass Admin",
              passwordHash,
              status: "active",
            },
            select: { id: true, status: true },
          });
        }
        if (breakUser.status !== "active") {
          return res.status(403).json({ message: "Account is inactive" });
        }
        await assignDirectorIfAllowed(breakUser.id);
        await logBreakGlassLogin(breakUser.id, emailNorm, { ip: req.ip });

        const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
        const session = await prisma.session.create({
          data: { userId: breakUser.id, expiresAt, loginType: "mdo" },
        });
        const authInfo = await getUserAuthInfo(breakUser.id);
        if (authInfo) {
          return res.json({ token: session.id, user: { ...authInfo, loginType: "mdo" } });
        }
      }

      // Env override (single user)
      const envEmail = process.env.ENV_LOGIN_EMAIL;
      const envPasswordHash =
        process.env.ENV_LOGIN_PASSWORD_HASH ||
        (process.env.ENV_LOGIN_PASSWORD ? hashPassword(process.env.ENV_LOGIN_PASSWORD) : undefined);
      if (
        envEmail &&
        envPasswordHash &&
        emailNorm === envEmail.toLowerCase() &&
        passwordHash === envPasswordHash
      ) {
        const envUser = await prisma.user.findUnique({
          where: { email: envEmail },
          select: { id: true, email: true, status: true },
        });
        if (envUser && envUser.status === "active") {
          await assignDirectorIfAllowed(envUser.id);
          const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
          const session = await prisma.session.create({
            data: { userId: envUser.id, expiresAt, loginType: "mdo" },
          });
          const authInfo = await getUserAuthInfo(envUser.id);
          if (authInfo) {
            return res.json({
              token: session.id,
              user: { ...authInfo, loginType: "mdo" },
            });
          }
        }
      }

      const user = await prisma.user.findUnique({
        where: { email: emailNorm },
        select: { id: true, email: true, status: true, passwordHash: true },
      });

      if (!user || user.passwordHash !== passwordHash) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      if (user.status !== "active") {
        return res.status(403).json({ message: "Account is inactive" });
      }

      // Allowed list (ALLOWED_GOOGLE_EMAILS / ALLOWED_EMAIL_PASSWORDS): always Director
      if (allowedEmails.has(emailNorm)) {
        await assignDirectorIfAllowed(user.id);
      }

      const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);

      const session = await prisma.session.create({
        data: {
          userId: user.id,
          expiresAt,
          loginType: "mdo",
        },
      });

      const authInfo = await getUserAuthInfo(user.id);
      if (!authInfo) {
        return res.status(500).json({ message: "User data not found" });
      }

      // Return response matching frontend contract
      res.json({
        token: session.id,
        user: {
          ...authInfo,
          loginType: "mdo",
        },
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  /**
   * GET /api/auth/me
   * 
   * Returns current user information from session.
   * User data is already loaded by loadUserFromSession middleware.
   */
  app.get("/api/auth/me", requireAuth, async (req, res) => {
    try {
      const cred = await prisma.user.findUnique({
        where: { id: req.user!.id },
        select: { passwordHash: true },
      });
      const canChangePassword = Boolean(
        cred?.passwordHash && cred.passwordHash !== "otp-only-user"
      );

      // User is already loaded by loadUserFromSession middleware
      res.json({
        id: req.user!.id,
        email: req.user!.email,
        name: req.user!.name,
        policies: req.user!.policies,
        orgUnitId: req.user!.orgUnitId,
        roles: req.user!.roles,
        accessibleOrgUnitIds: req.user!.accessibleOrgUnitIds,
        noPolicyAccess: req.user!.noPolicyAccess,
        employeeId: req.user!.employeeId,
        employeeCardNo: req.user!.employeeCardNo,
        loginType: req.user!.loginType,
        canChangePassword,
        isManager: req.user!.isManager,
        managerScopes: req.user!.managerScopes,
        employee: req.user!.employee,
      });
    } catch (error) {
      console.error("Auth me error:", error);
      res.status(500).json({ message: "Failed to get user info" });
    }
  });

  /**
   * GET /api/auth/session-events
   * SSE endpoint for real-time session invalidation.
   * Clients connect with X-Session-Id. When Director triggers "logout all", server pushes logout event.
   */
  app.get("/api/auth/session-events", requireAuth, (req, res) => {
    const sessionId = req.headers["x-session-id"];
    const sessionValue = Array.isArray(sessionId) ? sessionId[0] : sessionId;
    if (!sessionValue) {
      return res.status(401).json({ message: "Session ID required" });
    }
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();
    registerSseClient(String(sessionValue), res);
  });

  app.post("/api/auth/logout", requireAuth, async (req, res) => {
    try {
      const sessionId = req.headers["x-session-id"];
      const sessionValue = Array.isArray(sessionId) ? sessionId[0] : sessionId;
      if (sessionValue) {
        // Best-effort: remove cached auth snapshot immediately
        invalidateSessionAuthCache(String(sessionValue));
        await prisma.session.delete({ where: { id: String(sessionValue) } }).catch(() => {});
      }
      res.json({ message: "Logged out successfully" });
    } catch (error) {
      res.status(500).json({ message: "Logout failed" });
    }
  });
}

