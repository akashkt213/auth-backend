import { Router } from "express";
import CompanyController from "../controllers/company.controller.js";
import { authenticateToken } from "../middleware/auth.middleware.js";

const companyRoutes = Router()

companyRoutes.post('/company',authenticateToken, CompanyController.createCompany)
companyRoutes.post('/company/invitations', authenticateToken, CompanyController.inviteUser)

export default companyRoutes