import { readFileSync } from "node:fs";
import { Resend } from "resend";
import { db } from "../db/db.js";
import { emailVerificationTokens, passwordResetTokens } from "../models/auth.schema.js";
import crypto from "crypto";
import { hashToken } from "./token.service.js";


type EmailType = "VERIFY_EMAIL" | "FORGOT_PASSWORD"
type UserType = { id: string; name: string; email: string }

const TOKEN_TTL_MINUTES = 15;

const resend = new Resend(process.env.EMAIL_API_KEY);


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

const verifyEmailTemplate = readFileSync(
  new URL("../templates/verify-email.html", import.meta.url),
  "utf8",
);

const forgotPasswordTemplate = readFileSync(
  new URL("../templates/forgot-password.html", import.meta.url),
  "utf8",
);

// Everything that differs between the email types. Record<EmailType, ...> makes
// TypeScript complain if a new type is added without an entry here.
const emailConfig = {
  VERIFY_EMAIL: {
    table: emailVerificationTokens,
    template: verifyEmailTemplate,
    subject: "Verify your email address",
    linkName: "verificationLink",
    // Opens the API directly
    url: `${process.env.APP_URL ?? "http://localhost:3000"}/api/verify-email`,
  },
  FORGOT_PASSWORD: {
    table: passwordResetTokens,
    template: forgotPasswordTemplate,
    subject: "Reset your password",
    linkName: "resetLink",
    // Opens the frontend, which needs to show a new-password form
    url: `${process.env.FRONTEND_URL ?? "http://localhost:5173"}/reset-password`,
  },
} satisfies Record<EmailType, object>;

export async function sendVerificationLink(user: UserType, type: EmailType) {
  const { table, template, subject, linkName, url } = emailConfig[type];

  const token = crypto.randomBytes(32).toString("hex");

  await db.insert(table).values({
    userId: user.id,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000),
  });

  const html = renderTemplate(template, {
    appName: "Auth System",
    name: escapeHtml(user.name),
    [linkName]: `${url}?token=${token}`,
    expiresIn: `${TOKEN_TTL_MINUTES} minutes`,
    year: String(new Date().getFullYear()),
  });

  const { error } = await resend.emails.send({
    from: "no-reply@contact.akashkt.xyz",
    to: user.email,
    subject,
    html,
  });

  if (error) {
    console.error(`Failed to send ${type} email:`, error);
  }
}

const inviteTemplate = readFileSync(
  new URL("../templates/invite.html", import.meta.url),
  "utf8",
);

export const INVITE_TTL_DAYS = 7;

// The caller creates the invitation row and passes the *raw* token; only its hash is stored.
export async function sendInvitationEmail(params: {
  to: string;
  token: string;
  inviterName: string;
  companyName: string;
}) {
  const inviteLink = `${process.env.FRONTEND_URL ?? "http://localhost:5173"}/accept-invite?token=${params.token}`;

  const html = renderTemplate(inviteTemplate, {
    appName: "Auth System",
    inviterName: escapeHtml(params.inviterName),
    companyName: escapeHtml(params.companyName),
    inviteLink,
    expiresIn: `${INVITE_TTL_DAYS} days`,
    year: String(new Date().getFullYear()),
  });

  const { error } = await resend.emails.send({
    from: "no-reply@contact.akashkt.xyz",
    to: params.to,
    subject: `${params.inviterName} invited you to join ${params.companyName}`,
    html,
  });

  if (error) {
    console.error("Failed to send invitation email:", error);
  }
}