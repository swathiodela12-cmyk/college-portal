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

// ---------------- PROGRAMS ----------------
router.get("/programs", async (_req, res) => {
  const programs = await prisma.program.findMany({
    include: { department: true, _count: { select: { events: true } } },
    orderBy: { name: "asc" },
  });
  res.json({ success: true, data: programs });
});

router.post(
  "/programs",
  staffOnly,
  validate(
    z.object({
      body: z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        departmentId: z.string().optional(),
        durationYears: z.number().optional(),
      }),
    })
  ),
  async (req, res) => {
    const program = await prisma.program.create({ data: req.body });
    res.status(201).json({ success: true, data: program });
  }
);

router.patch("/programs/:id", staffOnly, async (req, res) => {
  const program = await prisma.program.update({ where: { id: req.params.id }, data: req.body });
  res.json({ success: true, data: program });
});

router.delete("/programs/:id", staffOnly, async (req, res) => {
  await prisma.program.delete({ where: { id: req.params.id } });
  res.json({ success: true, message: "Program deleted" });
});

// ---------------- EVENTS ----------------
router.get("/events", async (req, res) => {
  const { page, limit, skip } = getPagination(req);
  const { search, type, upcoming } = req.query as Record<string, string>;
  const where: Prisma.EventWhereInput = {
    AND: [
      search ? { title: { contains: search, mode: "insensitive" } } : {},
      type ? { type: type as any } : {},
      upcoming === "true" ? { startDate: { gte: new Date() } } : {},
    ],
  };
  const [items, total] = await Promise.all([
    prisma.event.findMany({
      where,
      skip,
      take: limit,
      orderBy: { startDate: "desc" },
      include: { program: true, _count: { select: { participations: true } } },
    }),
    prisma.event.count({ where }),
  ]);
  res.json({ success: true, data: items, meta: buildMeta(total, page, limit) });
});

router.get("/events/:id", async (req, res) => {
  const event = await prisma.event.findUnique({
    where: { id: req.params.id },
    include: {
      program: true,
      participations: { include: { student: { select: { firstName: true, lastName: true, rollNumber: true } } } },
    },
  });
  if (!event) throw ApiError.notFound("Event not found");
  res.json({ success: true, data: event });
});

const eventSchema = z.object({
  body: z.object({
    title: z.string().min(1),
    description: z.string().optional(),
    type: z.enum(["WORKSHOP", "SEMINAR", "HACKATHON", "CULTURAL", "SPORTS", "CONFERENCE", "GUEST_LECTURE", "OTHER"]).optional(),
    programId: z.string().optional(),
    venue: z.string().optional(),
    startDate: z.string(),
    endDate: z.string().optional(),
    bannerUrl: z.string().optional(),
    capacity: z.number().optional(),
  }),
});

router.post("/events", staffOnly, validate(eventSchema), async (req, res) => {
  const { startDate, endDate, ...rest } = req.body;
  const event = await prisma.event.create({
    data: { ...rest, startDate: new Date(startDate), endDate: endDate ? new Date(endDate) : undefined },
  });
  res.status(201).json({ success: true, data: event });
});

router.patch("/events/:id", staffOnly, async (req, res) => {
  const payload = { ...req.body };
  if (payload.startDate) payload.startDate = new Date(payload.startDate);
  if (payload.endDate) payload.endDate = new Date(payload.endDate);
  const event = await prisma.event.update({ where: { id: req.params.id }, data: payload });
  res.json({ success: true, data: event });
});

router.delete("/events/:id", staffOnly, async (req, res) => {
  await prisma.event.delete({ where: { id: req.params.id } });
  res.json({ success: true, message: "Event deleted" });
});

// ---------------- PARTICIPATION ----------------
router.post(
  "/events/:id/register",
  validate(z.object({ body: z.object({ studentId: z.string().optional(), role: z.string().optional() }) })),
  async (req, res) => {
    let studentId = req.body.studentId;
    if (req.user!.role === Role.STUDENT) {
      const profile = await prisma.studentProfile.findUnique({ where: { userId: req.user!.id }, select: { id: true } });
      if (!profile) throw ApiError.notFound("Student profile not found");
      studentId = profile.id;
    }
    if (!studentId) throw ApiError.badRequest("studentId is required");

    const participation = await prisma.eventParticipation.create({
      data: { eventId: req.params.id, studentId, role: req.body.role ?? "Participant" },
    });
    res.status(201).json({ success: true, data: participation });
  }
);

router.patch(
  "/participations/:id",
  staffOnly,
  validate(z.object({ body: z.object({ role: z.string().optional(), position: z.string().optional(), certificateUrl: z.string().optional() }) })),
  async (req, res) => {
    const updated = await prisma.eventParticipation.update({ where: { id: req.params.id }, data: req.body });
    res.json({ success: true, data: updated });
  }
);

router.delete(
  "/participations/:id",
  authorizeSelfOrStaff(async (req) => {
    const p = await prisma.eventParticipation.findUnique({
      where: { id: req.params.id },
      include: { student: { select: { userId: true } } },
    });
    return p?.student.userId ?? null;
  }),
  async (req, res) => {
    await prisma.eventParticipation.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: "Registration cancelled" });
  }
);

router.get(
  "/participations/student/:studentId",
  authorizeSelfOrStaff(async (req) => {
    const s = await prisma.studentProfile.findUnique({ where: { id: req.params.studentId }, select: { userId: true } });
    return s?.userId ?? null;
  }),
  async (req, res) => {
    const participations = await prisma.eventParticipation.findMany({
      where: { studentId: req.params.studentId },
      include: { event: true },
      orderBy: { registeredAt: "desc" },
    });
    res.json({ success: true, data: participations });
  }
);

export default router;
