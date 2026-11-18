import type { CookieOptions, Request, Response } from "express";
import { db } from "../db/db.js";
import { emailVerificationTokens, oauthAccounts, sessions, users } from "../models/auth.schema.js";
import * as bcrypt from "bcryptjs";
import { and, eq, gt, isNull } from "drizzle-orm";
import crypto from 'crypto'
import { Resend } from 'resend';
import { readFileSync } from "node:fs";
import { clearAuthCookies, createSession, generateAuthTokens, hashToken, REFRESH_TOKEN_TTL_MS, setAuthCookies } from "../services/token.service.js";
import { createGoogleAuthRequest, getGoogleProfile } from "../services/google.service.js";

const verifyEmailTemplate = readFileSync(
  new URL("../templates/verify-email.html", import.meta.url),
  "utf8",
);

const oauthCookie: CookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",                  // must be lax: the callback is a cross-site redirect from google.com
  path: "/api/auth/google",         // only sent to the Google routes
  maxAge: 10 * 60 * 1000,           // 10 minutes to complete the login
};


function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/{{(\w+)}}/g, (_, key) => vars[key] ?? "");
}


async function hashPassword(plainTextPassword: string): Promise<string> {
  const saltRounds = 10;
  const hashedPassword = await bcrypt.hash(plainTextPassword, saltRounds);
  return hashedPassword;
}

const resend = new Resend(process.env.EMAIL_API_KEY);


const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const UserController = {
  signup: async (req: Request, res: Response) => {
    try {
      const { email, password, name } = req.body ?? {};

      if (
        typeof email !== "string" ||
        typeof password !== "string" ||
        typeof name !== "string" ||
        !name.trim()
      ) {
        return res
          .status(400)
          .json({ message: "name, email and password are required" });
      }

      const normalizedEmail = email.trim().toLowerCase();
      if (!EMAIL_RE.test(normalizedEmail)) {
        return res.status(400).json({ message: "Invalid email address" });
      }
      if (password.length < 8) {
        return res
          .status(400)
          .json({ message: "Password must be at least 8 characters" });
      }

      const passwordHash = await hashPassword(password);

      const [user] = await db
        .insert(users)
        .values({ name: name.trim(), email: normalizedEmail, passwordHash })
        .returning({
          id: users.id,
          name: users.name,
          email: users.email,
          isEmailVerified: users.isEmailVerified,
          createdAt: users.createdAt,
        });

      if (user) {
        // Generate a fresh token per signup (must not be shared across users)
        const token = crypto.randomBytes(32).toString("hex");
        const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

        await db.insert(emailVerificationTokens).values({
          userId: user.id,
          tokenHash,
          expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        });

        const appUrl = process.env.APP_URL ?? "http://localhost:3000";
        const verificationLink = `${appUrl}/api/verify-email?token=${token}`;

        const html = renderTemplate(verifyEmailTemplate, {
          appName: "Auth System",
          name: escapeHtml(user.name),
          verificationLink,
          expiresIn: "15 minutes",
          year: String(new Date().getFullYear()),
        });

        const { error: emailError } = await resend.emails.send({
          from: 'onboarding@resend.dev',
          to: user.email,
          subject: 'Verify your email address',
          html,
        });

        if (emailError) {
          console.error("Failed to send verification email:", emailError);
        }
      }

      return res.status(201).json({ message: "User created", user });
    } catch (error: any) {
      // 23505 = unique_violation (email already exists)
      const code = error?.code ?? error?.cause?.code;
      if (code === "23505") {
        return res.status(409).json({ message: "Email already registered" });
      }
      console.error("Signup error:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  },


  login: async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body ?? {};

      if (typeof email !== "string" || !email.trim()) {
        return res
          .status(400)
          .json({ status_code: 400, message: "Email is required" });
      }
      if (typeof password !== "string" || !password) {
        return res
          .status(400)
          .json({ status_code: 400, message: "Password is required" });
      }

      const normalizedEmail = email.trim().toLowerCase();

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, normalizedEmail))
        .limit(1);

      const isMatch =
        !!user?.passwordHash &&
        (await bcrypt.compare(password, user.passwordHash));

      if (!user || !isMatch) {
        return res
          .status(401)
          .json({ status_code: 401, message: "Invalid email or password" });
      }

      if (!user.isEmailVerified) {
        return res
          .status(400)
          .json({ status_code: 400, message: "Please authenticate your email" });
      }
      await createSession(res,user)
      const { passwordHash: _, ...safeUser } = user;
      return res
        .status(200)
        .json({
          status_code: 200,
          message: "Login successful",
          user: safeUser,
        });
    } catch (error) {
      console.error("Login error:", error);
      return res
        .status(500)
        .json({ status_code: 500, message: "Internal server error" });
    }
  },

  googleStart: async (req: Request, res: Response) => {
    try {
      const { url, state, codeVerifier } = await createGoogleAuthRequest();
      res.cookie("oauth_state", state, oauthCookie);
      res.cookie("oauth_code_verifier", codeVerifier, oauthCookie);
      return res.redirect(url);
    } catch (error) {
      console.error("Google start error:", error);
      return res.status(500).json({ status_code: 500, message: "Internal server error" });
    }
  },

  googleCallback: async (req: Request, res: Response) => {
    // Single-use: clear the temporary cookies whatever happens
    const expectedState = req.cookies?.oauth_state;
    const codeVerifier = req.cookies?.oauth_code_verifier;
    res.clearCookie("oauth_state", { ...oauthCookie, maxAge: undefined });
    res.clearCookie("oauth_code_verifier", { ...oauthCookie, maxAge: undefined });

    try {
      const { code, state, error } = req.query;

      // User clicked "Cancel" on Google's screen
      if (error) {
        return res.status(400).json({ status_code: 400, message: "Google login was cancelled" });
      }

      if (
        typeof code !== "string" ||
        typeof state !== "string" ||
        typeof expectedState !== "string" ||
        typeof codeVerifier !== "string" ||
        state !== expectedState
      ) {
        return res.status(400).json({ status_code: 400, message: "Invalid OAuth state" });
      }

      const profile = await getGoogleProfile(code, codeVerifier);

      const user = await db.transaction(async (tx) => {
        // Case A: returning Google user
        const [linked] = await tx
          .select({ id: users.id, email: users.email })
          .from(oauthAccounts)
          .innerJoin(users, eq(oauthAccounts.userId, users.id))
          .where(
            and(
              eq(oauthAccounts.provider, "google"),
              eq(oauthAccounts.providerAccountId, profile.sub),
            ),
          )
          .limit(1);

        if (linked) return linked;

        // Cases B and C both trust the email, so Google must have verified it
        if (!profile.emailVerified) return null;

        const [existing] = await tx
          .select()
          .from(users)
          .where(eq(users.email, profile.email))
          .limit(1);

        let account: { id: string; email: string };

        if (existing) {
          // Case B: link to the existing account
          await tx
            .update(users)
            .set({
              isEmailVerified: true,
              // Pre-account-takeover protection: an unverified account's password
              // may have been set by someone else.
              ...(existing.isEmailVerified ? {} : { passwordHash: null }),
            })
            .where(eq(users.id, existing.id));
          account = { id: existing.id, email: existing.email };
        } else {
          // Case C: brand-new user
          const [created] = await tx
            .insert(users)
            .values({
              name: profile.name,
              email: profile.email,
              passwordHash: null,
              isEmailVerified: true,
            })
            .returning({ id: users.id, email: users.email });
          account = created!;
        }

        await tx.insert(oauthAccounts).values({
          userId: account.id,
          provider: "google",
          providerAccountId: profile.sub,
        });

        return account;
      });

      if (!user) {
        return res.status(400).json({ status_code: 400, message: "Your Google email is not verified" });
      }

      await createSession(res, user);

      // No frontend yet: land on /me to see the result. Later: res.redirect(process.env.FRONTEND_URL!)
      return res.redirect("/api/me");
    } catch (error) {
      console.error("Google callback error:", error);
      return res.status(500).json({ status_code: 500, message: "Google login failed" });
    }
  },



  verifyEmail: async (req: Request, res: Response) => {
    try {
      // Email links are GET requests (?token=...), but also accept a JSON body
      const token = req.query.token ?? req.body?.token;

      if (!token || typeof token !== "string") {
        return res.status(400).json({
          message: "Verification token is required",
        });
      }

      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

      const verifiedUserId = await db.transaction(async (tx) => {
        // Atomically claim the token: only succeeds if it exists, is unused and
        // not expired. Prevents the same link being used twice concurrently.
        const [claimed] = await tx
          .update(emailVerificationTokens)
          .set({ usedAt: new Date() })
          .where(
            and(
              eq(emailVerificationTokens.tokenHash, tokenHash),
              isNull(emailVerificationTokens.usedAt),
              gt(emailVerificationTokens.expiresAt, new Date()),
            ),
          )
          .returning({ userId: emailVerificationTokens.userId });

        if (!claimed) return null;

        await tx
          .update(users)
          .set({ isEmailVerified: true })
          .where(eq(users.id, claimed.userId));

        return claimed.userId;
      });

      if (!verifiedUserId) {
        return res.status(400).json({
          message: "Verification link is invalid or has expired",
        });
      }

      return res.status(200).json({ message: "Email verified successfully" });
    } catch (error) {
      console.error("Verify email error:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  },

  refresh: async (req: Request, res: Response) => {
    try {
      const refreshToken = req.cookies?.refreshToken;
      if (typeof refreshToken !== "string" || !refreshToken) {
        return res.status(400).json({ status_code: 400, message: "Refresh token is required" });
      }

      const tokens = await db.transaction(async (tx) => {
        // Atomically revoke the presented token. Only succeeds if it exists,
        // isn't revoked and isn't expired, so the same token can't be used twice.
        const [session] = await tx
          .update(sessions)
          .set({ revokedAt: new Date() })
          .where(
            and(
              eq(sessions.refreshTokenHash, hashToken(refreshToken)),
              isNull(sessions.revokedAt),
              gt(sessions.expiresAt, new Date()),
            ),
          )
          .returning({ userId: sessions.userId });

        if (!session) return null;

        const [user] = await tx
          .select({ id: users.id, email: users.email })
          .from(users)
          .where(eq(users.id, session.userId))
          .limit(1);

        if (!user) return null;

        const newTokens = generateAuthTokens({ userId: user.id, email: user.email });

        await tx.insert(sessions).values({
          userId: user.id,
          refreshTokenHash: hashToken(newTokens.refreshToken),
          expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
        });

        return newTokens;
      });

      if (!tokens) {
        clearAuthCookies(res);
        return res.status(401).json({ status_code: 401, message: "Invalid or expired refresh token" });
      }
      setAuthCookies(res, tokens);

      return res.status(200).json({ status_code: 200, message: "Token refreshed" });
    } catch (error) {
      console.error("Refresh error:", error);
      return res.status(500).json({ status_code: 500, message: "Internal server error" });
    }
  },

  logout: async (req: Request, res: Response) => {
    try {
      const refreshToken = req.cookies?.refreshToken;

      if (typeof refreshToken === "string" && refreshToken) {
        await db
          .update(sessions)
          .set({ revokedAt: new Date() })
          .where(
            and(
              eq(sessions.refreshTokenHash, hashToken(refreshToken)),
              isNull(sessions.revokedAt),
            ),
          );
      }

      clearAuthCookies(res);
      return res.status(200).json({ status_code: 200, message: "Logged out successfully" });
    }  catch (error) {
      console.error("Logout error:", error);
      return res.status(500).json({ status_code: 500, message: "Internal server error" });

    }
  },

  me: async (req: Request, res: Response) => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({ status_code: 401, message: "Unauthorized" });
      }

      const [user] = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          isEmailVerified: users.isEmailVerified,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) {
        return res.status(404).json({ status_code: 404, message: "User not found" });
      }

      return res.status(200).json({ status_code: 200, user });
    } catch (error) {
      console.error("Me error:", error);
      return res.status(500).json({ status_code: 500, message: "Internal server error" });
    }
  },

};

export default UserController;
