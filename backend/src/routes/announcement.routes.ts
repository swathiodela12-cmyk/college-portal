import { Router } from "express";
import { z } from "zod";
import { Role, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { authenticate, authorize } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { getPagination, buildMeta } from "../utils/helpers";

const router = Router();
router.use(authenticate);
const staffOnly = authorize(Role.SUPER_ADMIN, Role.ADMIN, Role.FACULTY);

router.get("/", async (req, res) => {
  const { page, limit, skip } = getPagination(req);
  const { search, audience } = req.query as Record<string, string>;
  const where: Prisma.AnnouncementWhereInput = {
    AND: [
      search ? { OR: [{ title: { contains: search, mode: "insensitive" } }, { body: { contains: search, mode: "insensitive" } }] } : {},
      audience ? { audience: audience as any } : {},
      { OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }] },
    ],
  };
  const [items, total] = await Promise.all([
    prisma.announcement.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ pinned: "desc" }, { publishedAt: "desc" }],
      include: { author: { select: { email: true, role: true } } },
    }),
    prisma.announcement.count({ where }),
  ]);
  res.json({ success: true, data: items, meta: buildMeta(total, page, limit) });
});

const createSchema = z.object({
  body: z.object({
    title: z.string().min(1),
    body: z.string().min(1),
    audience: z.enum(["ALL", "STUDENTS", "FACULTY", "ADMINS", "SPECIFIC_DEPARTMENT", "SPECIFIC_YEAR"]).optional(),
    departmentId: z.string().optional(),
    batchYear: z.number().optional(),
    pinned: z.boolean().optional(),
    expiresAt: z.string().optional(),
  }),
});

router.post("/", staffOnly, validate(createSchema), async (req, res) => {
  const { expiresAt, ...rest } = req.body;
  const announcement = await prisma.announcement.create({
    data: { ...rest, expiresAt: expiresAt ? new Date(expiresAt) : undefined, authorId: req.user!.id },
  });

  // Fan-out lightweight notifications to students (best-effort, capped)
  if (rest.audience === "STUDENTS" || rest.audience === "ALL" || !rest.audience) {
    const students = await prisma.studentProfile.findMany({ take: 500, select: { userId: true } });
    if (students.length > 0) {
      await prisma.notification.createMany({
        data: students.map((s) => ({
          recipientId: s.userId,
          type: "ANNOUNCEMENT",
          title: "New Announcement",
          message: announcement.title,
          link: `/announcements/${announcement.id}`,
        })),
      });
    }
  }

  res.status(201).json({ success: true, data: announcement });
});

router.patch("/:id", staffOnly, async (req, res) => {
  const payload = { ...req.body };
  if (payload.expiresAt) payload.expiresAt = new Date(payload.expiresAt);
  const updated = await prisma.announcement.update({ where: { id: req.params.id }, data: payload });
  res.json({ success: true, data: updated });
});

router.delete("/:id", staffOnly, async (req, res) => {
  await prisma.announcement.delete({ where: { id: req.params.id } });
  res.json({ success: true, message: "Announcement deleted" });
});

export default router;
