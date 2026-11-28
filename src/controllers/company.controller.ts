import type { Request, Response } from "express";
import { db } from "../db/db.js";
import { companies, invitations, permission } from "../models/company.schema.js";
import { users } from "../models/auth.schema.js";
import crypto from "crypto";
import { and, eq, isNull, TransactionRollbackError } from "drizzle-orm";
import { hashToken } from "../services/token.service.js";
import { INVITE_TTL_DAYS, sendInvitationEmail } from "../services/emailsend.service.js";

type Permission = (typeof permission.enumValues)[number];
const isPermission = (p: unknown): p is Permission =>
    typeof p === "string" && (permission.enumValues as readonly string[]).includes(p);

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

}

export default CompanyController;