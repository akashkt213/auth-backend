import type { Request, Response } from "express";
import { db } from "../db/db.js";
import { companies } from "../models/company.schema.js";
import { users } from "../models/auth.schema.js";
import { and, eq, isNull, TransactionRollbackError } from "drizzle-orm";

const CompanyController = {
    createCompany: async (req: Request, res: Response) => {
        try {
            const userId = req.user?.userId;
            if (!userId) return res.status(401).json({ status_code: 401, message: "Unauthorized" });

            const { name } = req.body ?? {};
            if (typeof name !== "string" || !name.trim()) {
                return res.status(400).json({ status_code: 400, message: "Company name is required" });
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
}

export default CompanyController;