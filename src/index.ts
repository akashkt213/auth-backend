import express from "express";
import cors from 'cors'
import 'dotenv/config'
import userRoutes from "./routes/user.route.js";
import cookieParser from "cookie-parser";

const app = express();

app.use(cors({
    origin: process.env.FRONTEND_URL ?? "http://localhost:5173",
    credentials: true,
}))
app.use(express.json());
app.use(cookieParser())
app.use('/api/', userRoutes)

app.listen(3000, () => console.log("Server is running on port:3000"));