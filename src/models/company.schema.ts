import { sql } from "drizzle-orm";
import { pgEnum, pgTable, primaryKey, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { users } from "./auth.schema.js";

export const permission = pgEnum("permission", [
    "records:read", "records:create", "records:update", "records:delete",
]);

export const companies = pgTable("companies", {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 200 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const invitations = pgTable("invitations", {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 255 }).notNull(),
    tokenHash: varchar("token_hash", { length: 255 }).notNull().unique(),
    permissions: permission("permissions").array().notNull(),
    invitedBy: uuid("invited_by").notNull().references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (t) => [
    // one *pending* invite per email per company; accepted ones don't block re-inviting
    uniqueIndex("invitations_pending_company_email")
        .on(t.companyId, t.email)
        .where(sql`${t.acceptedAt} is null`),
]);

export const userPermissions = pgTable("user_permissions", {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    permission: permission("permission").notNull(),
    grantedBy: uuid("granted_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.permission] })]);