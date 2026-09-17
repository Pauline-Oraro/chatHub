import express from "express";
import cors from "cors";
import "dotenv/config";
import fs from "fs";
import path from "path";
import {clerkMiddleware} from "@clerk/express";
import { connectDB } from "./lib/db.js";

const app = express();
const FRONTEND_URL = process.env.FRONTEND_URL;

const publicDir = path.join(process.cwd(), "public");

//middlewares
app.use(express.json());

app.use(cors({ origin: FRONTEND_URL, credentials:true }));

app.use(clerkMiddleware());

if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));

  app.get("/{*any}", (req, res, next) => {
    res.sendFile(path.join(publicDir, "index.html"), (err) => next(err));
  });
}

app.listen(process.env.PORT, () => {
    connectDB();
    console.log(`Server running on port ${process.env.PORT}!!!`);
});