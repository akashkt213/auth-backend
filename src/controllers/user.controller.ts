import type { Request, Response } from "express";
import { db } from "../db/db.js";
import { users } from "../models/auth.schema.js";
import * as bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";

async function hashPassword(plainTextPassword: string): Promise<string> {
  const saltRounds = 10;
  const hashedPassword = await bcrypt.hash(plainTextPassword, saltRounds);
  return hashedPassword;
}

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

      console.log(user)

      if(!user.isEmailVerified){
        return res
          .status(400)
          .json({ status_code: 400, message: "Please authenticate your email" });
      }

      const isMatch =
        !!user?.passwordHash &&
        (await bcrypt.compare(password, user.passwordHash));

      if (!user || !isMatch) {
        return res
          .status(401)
          .json({ status_code: 401, message: "Invalid email or password" });
      }
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
};

export default UserController;
