import { Router } from "express";
import { z } from "zod";
import { Role, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { authenticate, authorize, authorizeSelfOrStaff } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { ApiError } from "../utils/ApiError";
import { getPagination, getSort, buildMeta, toCSV } from "../utils/helpers";
import { hashPassword } from "../utils/auth";

const router = Router();
router.use(authenticate);

const staffOnly = authorize(Role.SUPER_ADMIN, Role.ADMIN, Role.FACULTY);

// ---- LIST + SEARCH + FILTER + SORT (staff only) ----
router.get("/", staffOnly, async (req, res) => {
  const { page, limit, skip } = getPagination(req);
  const orderBy = getSort(req, ["createdAt", "firstName", "cgpa", "batchYear", "currentYear"]);

  const { search, departmentId, batchYear, currentYear, status, section } = req.query as Record<string, string>;

  const where: Prisma.StudentProfileWhereInput = {
    AND: [
      search
        ? {
            OR: [
              { firstName: { contains: search, mode: "insensitive" } },
              { lastName: { contains: search, mode: "insensitive" } },
              { rollNumber: { contains: search, mode: "insensitive" } },
              { admissionNumber: { contains: search, mode: "insensitive" } },
              { user: { email: { contains: search, mode: "insensitive" } } },
            ],
          }
        : {},
      departmentId ? { departmentId } : {},
      batchYear ? { batchYear: parseInt(batchYear, 10) } : {},
      currentYear ? { currentYear: parseInt(currentYear, 10) } : {},
      status ? { status } : {},
      section ? { section } : {},
    ],
  };

  const [items, total] = await Promise.all([
    prisma.studentProfile.findMany({
      where,
      skip,
      take: limit,
      orderBy,
      include: { department: true, user: { select: { email: true, isActive: true, lastLoginAt: true } } },
    }),
    prisma.studentProfile.count({ where }),
  ]);

  res.json({ success: true, data: items, meta: buildMeta(total, page, limit) });
});

// ---- EXPORT CSV (staff only) ----
router.get("/export", staffOnly, async (req, res) => {
  const { departmentId, batchYear, status } = req.query as Record<string, string>;
  const where: Prisma.StudentProfileWhereInput = {
    AND: [departmentId ? { departmentId } : {}, batchYear ? { batchYear: parseInt(batchYear, 10) } : {}, status ? { status } : {}],
  };
  const students = await prisma.studentProfile.findMany({
    where,
    include: { department: true, user: { select: { email: true } } },
    orderBy: { createdAt: "desc" },
  });

  const rows = students.map((s) => ({
    rollNumber: s.rollNumber,
    admissionNumber: s.admissionNumber,
    firstName: s.firstName,
    lastName: s.lastName,
    email: s.user.email,
    department: s.department?.name ?? "",
    program: s.program ?? "",
    batchYear: s.batchYear ?? "",
    currentYear: s.currentYear ?? "",
    section: s.section ?? "",
    cgpa: s.cgpa ?? "",
    status: s.status,
    phone: s.phone ?? "",
  }));

  const csv = toCSV(rows);
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="students-export-${Date.now()}.csv"`);
  res.send(csv);
});

// ---- GET ONE (self or staff) ----
router.get(
  "/:id",
  authorizeSelfOrStaff(async (req) => {
    const s = await prisma.studentProfile.findUnique({ where: { id: req.params.id }, select: { userId: true } });
    return s?.userId ?? null;
  }),
  async (req, res) => {
    const student = await prisma.studentProfile.findUnique({
      where: { id: req.params.id },
      include: {
        department: true,
        user: { select: { email: true, isActive: true, lastLoginAt: true, createdAt: true } },
        _count: {
          select: {
            achievements: true,
            internships: true,
            awards: true,
            certifications: true,
            documents: true,
            placements: true,
          },
        },
      },
    });
    if (!student) throw ApiError.notFound("Student not found");
    res.json({ success: true, data: student });
  }
);

// ---- CREATE (staff only) - creates user + profile ----
const createSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(8),
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    rollNumber: z.string().min(1),
    admissionNumber: z.string().min(1),
    departmentId: z.string().optional(),
    program: z.string().optional(),
    batchYear: z.number().optional(),
    currentYear: z.number().optional(),
    currentSemester: z.number().optional(),
    section: z.string().optional(),
    phone: z.string().optional(),
    gender: z.enum(["MALE", "FEMALE", "OTHER", "PREFER_NOT_TO_SAY"]).optional(),
    dateOfBirth: z.string().optional(),
    guardianName: z.string().optional(),
    guardianPhone: z.string().optional(),
  }),
});

router.post("/", staffOnly, validate(createSchema), async (req, res) => {
  const { email, password, dateOfBirth, ...rest } = req.body;
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw ApiError.conflict("Email already in use");
  const passwordHash = await hashPassword(password);

  const student = await prisma.studentProfile.create({
    data: {
      ...rest,
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
      user: { create: { email, passwordHash, role: Role.STUDENT } },
    },
    include: { department: true, user: { select: { email: true } } },
  });

  res.status(201).json({ success: true, data: student });
});

// ---- UPDATE (self limited fields, or staff full) ----
const updateSchema = z.object({
  body: z.object({
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    phone: z.string().optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    pincode: z.string().optional(),
    bloodGroup: z.string().optional(),
    photoUrl: z.string().optional(),
    guardianName: z.string().optional(),
    guardianPhone: z.string().optional(),
    guardianEmail: z.string().optional(),
    departmentId: z.string().optional(),
    program: z.string().optional(),
    batchYear: z.number().optional(),
    currentYear: z.number().optional(),
    currentSemester: z.number().optional(),
    section: z.string().optional(),
    cgpa: z.number().optional(),
    status: z.string().optional(),
  }),
});

const STUDENT_EDITABLE_FIELDS = new Set([
  "phone",
  "address",
  "city",
  "state",
  "pincode",
  "bloodGroup",
  "photoUrl",
  "guardianName",
  "guardianPhone",
  "guardianEmail",
]);

router.patch(
  "/:id",
  authorizeSelfOrStaff(async (req) => {
    const s = await prisma.studentProfile.findUnique({ where: { id: req.params.id }, select: { userId: true } });
    return s?.userId ?? null;
  }),
  validate(updateSchema),
  async (req, res) => {
    let payload = req.body;
    if (req.user!.role === Role.STUDENT) {
      payload = Object.fromEntries(Object.entries(payload).filter(([k]) => STUDENT_EDITABLE_FIELDS.has(k)));
    }
    const updated = await prisma.studentProfile.update({
      where: { id: req.params.id },
      data: payload,
      include: { department: true },
    });
    res.json({ success: true, data: updated });
  }
);

// ---- DELETE (Super Admin / Admin only) ----
router.delete("/:id", authorize(Role.SUPER_ADMIN, Role.ADMIN), async (req, res) => {
  const student = await prisma.studentProfile.findUnique({ where: { id: req.params.id } });
  if (!student) throw ApiError.notFound("Student not found");
  await prisma.user.delete({ where: { id: student.userId } }); // cascades profile + related records
  res.json({ success: true, message: "Student deleted successfully" });
});

export default router;
