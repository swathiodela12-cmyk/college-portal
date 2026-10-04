import { Router } from "express";
import { z } from "zod";
import { Role, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { authenticate, authorize } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { getPagination, buildMeta } from "../utils/helpers";

const router = Router();

// Public endpoint - anyone can submit a contact/enquiry message
router.post(
  "/",
  validate(
    z.object({
      body: z.object({
        name: z.string().min(1),
        email: z.string().email(),
        phone: z.string().optional(),
        subject: z.string().min(1),
        message: z.string().min(1),
        studentId: z.string().optional(),
      }),
    })
  ),
  async (req, res) => {
    const contact = await prisma.contact.create({ data: req.body });
    res.status(201).json({ success: true, message: "Your message has been received. We'll get back to you soon.", data: contact });
  }
);

router.use(authenticate);
const staffOnly = authorize(Role.SUPER_ADMIN, Role.ADMIN, Role.FACULTY);

router.get("/", staffOnly, async (req, res) => {
  const { page, limit, skip } = getPagination(req);
  const { resolved, search } = req.query as Record<string, string>;
  const where: Prisma.ContactWhereInput = {
    AND: [
      resolved !== undefined ? { resolved: resolved === "true" } : {},
      search
        ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { subject: { contains: search, mode: "insensitive" } }] }
        : {},
    ],
  };
  const [items, total] = await Promise.all([
    prisma.contact.findMany({ where, skip, take: limit, orderBy: { createdAt: "desc" } }),
    prisma.contact.count({ where }),
  ]);
  res.json({ success: true, data: items, meta: buildMeta(total, page, limit) });
});

router.patch(
  "/:id/resolve",
  staffOnly,
  validate(z.object({ body: z.object({ resolved: z.boolean() }) })),
  async (req, res) => {
    const updated = await prisma.contact.update({
      where: { id: req.params.id },
      data: { resolved: req.body.resolved, handledById: req.user!.id },
    });
    res.json({ success: true, data: updated });
  }
);

router.delete("/:id", staffOnly, async (req, res) => {
  await prisma.contact.delete({ where: { id: req.params.id } });
  res.json({ success: true, message: "Contact message deleted" });
});

export default router;
