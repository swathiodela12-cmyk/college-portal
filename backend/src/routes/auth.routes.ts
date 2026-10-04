import { Router } from "express";
import { z } from "zod";
import { Role } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { ApiError } from "../utils/ApiError";
import { validate } from "../middleware/validate";
import { authenticate } from "../middleware/auth";
import {
  hashPassword,
  comparePassword,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  durationToMs,
} from "../utils/auth";
import { env } from "../config/env";

const router = Router();

const registerSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(8, "Password must be at least 8 characters"),
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    rollNumber: z.string().min(1),
    admissionNumber: z.string().min(1),
    departmentId: z.string().optional(),
    program: z.string().optional(),
    batchYear: z.number().optional(),
    phone: z.string().optional(),
  }),
});

const loginSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(1),
  }),
});

async function issueTokens(userId: string, role: Role, email: string) {
  const accessToken = signAccessToken({ sub: userId, role, email });
  const refreshToken = signRefreshToken(userId);
  await prisma.refreshToken.create({
    data: {
      token: refreshToken,
      userId,
      expiresAt: new Date(Date.now() + durationToMs(env.JWT_REFRESH_EXPIRES_IN)),
    },
  });
  return { accessToken, refreshToken };
}

// Public self-registration - always creates a STUDENT account
router.post("/register", validate(registerSchema), async (req, res) => {
  const { email, password, firstName, lastName, rollNumber, admissionNumber, departmentId, program, batchYear, phone } =
    req.body;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw ApiError.conflict("An account with this email already exists");

  const passwordHash = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      role: Role.STUDENT,
      studentProfile: {
        create: {
          rollNumber,
          admissionNumber,
          firstName,
          lastName,
          departmentId,
          program,
          batchYear,
          phone,
        },
      },
    },
    include: { studentProfile: true },
  });

  const tokens = await issueTokens(user.id, user.role, user.email);
  res.status(201).json({
    success: true,
    message: "Registration successful",
    data: { user: { id: user.id, email: user.email, role: user.role, profile: user.studentProfile }, ...tokens },
  });
});

router.post("/login", validate(loginSchema), async (req, res) => {
  const { email, password } = req.body;
  const user = await prisma.user.findUnique({
    where: { email },
    include: { studentProfile: true, facultyProfile: true },
  });
  if (!user || !user.isActive) throw ApiError.unauthorized("Invalid credentials");

  const valid = await comparePassword(password, user.passwordHash);
  if (!valid) throw ApiError.unauthorized("Invalid credentials");

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  const tokens = await issueTokens(user.id, user.role, user.email);
  res.json({
    success: true,
    message: "Login successful",
    data: {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        profile: user.studentProfile ?? user.facultyProfile,
      },
      ...tokens,
    },
  });
});

router.post(
  "/refresh",
  validate(z.object({ body: z.object({ refreshToken: z.string() }) })),
  async (req, res) => {
    const { refreshToken } = req.body;
    let payload: { sub: string };
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      throw ApiError.unauthorized("Invalid or expired refresh token");
    }

    const stored = await prisma.refreshToken.findUnique({ where: { token: refreshToken } });
    if (!stored || stored.revoked || stored.expiresAt < new Date()) {
      throw ApiError.unauthorized("Refresh token is no longer valid");
    }

    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive) throw ApiError.unauthorized("User not found or inactive");

    await prisma.refreshToken.update({ where: { id: stored.id }, data: { revoked: true } });
    const tokens = await issueTokens(user.id, user.role, user.email);

    res.json({ success: true, data: tokens });
  }
);

router.post("/logout", authenticate, async (req, res) => {
  const { refreshToken } = req.body as { refreshToken?: string };
  if (refreshToken) {
    await prisma.refreshToken.updateMany({
      where: { token: refreshToken, userId: req.user!.id },
      data: { revoked: true },
    });
  }
  res.json({ success: true, message: "Logged out successfully" });
});

router.get("/me", authenticate, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    include: {
      studentProfile: { include: { department: true } },
      facultyProfile: { include: { department: true } },
    },
  });
  if (!user) throw ApiError.notFound("User not found");
  res.json({
    success: true,
    data: {
      id: user.id,
      email: user.email,
      role: user.role,
      profile: user.studentProfile ?? user.facultyProfile ?? null,
    },
  });
});

export default router;
