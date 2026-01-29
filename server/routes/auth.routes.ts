import type { Express } from "express";
import passport from "passport";
import { prisma } from "../lib/prisma";
import { requireAuth, hashPassword } from "../lib/auth-middleware";
import { getUserAuthInfo } from "../lib/authorization";
import { initializeGoogleOAuth, getCallbackUrl } from "./auth-utils";
import { invalidateSessionAuthCache } from "../lib/auth-cache";

/**
 * BUSINESS OVERRIDE:
 * Any user who logs in via email/password should be treated as "Director"
 * and should receive ALL policies.
 *
 * NOTE: This mutates RBAC state in the database (UserRole + RolePolicy).
 */
async function promotePasswordLoginToDirector(userId: string): Promise<void> {
  // Ensure Director role exists
  const directorRole = await prisma.role.upsert({
    where: { name: "Director" },
    update: {},
    create: {
      name: "Director",
      description: "Auto-promoted role for password logins",
    },
    select: { id: true },
  });

  // Ensure Director role has ALL policies (as present in DB)
  const allPolicies = await prisma.policy.findMany({ select: { id: true } });
  const existingRolePolicies = await prisma.rolePolicy.findMany({
    where: { roleId: directorRole.id },
    select: { policyId: true },
  });
  const existingPolicyIds = new Set(existingRolePolicies.map((rp) => rp.policyId));
  const missingRolePolicies = allPolicies
    .filter((p) => !existingPolicyIds.has(p.id))
    .map((p) => ({ roleId: directorRole.id, policyId: p.id }));

  if (missingRolePolicies.length > 0) {
    await prisma.rolePolicy.createMany({
      data: missingRolePolicies,
      skipDuplicates: true,
    });
  }

  // Ensure user has Director role
  const userHasDirectorRole = await prisma.userRole.findUnique({
    where: {
      userId_roleId: {
        userId,
        roleId: directorRole.id,
      },
    },
    select: { userId: true },
  });

  if (!userHasDirectorRole) {
    await prisma.userRole.create({
      data: {
        userId,
        roleId: directorRole.id,
      },
    });
  }

  // Bump policyVersion so session snapshots invalidate when role/policies change
  if (missingRolePolicies.length > 0 || !userHasDirectorRole) {
    await prisma.user.update({
      where: { id: userId },
      data: { policyVersion: { increment: 1 } },
    });
  }
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
          const loginType = "mdo";

          // Google login (whitelisted by strategy): promote to Director with all policies
          // so Director mode is full access and not restricted by policies.
          await promotePasswordLoginToDirector(user.id);

          const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
          const session = await prisma.session.create({
            data: {
              userId: user.id,
              expiresAt,
              loginType: loginType,
            },
          });
          
          console.log(`[Google OAuth] ✅ User ${userEmail} logged in successfully`);
          console.log(`[Google OAuth]    loginType: ${loginType} (Director Mode)`);
          
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

      // Authenticate user (checks password)
      const passwordHash = hashPassword(password);
      const user = await prisma.user.findUnique({
        where: { email, passwordHash },
        select: { id: true, email: true, status: true },
      });

      if (!user) {
        // Check env-based override
        const envEmail = process.env.ENV_LOGIN_EMAIL;
        const envPasswordHash =
          process.env.ENV_LOGIN_PASSWORD_HASH ||
          (process.env.ENV_LOGIN_PASSWORD ? hashPassword(process.env.ENV_LOGIN_PASSWORD) : undefined);

        if (envEmail && envPasswordHash && email.toLowerCase() === envEmail.toLowerCase() && passwordHash === envPasswordHash) {
          const envUser = await prisma.user.findUnique({
            where: { email: envEmail },
            select: { id: true, email: true, status: true },
          });
          if (envUser) {
            // Password login override: promote to Director with all policies
            await promotePasswordLoginToDirector(envUser.id);

            // Use env user
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 7);

            const session = await prisma.session.create({
              data: {
                userId: envUser.id,
                expiresAt,
                loginType: "mdo",
              },
            });

            const authInfo = await getUserAuthInfo(envUser.id);
            if (authInfo) {
              return res.json({
                token: session.id,
                user: {
                  ...authInfo,
                  loginType: "mdo",
                },
              });
            }
          }
        }

        return res.status(401).json({ message: "Invalid email or password" });
      }

      // Check if user is active
      if (user.status !== "active") {
        return res.status(403).json({ message: "Account is inactive" });
      }

      // Password login: promote to Director with all policies
      await promotePasswordLoginToDirector(user.id);

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

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
      // User is already loaded by loadUserFromSession middleware
      res.json({
        id: req.user!.id,
        email: req.user!.email,
        name: req.user!.name,
        policies: req.user!.policies, // From JWT snapshot
        orgUnitId: req.user!.orgUnitId,
        roles: req.user!.roles,
        accessibleOrgUnitIds: req.user!.accessibleOrgUnitIds,
        employeeId: req.user!.employeeId,
        employeeCardNo: req.user!.employeeCardNo,
        loginType: req.user!.loginType,
        isManager: req.user!.isManager,
        managerScopes: req.user!.managerScopes,
      });
    } catch (error) {
      console.error("Auth me error:", error);
      res.status(500).json({ message: "Failed to get user info" });
    }
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

