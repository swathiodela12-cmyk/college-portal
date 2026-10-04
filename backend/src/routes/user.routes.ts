import { Router } from "express";
import { z } from "zod";
import { Role, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { authenticate, authorize } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { hashPassword } from "../utils/auth";
import { getPagination, buildMeta } from "../utils/helpers";
import { ApiError } from "../utils/ApiError";

const router = Router();
router.use(authenticate, authorize(Role.SUPER_ADMIN, Role.ADMIN));

router.get("/", async (req, res) => {
  const { page, limit, skip } = getPagination(req);
  const { role, search } = req.query as Record<string, string>;
  const where: Prisma.UserWhereInput = {
    AND: [role ? { role: role as Role } : {}, search ? { email: { contains: search, mode: "insensitive" } } : {}],
  };
  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        facultyProfile: true,
      },
    }),
    prisma.user.count({ where }),
  ]);
  res.json({ success: true, data: items, meta: buildMeta(total, page, limit) });
});

const createStaffSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(8),
    role: z.enum(["ADMIN", "FACULTY"]),
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    employeeCode: z.string().min(1),
    designation: z.string().optional(),
    departmentId: z.string().optional(),
    phone: z.string().optional(),
  }),
});

// Only SUPER_ADMIN can create ADMIN accounts; ADMIN can create FACULTY only
router.post("/staff", validate(createStaffSchema), async (req, res) => {
  const { email, password, role, firstName, lastName, employeeCode, designation, departmentId, phone } = req.body;

  if (role === "ADMIN" && req.user!.role !== Role.SUPER_ADMIN) {
    throw ApiError.forbidden("Only Super Admin can create Admin accounts");
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw ApiError.conflict("Email already in use");

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      role: role as Role,
      facultyProfile: {
        create: { employeeCode, firstName, lastName, designation, departmentId, phone },
      },
    },
    include: { facultyProfile: true },
  });

  res.status(201).json({ success: true, data: { id: user.id, email: user.email, role: user.role, profile: user.facultyProfile } });
});

router.patch(
  "/:id/status",
  authorize(Role.SUPER_ADMIN),
  validate(z.object({ body: z.object({ isActive: z.boolean() }) })),
  async (req, res) => {
    const updated = await prisma.user.update({ where: { id: req.params.id }, data: { isActive: req.body.isActive } });
    res.json({ success: true, data: { id: updated.id, isActive: updated.isActive } });
  }
);

router.delete("/:id", authorize(Role.SUPER_ADMIN), async (req, res) => {
  if (req.params.id === req.user!.id) throw ApiError.badRequest("You cannot delete your own account");
  await prisma.user.delete({ where: { id: req.params.id } });
  res.json({ success: true, message: "User deleted successfully" });
});

export default router;
