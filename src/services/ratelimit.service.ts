import { rateLimit } from "express-rate-limit";

const base = {
  standardHeaders: "draft-8" as const,
  legacyHeaders: false,
  ipv6Subnet: 56,
};

// Every route: a loose safety net
export const globalLimiter = rateLimit({ ...base, windowMs: 15 * 60 * 1000, limit: 100 });

// Login: only failed attempts count, so legitimate users aren't penalised
export const loginLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  limit: 5,
  skipSuccessfulRequests: true,
  message: { message: "Too many login attempts, try again in 15 minutes" },
});

// Signup and resend: per IP
export const emailIpLimiter = rateLimit({
  ...base,
  windowMs: 60 * 60 * 1000,
  limit: 5,
  message: { message: "Too many requests, try again later" },
});

// Resend: per email address, whatever IP the request comes from.
// ipv6Subnet only applies to the default IP-based key, so it's omitted here.
const { ipv6Subnet: _ipv6Subnet, ...baseWithoutSubnet } = base;

export const resendPerEmailLimiter = rateLimit({
  ...baseWithoutSubnet,
  windowMs: 15 * 60 * 1000,
  limit: 3,
  keyGenerator: (req) =>
    typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "no-email",
  message: { message: "Too many verification emails requested, try again later" },
});
