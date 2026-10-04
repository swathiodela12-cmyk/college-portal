import "express-async-errors";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import path from "path";
import rateLimit from "express-rate-limit";
import { env } from "./config/env";
import { notFoundHandler, errorHandler } from "./middleware/errorHandler";

import authRoutes from "./routes/auth.routes";
import studentRoutes from "./routes/student.routes";
import attendanceRoutes from "./routes/attendance.routes";
import academicRoutes from "./routes/academic.routes";
import achievementRoutes from "./routes/achievement.routes";
import awardRoutes from "./routes/award.routes";
import certificationRoutes from "./routes/certification.routes";
import internshipRoutes from "./routes/internship.routes";
import programEventRoutes from "./routes/program-event.routes";
import placementRoutes from "./routes/placement.routes";
import announcementRoutes from "./routes/announcement.routes";
import documentRoutes from "./routes/document.routes";
import contactRoutes from "./routes/contact.routes";
import notificationRoutes from "./routes/notification.routes";
import reportRoutes from "./routes/report.routes";
import departmentRoutes from "./routes/department.routes";
import userRoutes from "./routes/user.routes";

export const app = express();

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
app.use(compression());
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));

// Static file serving for uploaded documents
app.use("/uploads", express.static(path.resolve(process.cwd(), env.UPLOAD_DIR)));

// Global rate limiter
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 500, standardHeaders: true, legacyHeaders: false });
app.use("/api", limiter);

// Stricter limiter for auth endpoints
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);

app.get("/health", (_req, res) => res.json({ success: true, status: "ok", timestamp: new Date().toISOString() }));

app.use("/api/auth", authRoutes);
app.use("/api/students", studentRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/academics", academicRoutes);
app.use("/api/achievements", achievementRoutes);
app.use("/api/awards", awardRoutes);
app.use("/api/certifications", certificationRoutes);
app.use("/api/internships", internshipRoutes);
app.use("/api", programEventRoutes); // exposes /programs and /events
app.use("/api/placements", placementRoutes);
app.use("/api/announcements", announcementRoutes);
app.use("/api/documents", documentRoutes);
app.use("/api/contacts", contactRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/departments", departmentRoutes);
app.use("/api/users", userRoutes);

app.use(notFoundHandler);
app.use(errorHandler);
