import { Router } from "express";
import CompanyController from "../controllers/company.controller.js";
import { authenticateToken } from "../middleware/auth.middleware.js";
import { acceptInviteIpLimiter } from "../services/ratelimit.service.js";

const companyRoutes = Router()

companyRoutes.post('/company',authenticateToken, CompanyController.createCompany)
companyRoutes.post('/company/invitations', authenticateToken, CompanyController.inviteUser)

// Public: the invitee isn't logged in (and may not have an account yet)
companyRoutes.get('/invitations/preview', CompanyController.previewInvite)
companyRoutes.post('/invitations/accept', acceptInviteIpLimiter, CompanyController.acceptInvite)

export default companyRoutes