import crypto from "crypto";
import { OAuth2Client, CodeChallengeMethod } from "google-auth-library";

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;

if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
  throw new Error("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI not set");
}

const client = new OAuth2Client({
  clientId: CLIENT_ID,
  clientSecret: CLIENT_SECRET,
  redirectUri: REDIRECT_URI,
});

/** Step A: build the URL we send the user to, plus the secrets we must remember. */
export async function createGoogleAuthRequest() {
  // state: random value to prove the callback belongs to a login WE started (CSRF protection)
  const state = crypto.randomBytes(32).toString("hex");

  // PKCE: we keep the verifier secret and send Google only its hash (the challenge).
  // At exchange time we prove we hold the verifier, so a stolen `code` alone is useless.
  const { codeVerifier, codeChallenge } = await client.generateCodeVerifierAsync();
  if (!codeChallenge) throw new Error("Failed to generate PKCE challenge");

  const url = client.generateAuthUrl({
    scope: ["openid", "email", "profile"],
    state,
    code_challenge: codeChallenge,
    code_challenge_method: CodeChallengeMethod.S256,
    prompt: "select_account", // always show the account picker
  });

  return { url, state, codeVerifier };
}

export type GoogleProfile = {
  sub: string;           // Google's permanent user ID, which is what we identify users by
  email: string;
  emailVerified: boolean;
  name: string;
};

/** Step B: exchange the one-time code for tokens and verify the ID token. */
export async function getGoogleProfile(code: string, codeVerifier: string): Promise<GoogleProfile> {
  const { tokens } = await client.getToken({ code, codeVerifier });

  if (!tokens.id_token) throw new Error("Google did not return an ID token");

  // verifyIdToken checks the signature (Google's public keys), `aud` === our client ID,
  // `iss` is Google, and the token isn't expired. Never use jwt.decode here.
  const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: CLIENT_ID });
  const payload = ticket.getPayload();

  if (!payload?.sub || !payload.email) throw new Error("Google ID token missing sub/email");

  return {
    sub: payload.sub,
    email: payload.email.toLowerCase(),
    emailVerified: payload.email_verified === true,
    name: payload.name ?? payload.email.split("@")[0]!,
  };
}
