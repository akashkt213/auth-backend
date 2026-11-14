import { Router } from "express";
import UserController from "../controllers/user.controller.js";

const userRoutes = Router()

userRoutes.post('/signup',UserController.signup)
userRoutes.post('/login',UserController.login)
userRoutes.get('/verify-email',UserController.verifyEmail)
userRoutes.post('/refresh',UserController.refresh)
userRoutes.post('/logout',UserController.logout)


export default userRoutes