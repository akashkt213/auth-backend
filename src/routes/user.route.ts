import { Router } from "express";
import UserController from "../controllers/user.controller.js";
import { authenticateToken } from "../middleware/auth.middleware.js";

const userRoutes = Router()

userRoutes.post('/signup',UserController.signup)
userRoutes.post('/login',UserController.login)
userRoutes.get('/verify-email',UserController.verifyEmail)
userRoutes.post('/refresh',UserController.refresh)
userRoutes.post('/logout',UserController.logout)
userRoutes.get('/me', authenticateToken, UserController.me)

export default userRoutes