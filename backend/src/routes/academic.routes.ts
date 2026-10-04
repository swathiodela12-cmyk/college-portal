import { Router } from "express";
import { z } from "zod";
import { Role, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { authenticate, authorize, authorizeSelfOrStaff } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { getPagination, buildMeta } from "../utils/helpers";
import { ApiError } from "../utils/ApiError";

const router = Router();
router.use(authenticate);
const staffOnly = authorize(Role.SUPER_ADMIN, Role.ADMIN, Role.FACULTY);

const getOwner = async (studentId: string) => {
  const s = await prisma.studentProfile.findUnique({ where: { id: studentId }, select: { userId: true } });
  return s?.userId ?? null;
};

router.get(
  "/student/:studentId",
  authorizeSelfOrStaff((req) => getOwner(req.params.studentId)),
  async (req, res) => {
    const { page, limit, skip } = getPagination(req);
    const { year, semester } = req.query as Record<string, string>;
    const where: Prisma.AcademicRecordWhereInput = {
      studentId: req.params.studentId,
      year: year ? parseInt(year, 10) : undefined,
      semester: semester ? parseInt(semester, 10) : undefined,
    };
    const [items, total] = await Promise.all([
      prisma.academicRecord.findMany({ where, skip, take: limit, orderBy: [{ year: "desc" }, { semester: "desc" }] }),
      prisma.academicRecord.count({ where }),
    ]);

    // Compute SGPA per semester + overall CGPA
    const all = await prisma.academicRecord.findMany({ where: { studentId: req.params.studentId } });
    const bySemester: Record<string, { totalCredits: number; weighted: number }> = {};
    for (const r of all) {
      const key = `${r.year}-S${r.semester}`;
      bySemester[key] = bySemester[key] || { totalCredits: 0, weighted: 0 };
      bySemester[key].totalCredits += r.credits;
      bySemester[key].weighted += r.credits * r.gradePoint;
    }
    const sgpaBySemester = Object.entries(bySemester).map(([key, v]) => ({
      semester: key,
      sgpa: v.totalCredits > 0 ? Math.round((v.weighted / v.totalCredits) * 100) / 100 : 0,
    }));
    const totalCredits = all.reduce((s, r) => s + r.credits, 0);
    const totalWeighted = all.reduce((s, r) => s + r.credits * r.gradePoint, 0);
    const cgpa = totalCredits > 0 ? Math.round((totalWeighted / totalCredits) * 100) / 100 : 0;

    res.json({ success: true, data: items, meta: buildMeta(total, page, limit), analytics: { sgpaBySemester, cgpa } });
  }
);

const createSchema = z.object({
  body: z.object({
    studentId: z.string(),
    year: z.number(),
    semester: z.number(),
    subject: z.string().min(1),
    credits: z.number(),
    grade: z.string().min(1),
    gradePoint: z.number(),
    examType: z.string().optional(),
    remarks: z.string().optional(),
  }),
});

router.post("/", staffOnly, validate(createSchema), async (req, res) => {
  const record = await prisma.academicRecord.create({ data: req.body });
  // Recalculate & persist CGPA on profile
  const all = await prisma.academicRecord.findMany({ where: { studentId: req.body.studentId } });
  const totalCredits = all.reduce((s, r) => s + r.credits, 0);
  const totalWeighted = all.reduce((s, r) => s + r.credits * r.gradePoint, 0);
  const cgpa = totalCredits > 0 ? Math.round((totalWeighted / totalCredits) * 100) / 100 : 0;
  await prisma.studentProfile.update({ where: { id: req.body.studentId }, data: { cgpa } });
  res.status(201).json({ success: true, data: record });
});

const updateSchema = z.object({
  body: z.object({
    subject: z.string().optional(),
    credits: z.number().optional(),
    grade: z.string().optional(),
    gradePoint: z.number().optional(),
    examType: z.string().optional(),
    remarks: z.string().optional(),
  }),
});

router.patch("/:id", staffOnly, validate(updateSchema), async (req, res) => {
  const updated = await prisma.academicRecord.update({ where: { id: req.params.id }, data: req.body });
  res.json({ success: true, data: updated });
});

router.delete("/:id", staffOnly, async (req, res) => {
  const record = await prisma.academicRecord.findUnique({ where: { id: req.params.id } });
  if (!record) throw ApiError.notFound("Record not found");
  await prisma.academicRecord.delete({ where: { id: req.params.id } });
  res.json({ success: true, message: "Academic record deleted" });
});

export default router;
