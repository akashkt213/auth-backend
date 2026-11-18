import { Router } from "express";
import UserController from "../controllers/user.controller.js";
import { authenticateToken } from "../middleware/auth.middleware.js";
import { emailIpLimiter, loginLimiter, resendPerEmailLimiter } from "../services/ratelimit.service.js";

const userRoutes = Router()

userRoutes.post('/signup', emailIpLimiter, UserController.signup)
userRoutes.post('/login', loginLimiter, UserController.login)
userRoutes.get('/verify-email',UserController.verifyEmail)
userRoutes.post('/refresh',UserController.refresh)
userRoutes.post('/logout',UserController.logout)
userRoutes.get('/me', authenticateToken, UserController.me)
userRoutes.post('/resend-verification', emailIpLimiter, resendPerEmailLimiter, UserController.resendVerificationEmail)

export default userRoutes