import express from "express";
import cors from 'cors'
import 'dotenv/config'
import userRoutes from "./routes/user.route.js";
import cookieParser from "cookie-parser";
import { globalLimiter } from "./services/ratelimit.service.js";
import { errorHandler } from "./middleware/error.middleware.js";
import companyRoutes from "./routes/company.route.js";

const app = express();

app.use(cors({
    origin: process.env.FRONTEND_URL ?? "http://localhost:5173",
    credentials: true,
}))
app.use(globalLimiter)
app.use(express.json({ limit: "10kb" }));
app.use(cookieParser())
app.use('/api/', userRoutes)
app.use('/api',companyRoutes)
app.use(errorHandler) // must stay after the routes

app.listen(3000, () => console.log("Server is running on port:3000"));