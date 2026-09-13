import express from "express";
import cors from "cors";
import "dotenv/config"
import {clerkMiddleware} from "@clerk/express";
import { connectDB } from "./lib/db.js";

const app = express();
const FRONTEND_URL = process.env.FRONTEND_URL;

//middlewares
app.use(express.json());

app.use(cors({ origin: FRONTEND_URL, credentials:true }));

app.use(clerkMiddleware());

app.listen(process.env.PORT, () => {
    connectDB();
    console.log(`Server running on port ${process.env.PORT}!!!`);
});