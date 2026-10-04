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

// Mark attendance (single or bulk) - staff only
const markSchema = z.object({
  body: z.object({
    date: z.string(),
    subject: z.string().optional(),
    records: z
      .array(
        z.object({
          studentId: z.string(),
          status: z.enum(["PRESENT", "ABSENT", "LATE", "EXCUSED", "HOLIDAY"]),
          remarks: z.string().optional(),
        })
      )
      .min(1),
  }),
});

router.post("/mark", staffOnly, validate(markSchema), async (req, res) => {
  const { date, subject, records } = req.body;
  const results = await prisma.$transaction(
    records.map((r: { studentId: string; status: any; remarks?: string }) =>
      prisma.attendance.upsert({
        where: { studentId_date_subject: { studentId: r.studentId, date: new Date(date), subject: subject ?? "" } },
        update: { status: r.status, remarks: r.remarks, markedById: req.user!.id },
        create: {
          studentId: r.studentId,
          date: new Date(date),
          subject: subject ?? "",
          status: r.status,
          remarks: r.remarks,
          markedById: req.user!.id,
        },
      })
    )
  );
  res.status(201).json({ success: true, message: `Attendance marked for ${results.length} student(s)`, data: results });
});

// List attendance for a student (self or staff) with filters
router.get(
  "/student/:studentId",
  authorizeSelfOrStaff(async (req) => {
    const s = await prisma.studentProfile.findUnique({ where: { id: req.params.studentId }, select: { userId: true } });
    return s?.userId ?? null;
  }),
  async (req, res) => {
    const { page, limit, skip } = getPagination(req);
    const { from, to, status, subject } = req.query as Record<string, string>;
    const where: Prisma.AttendanceWhereInput = {
      studentId: req.params.studentId,
      date: { gte: from ? new Date(from) : undefined, lte: to ? new Date(to) : undefined },
      status: status ? (status as any) : undefined,
      subject: subject || undefined,
    };
    const [items, total] = await Promise.all([
      prisma.attendance.findMany({ where, skip, take: limit, orderBy: { date: "desc" } }),
      prisma.attendance.count({ where }),
    ]);
    res.json({ success: true, data: items, meta: buildMeta(total, page, limit) });
  }
);

// Attendance analytics/summary for a student
router.get(
  "/student/:studentId/summary",
  authorizeSelfOrStaff(async (req) => {
    const s = await prisma.studentProfile.findUnique({ where: { id: req.params.studentId }, select: { userId: true } });
    return s?.userId ?? null;
  }),
  async (req, res) => {
    const grouped = await prisma.attendance.groupBy({
      by: ["status"],
      where: { studentId: req.params.studentId },
      _count: { status: true },
    });
    const total = grouped.reduce((sum, g) => sum + g._count.status, 0);
    const present = grouped.find((g) => g.status === "PRESENT")?._count.status ?? 0;
    const percentage = total > 0 ? Math.round((present / total) * 10000) / 100 : 0;

    // Monthly trend (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const recent = await prisma.attendance.findMany({
      where: { studentId: req.params.studentId, date: { gte: sixMonthsAgo } },
      select: { date: true, status: true },
    });
    const monthlyMap: Record<string, { present: number; total: number }> = {};
    for (const r of recent) {
      const key = `${r.date.getFullYear()}-${String(r.date.getMonth() + 1).padStart(2, "0")}`;
      monthlyMap[key] = monthlyMap[key] || { present: 0, total: 0 };
      monthlyMap[key].total += 1;
      if (r.status === "PRESENT") monthlyMap[key].present += 1;
    }
    const trend = Object.entries(monthlyMap)
      .sort(([a], [b]) => (a > b ? 1 : -1))
      .map(([month, v]) => ({ month, percentage: Math.round((v.present / v.total) * 10000) / 100 }));

    res.json({
      success: true,
      data: { total, present, percentage, breakdown: grouped.map((g) => ({ status: g.status, count: g._count.status })), trend },
    });
  }
);

// Class-wide attendance analytics (staff only)
router.get("/analytics/overview", staffOnly, async (req, res) => {
  const { departmentId, from, to } = req.query as Record<string, string>;
  const students = await prisma.studentProfile.findMany({
    where: departmentId ? { departmentId } : {},
    select: { id: true, firstName: true, lastName: true, rollNumber: true },
  });
  const studentIds = students.map((s) => s.id);

  const attendance = await prisma.attendance.findMany({
    where: {
      studentId: { in: studentIds },
      date: { gte: from ? new Date(from) : undefined, lte: to ? new Date(to) : undefined },
    },
  });

  const byStudent: Record<string, { present: number; total: number }> = {};
  for (const a of attendance) {
    byStudent[a.studentId] = byStudent[a.studentId] || { present: 0, total: 0 };
    byStudent[a.studentId].total += 1;
    if (a.status === "PRESENT") byStudent[a.studentId].present += 1;
  }

  const rows = students.map((s) => {
    const stat = byStudent[s.id] ?? { present: 0, total: 0 };
    return {
      studentId: s.id,
      name: `${s.firstName} ${s.lastName}`,
      rollNumber: s.rollNumber,
      percentage: stat.total > 0 ? Math.round((stat.present / stat.total) * 10000) / 100 : 0,
      totalClasses: stat.total,
    };
  });

  const overallPresent = attendance.filter((a) => a.status === "PRESENT").length;
  const overallPercentage = attendance.length > 0 ? Math.round((overallPresent / attendance.length) * 10000) / 100 : 0;
  const belowThreshold = rows.filter((r) => r.percentage < 75).length;

  res.json({ success: true, data: { overallPercentage, totalRecords: attendance.length, belowThreshold, rows } });
});

export default router;
