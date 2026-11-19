import { readFileSync } from "node:fs";
import { Resend } from "resend";
import { db } from "../db/db.js";
import { emailVerificationTokens } from "../models/auth.schema.js";
import crypto from "crypto";

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

export async function sendVerificationLink(user: { id: string; name: string; email: string }){
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
    from: 'no-reply@contact.akashkt.xyz',
    to: user.email,
    subject: 'Verify your email address',
    html,
  });

  if (emailError) {
    console.error("Failed to send verification email:", emailError);
  }
}