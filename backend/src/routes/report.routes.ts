import { Router } from "express";
import { Role } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { authenticate, authorize } from "../middleware/auth";

const router = Router();
router.use(authenticate, authorize(Role.SUPER_ADMIN, Role.ADMIN, Role.FACULTY));

// Master dashboard summary - powers the Admin overview cards + charts
router.get("/dashboard", async (_req, res) => {
  const [
    totalStudents,
    activeStudents,
    totalFaculty,
    departmentCounts,
    pendingApprovals,
    upcomingEvents,
    recentAnnouncements,
    placementStats,
    attendanceToday,
    batchDistribution,
  ] = await Promise.all([
    prisma.studentProfile.count(),
    prisma.studentProfile.count({ where: { status: "ACTIVE" } }),
    prisma.facultyProfile.count(),
    prisma.department.findMany({ include: { _count: { select: { students: true } } } }),
    Promise.all([
      prisma.achievement.count({ where: { status: "PENDING" } }),
      prisma.award.count({ where: { status: "PENDING" } }),
      prisma.certification.count({ where: { status: "PENDING" } }),
      prisma.internship.count({ where: { status: "PENDING" } }),
    ]),
    prisma.event.findMany({ where: { startDate: { gte: new Date() } }, orderBy: { startDate: "asc" }, take: 5 }),
    prisma.announcement.findMany({ orderBy: { publishedAt: "desc" }, take: 5 }),
    prisma.placement.groupBy({ by: ["status"], _count: { status: true } }),
    prisma.attendance.groupBy({
      by: ["status"],
      where: { date: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
      _count: { status: true },
    }),
    prisma.studentProfile.groupBy({ by: ["batchYear"], _count: { batchYear: true } }),
  ]);

  const [achPending, awardPending, certPending, internPending] = pendingApprovals;

  res.json({
    success: true,
    data: {
      totalStudents,
      activeStudents,
      totalFaculty,
      departments: departmentCounts.map((d) => ({ name: d.name, students: d._count.students })),
      pendingApprovals: { achievements: achPending, awards: awardPending, certifications: certPending, internships: internPending, total: achPending + awardPending + certPending + internPending },
      upcomingEvents,
      recentAnnouncements,
      placementsByStatus: placementStats.map((p) => ({ status: p.status, count: p._count.status })),
      attendanceToday: attendanceToday.map((a) => ({ status: a.status, count: a._count.status })),
      batchDistribution: batchDistribution
        .filter((b) => b.batchYear !== null)
        .map((b) => ({ batchYear: b.batchYear, count: b._count.batchYear })),
    },
  });
});

router.get("/students-by-department", async (_req, res) => {
  const data = await prisma.department.findMany({
    select: { name: true, _count: { select: { students: true } } },
  });
  res.json({ success: true, data: data.map((d) => ({ department: d.name, count: d._count.students })) });
});

router.get("/grade-distribution", async (_req, res) => {
  const records = await prisma.academicRecord.groupBy({ by: ["grade"], _count: { grade: true } });
  res.json({ success: true, data: records.map((r) => ({ grade: r.grade, count: r._count.grade })) });
});

export default router;
