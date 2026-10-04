import { Router } from "express";
import { prisma } from "../lib/prisma";
import { authenticate } from "../middleware/auth";
import { getPagination, buildMeta } from "../utils/helpers";

const router = Router();
router.use(authenticate);

router.get("/", async (req, res) => {
  const { page, limit, skip } = getPagination(req);
  const { unreadOnly } = req.query as Record<string, string>;
  const where = { recipientId: req.user!.id, ...(unreadOnly === "true" ? { read: false } : {}) };
  const [items, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({ where, skip, take: limit, orderBy: { createdAt: "desc" } }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { recipientId: req.user!.id, read: false } }),
  ]);
  res.json({ success: true, data: items, meta: buildMeta(total, page, limit), unreadCount });
});

router.patch("/:id/read", async (req, res) => {
  const updated = await prisma.notification.updateMany({
    where: { id: req.params.id, recipientId: req.user!.id },
    data: { read: true },
  });
  res.json({ success: true, data: updated });
});

router.patch("/read-all", async (req, res) => {
  await prisma.notification.updateMany({ where: { recipientId: req.user!.id, read: false }, data: { read: true } });
  res.json({ success: true, message: "All notifications marked as read" });
});

router.delete("/:id", async (req, res) => {
  await prisma.notification.deleteMany({ where: { id: req.params.id, recipientId: req.user!.id } });
  res.json({ success: true, message: "Notification deleted" });
});

export default router;
