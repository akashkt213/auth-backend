import jwt from "jsonwebtoken";
import crypto from "crypto";
import type { JwtPayload } from "../types/auth.types.js";

const ACCESS_KEY: string = process.env.JWT_ACCESS_SECRET!;

if (!ACCESS_KEY) {
  throw new Error("SECRET KEY NOT SET.");
}

export const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function generateAuthTokens(payload: JwtPayload) {
  const accessToken = jwt.sign(payload, ACCESS_KEY, {
    expiresIn: "1h",
  });

  // Opaque random token: ownership, expiry and revocation live in the sessions table.
  const refreshToken = crypto.randomBytes(32).toString("hex");

  return { accessToken, refreshToken };
}


export function extractAuthDetails(authToken:string){
  const res = jwt.decode(authToken)
  
  return res;
}