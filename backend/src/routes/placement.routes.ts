import { Router } from "express";
import { z } from "zod";
import { Role, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { authenticate, authorize, authorizeSelfOrStaff } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { getPagination, getSort, buildMeta } from "../utils/helpers";
import { ApiError } from "../utils/ApiError";

const router = Router();
router.use(authenticate);
const staffOnly = authorize(Role.SUPER_ADMIN, Role.ADMIN, Role.FACULTY);

const getOwner = async (id: string) => {
  const p = await prisma.placement.findUnique({ where: { id }, include: { student: { select: { userId: true } } } });
  return p?.student.userId ?? null;
};

router.get("/", async (req, res) => {
  const { page, limit, skip } = getPagination(req);
  const orderBy = getSort(req, ["createdAt", "packageLPA", "driveDate", "companyName"]);
  const { search, status, studentId } = req.query as Record<string, string>;

  const where: Prisma.PlacementWhereInput = { AND: [] };
  if (search) (where.AND as any[]).push({ companyName: { contains: search, mode: "insensitive" } });
  if (status) (where.AND as any[]).push({ status });

  if (req.user!.role === Role.STUDENT) {
    const profile = await prisma.studentProfile.findUnique({ where: { userId: req.user!.id }, select: { id: true } });
    if (!profile) throw ApiError.notFound("Student profile not found");
    (where.AND as any[]).push({ studentId: profile.id });
  } else if (studentId) {
    (where.AND as any[]).push({ studentId });
  }

  const [items, total] = await Promise.all([
    prisma.placement.findMany({
      where,
      skip,
      take: limit,
      orderBy,
      include: { student: { select: { firstName: true, lastName: true, rollNumber: true } } },
    }),
    prisma.placement.count({ where }),
  ]);
  res.json({ success: true, data: items, meta: buildMeta(total, page, limit) });
});

router.get("/analytics/overview", staffOnly, async (_req, res) => {
  const grouped = await prisma.placement.groupBy({ by: ["status"], _count: { status: true } });
  const joined = await prisma.placement.findMany({ where: { status: "JOINED" }, select: { packageLPA: true } });
  const avgPackage =
    joined.length > 0 ? Math.round((joined.reduce((s, p) => s + (p.packageLPA ?? 0), 0) / joined.length) * 100) / 100 : 0;
  const highestPackage = joined.reduce((max, p) => Math.max(max, p.packageLPA ?? 0), 0);
  const totalStudents = await prisma.studentProfile.count();
  const placedStudents = await prisma.placement.groupBy({ by: ["studentId"], where: { status: "JOINED" } });

  res.json({
    success: true,
    data: {
      byStatus: grouped.map((g) => ({ status: g.status, count: g._count.status })),
      avgPackage,
      highestPackage,
      placementRate: totalStudents > 0 ? Math.round((placedStudents.length / totalStudents) * 10000) / 100 : 0,
      totalPlaced: placedStudents.length,
    },
  });
});

const createSchema = z.object({
  body: z.object({
    studentId: z.string().optional(),
    companyName: z.string().min(1),
    jobTitle: z.string().min(1),
    packageLPA: z.number().optional(),
    location: z.string().optional(),
    driveDate: z.string().optional(),
    status: z.enum(["APPLIED", "SHORTLISTED", "INTERVIEW_SCHEDULED", "OFFERED", "REJECTED", "JOINED"]).optional(),
    offerLetterUrl: z.string().optional(),
    notes: z.string().optional(),
  }),
});

router.post("/", validate(createSchema), async (req, res) => {
  let studentId = req.body.studentId;
  if (req.user!.role === Role.STUDENT) {
    const profile = await prisma.studentProfile.findUnique({ where: { userId: req.user!.id }, select: { id: true } });
    if (!profile) throw ApiError.notFound("Student profile not found");
    studentId = profile.id;
  }
  if (!studentId) throw ApiError.badRequest("studentId is required");

  const { driveDate, ...rest } = req.body;
  const placement = await prisma.placement.create({
    data: { ...rest, studentId, driveDate: driveDate ? new Date(driveDate) : undefined },
  });
  res.status(201).json({ success: true, data: placement });
});

router.patch(
  "/:id",
  authorizeSelfOrStaff((req) => getOwner(req.params.id)),
  async (req, res) => {
    const payload = { ...req.body };
    if (req.user!.role === Role.STUDENT) delete payload.status;
    if (payload.driveDate) payload.driveDate = new Date(payload.driveDate);
    const updated = await prisma.placement.update({ where: { id: req.params.id }, data: payload });
    res.json({ success: true, data: updated });
  }
);

router.delete(
  "/:id",
  authorizeSelfOrStaff((req) => getOwner(req.params.id)),
  async (req, res) => {
    await prisma.placement.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: "Placement record deleted" });
  }
);

export default router;
