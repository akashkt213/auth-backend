import jwt from "jsonwebtoken";
import crypto from "crypto";
import type { JwtPayload } from "../types/auth.types.js";
import type { Response, CookieOptions } from "express";

const isProd = process.env.NODE_ENV === "production";

export const ACCESS_KEY: string = process.env.JWT_ACCESS_SECRET!;
export const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000
export const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const baseCookie:CookieOptions={
  httpOnly:true,
  secure:isProd,
  sameSite:"lax",
  path:'/'
}

if (!ACCESS_KEY) {
  throw new Error("SECRET KEY NOT SET.");
}

export function setAuthCookies(res:Response, tokens:{accessToken:string,refreshToken:string}){
  res.cookie("accessToken",tokens.accessToken,{...baseCookie,maxAge:ACCESS_TOKEN_TTL_MS })
  res.cookie("refreshToken", tokens.refreshToken, { ...baseCookie, path: "/api", maxAge: REFRESH_TOKEN_TTL_MS });
}

export function clearAuthCookies(res: Response) {
  res.clearCookie("accessToken", baseCookie);
  res.clearCookie("refreshToken", { ...baseCookie, path: "/api" });
}


export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function generateAuthTokens(payload: JwtPayload) {
  const accessToken = jwt.sign(payload, ACCESS_KEY, {
    expiresIn: ACCESS_TOKEN_TTL_MS / 1000, // seconds; same source of truth as the cookie maxAge
  });

  // Opaque random token: ownership, expiry and revocation live in the sessions table.
  const refreshToken = crypto.randomBytes(32).toString("hex");

  return { accessToken, refreshToken };
}
