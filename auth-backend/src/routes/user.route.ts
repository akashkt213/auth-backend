import { Router } from "express";
import UserController from "../controllers/user.controller.js";
import { authenticateToken } from "../middleware/auth.middleware.js";
import {
  forgotIpLimiter,
  forgotPerEmailLimiter,
  loginLimiter,
  resendIpLimiter,
  resendPerEmailLimiter,
  resetIpLimiter,
  signupIpLimiter,
} from "../services/ratelimit.service.js";

const userRoutes = Router()

userRoutes.post('/signup', signupIpLimiter, UserController.signup)
userRoutes.post('/login', loginLimiter, UserController.login)
userRoutes.get('/auth/google', UserController.googleStart)
userRoutes.get('/auth/google/callback', UserController.googleCallback)
userRoutes.get('/verify-email',UserController.verifyEmail)
userRoutes.post('/refresh',UserController.refresh)
userRoutes.post('/logout',UserController.logout)
userRoutes.get('/me', authenticateToken, UserController.me)
userRoutes.post('/resend-verification', resendIpLimiter, resendPerEmailLimiter, UserController.resendVerificationEmail)
userRoutes.post('/forgot-password', forgotIpLimiter, forgotPerEmailLimiter, UserController.forgotPassword)
userRoutes.post('/reset-password', resetIpLimiter, UserController.resetPassword)

export default userRoutes