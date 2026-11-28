import type { Request, Response } from "express";
import { db } from "../db/db.js";
import { companies, invitations, permission, userPermissions } from "../models/company.schema.js";
import { users } from "../models/auth.schema.js";
import crypto from "crypto";
import * as bcrypt from "bcryptjs";
import { and, eq, gt, isNull, TransactionRollbackError } from "drizzle-orm";
import { createSession, hashToken } from "../services/token.service.js";
import { INVITE_TTL_DAYS, sendInvitationEmail } from "../services/emailsend.service.js";

type Permission = (typeof permission.enumValues)[number];
const isPermission = (p: unknown): p is Permission =>
    typeof p === "string" && (permission.enumValues as readonly string[]).includes(p);

// Thrown inside a transaction to roll it back and send a specific HTTP status.
class InviteError extends Error {
    constructor(public status: number, message: string) {
        super(message);
    }
}

const CompanyController = {
    createCompany: async (req: Request, res: Response) => {
        try {
            const userId = req.user?.userId;
            if (!userId) return res.status(401).json({ status_code: 401, message: "Unauthorized" });

            const { name } = req.body ?? {};
            if (typeof name !== "string" || !name.trim()) {
                return res.status(400).json({ status_code: 400, message: "Company name is required" });
            }
            if (name.trim().length > 200) {
                return res.status(400).json({ status_code: 400, message: "Company name must be at most 200 characters" });
            }

            const company = await db.transaction(async (tx) => {
                const [created] = await tx.insert(companies)
                    .values({ name: name.trim() })
                    .returning({ id: companies.id, name: companies.name });

                if (!created) throw new Error("Company insert returned no row");

                const updated = await tx.update(users)
                    .set({ companyId: created.id, role: "admin" })
                    .where(and(eq(users.id, userId), isNull(users.companyId)))
                    .returning({ id: users.id });

                if (updated.length === 0) {
                    tx.rollback(); // throws, undoing the company insert
                }
                return created;
            });

            return res.status(201).json({ status_code: 201, company });
        } catch (error) {
            if (error instanceof TransactionRollbackError) {
                return res.status(409).json({ status_code: 409, message: "You already belong to a company" });
            }
            console.error("Create company error:", error);
            return res.status(500).json({ status_code: 500, message: "Internal server error" });
        }
    },
    inviteUser: async (req: Request, res: Response) => {
        try {
            const adminId = req.user?.userId;
            if (!adminId) return res.status(401).json({ status_code: 401, message: "Unauthorized" });

            const { email, permissions } = req.body ?? {};
            console.log('email,',email)
            if (typeof email !== "string" || !email.trim()) {
                return res.status(400).json({ status_code: 400, message: "Email is required" });
            }
            if (!Array.isArray(permissions) || !permissions.every(isPermission)) {
                return res.status(400).json({ status_code: 400, message: "Invalid permissions" });
            }
            const normalizedEmail = email.trim().toLowerCase();

            const [admin] = await db
                .select({ name: users.name, role: users.role, companyId: companies.id, companyName: companies.name })
                .from(users)
                .innerJoin(companies, eq(users.companyId, companies.id))
                .where(eq(users.id, adminId))
                .limit(1);
            if (!admin || admin.role !== "admin") {
                return res.status(403).json({ status_code: 403, message: "Only admins can invite users" });
            }

            const [existing] = await db.select({ companyId: users.companyId })
                .from(users).where(eq(users.email, normalizedEmail)).limit(1);
            if (existing?.companyId) {
                return res.status(409).json({ status_code: 409, message: "This user already belongs to a company" });
            }

            const token = crypto.randomBytes(32).toString("hex");
            await db.transaction(async (tx) => {
                // Replace any pending invite, otherwise the partial unique index rejects the insert
                await tx.delete(invitations).where(and(
                    eq(invitations.companyId, admin.companyId),
                    eq(invitations.email, normalizedEmail),
                    isNull(invitations.acceptedAt),
                ));
                await tx.insert(invitations).values({
                    companyId: admin.companyId,
                    email: normalizedEmail,
                    tokenHash: hashToken(token),
                    permissions: [...new Set(permissions)],
                    invitedBy: adminId,
                    expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000),
                });
            });

            await sendInvitationEmail({ to: normalizedEmail, token, inviterName: admin.name, companyName: admin.companyName });
            return res.status(201).json({ status_code: 201, message: "Invitation sent" });
        } catch (error) {
            console.error("Invite user error:", error);
            return res.status(500).json({ status_code: 500, message: "Internal server error" });
        }
    },
    // Public: lets the accept screen show "X invited you to join Y" before the user commits.
    previewInvite: async (req: Request, res: Response) => {
        try {
            const { token } = req.query;
            if (typeof token !== "string" || !token) {
                return res.status(400).json({ status_code: 400, message: "Token is required" });
            }

            const [invite] = await db
                .select({
                    email: invitations.email,
                    permissions: invitations.permissions,
                    expiresAt: invitations.expiresAt,
                    companyName: companies.name,
                    inviterName: users.name,
                })
                .from(invitations)
                .innerJoin(companies, eq(invitations.companyId, companies.id))
                .innerJoin(users, eq(invitations.invitedBy, users.id))
                .where(and(
                    eq(invitations.tokenHash, hashToken(token)),
                    isNull(invitations.acceptedAt),
                    gt(invitations.expiresAt, new Date()),
                ))
                .limit(1);

            if (!invite) {
                return res.status(404).json({ status_code: 404, message: "Invitation is invalid or has expired" });
            }

            // Tells the frontend whether to show "create your account" or "accept with your existing account".
            // Only the token holder (who controls this inbox) can see it.
            const [account] = await db.select({ id: users.id })
                .from(users).where(eq(users.email, invite.email)).limit(1);

            return res.status(200).json({ status_code: 200, invite: { ...invite, hasAccount: !!account } });
        } catch (error) {
            console.error("Preview invite error:", error);
            return res.status(500).json({ status_code: 500, message: "Internal server error" });
        }
    },

    // Public: body is { token } for an existing account, or { token, name, password } for a new one.
    // Email, company and permissions come ONLY from the invitation row, never from the body.
    acceptInvite: async (req: Request, res: Response) => {
        try {
            const { token, name, password } = req.body ?? {};
            if (typeof token !== "string" || !token) {
                return res.status(400).json({ status_code: 400, message: "Token is required" });
            }

            const result = await db.transaction(async (tx) => {
                // Atomically claim the invite: only one request can flip accepted_at,
                // so the same link can't be used twice.
                const [invite] = await tx.update(invitations)
                    .set({ acceptedAt: new Date() })
                    .where(and(
                        eq(invitations.tokenHash, hashToken(token)),
                        isNull(invitations.acceptedAt),
                        gt(invitations.expiresAt, new Date()),
                    ))
                    .returning({
                        companyId: invitations.companyId,
                        email: invitations.email,
                        permissions: invitations.permissions,
                        invitedBy: invitations.invitedBy,
                    });
                if (!invite) throw new InviteError(400, "Invitation is invalid or has expired");

                const [existing] = await tx.select({ id: users.id, companyId: users.companyId })
                    .from(users).where(eq(users.email, invite.email)).limit(1);

                let user: { id: string; email: string };
                let isNewAccount: boolean;

                if (existing) {
                    if (existing.companyId) throw new InviteError(409, "This account already belongs to a company");

                    // The invite link proves control of this inbox, so it also verifies the email.
                    const [attached] = await tx.update(users)
                        .set({ companyId: invite.companyId, role: "user", isEmailVerified: true })
                        .where(and(eq(users.id, existing.id), isNull(users.companyId)))
                        .returning({ id: users.id, email: users.email });
                    if (!attached) throw new InviteError(409, "This account already belongs to a company");

                    user = attached;
                    isNewAccount = false;
                } else {
                    if (typeof name !== "string" || !name.trim()) {
                        throw new InviteError(400, "Name is required");
                    }
                    if (typeof password !== "string" || password.length < 8) {
                        throw new InviteError(400, "Password must be at least 8 characters");
                    }

                    const [created] = await tx.insert(users)
                        .values({
                            name: name.trim(),
                            email: invite.email,
                            passwordHash: await bcrypt.hash(password, 10),
                            isEmailVerified: true,
                            companyId: invite.companyId,
                            role: "user",
                        })
                        .returning({ id: users.id, email: users.email });
                    if (!created) throw new Error("User insert returned no row");

                    user = created;
                    isNewAccount = true;
                }

                if (invite.permissions.length > 0) {
                    await tx.insert(userPermissions)
                        .values(invite.permissions.map((p) => ({
                            userId: user.id,
                            permission: p,
                            grantedBy: invite.invitedBy,
                        })))
                        .onConflictDoNothing();
                }

                return { user, isNewAccount };
            });

            // A brand-new account just chose its password here, so log it straight in.
            // An existing account must still log in with its own credentials: the
            // invite link alone shouldn't act as a login link.
            if (result.isNewAccount) {
                await createSession(res, result.user);
            }

            return res.status(200).json({
                status_code: 200,
                message: result.isNewAccount ? "Invitation accepted" : "Invitation accepted. Please log in to continue.",
                requiresLogin: !result.isNewAccount,
            });
        } catch (error: any) {
            if (error instanceof InviteError) {
                return res.status(error.status).json({ status_code: error.status, message: error.message });
            }
            // 23505 = unique_violation: someone registered this email between our check and the insert
            const code = error?.code ?? error?.cause?.code;
            if (code === "23505") {
                return res.status(409).json({ status_code: 409, message: "An account with this email already exists. Please try again." });
            }
            console.error("Accept invite error:", error);
            return res.status(500).json({ status_code: 500, message: "Internal server error" });
        }
    },
}

export default CompanyController;