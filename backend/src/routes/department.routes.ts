import { Router } from "express";
import { z } from "zod";
import { Role } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { authenticate, authorize } from "../middleware/auth";
import { validate } from "../middleware/validate";

const router = Router();
router.use(authenticate);

router.get("/", async (_req, res) => {
  const departments = await prisma.department.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { students: true, faculty: true } } },
  });
  res.json({ success: true, data: departments });
});

router.post(
  "/",
  authorize(Role.SUPER_ADMIN, Role.ADMIN),
  validate(z.object({ body: z.object({ name: z.string().min(1), code: z.string().min(1) }) })),
  async (req, res) => {
    const dept = await prisma.department.create({ data: req.body });
    res.status(201).json({ success: true, data: dept });
  }
);

router.patch(
  "/:id",
  authorize(Role.SUPER_ADMIN, Role.ADMIN),
  validate(z.object({ body: z.object({ name: z.string().optional(), code: z.string().optional() }) })),
  async (req, res) => {
    const dept = await prisma.department.update({ where: { id: req.params.id }, data: req.body });
    res.json({ success: true, data: dept });
  }
);

router.delete("/:id", authorize(Role.SUPER_ADMIN), async (req, res) => {
  await prisma.department.delete({ where: { id: req.params.id } });
  res.json({ success: true, message: "Department deleted" });
});

export default router;
