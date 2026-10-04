import { Router } from "express";
import { z } from "zod";
import { Role } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { authenticate, authorize, authorizeSelfOrStaff } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { upload } from "../middleware/upload";
import { ApiError } from "../utils/ApiError";

const router = Router();
router.use(authenticate);
const staffOnly = authorize(Role.SUPER_ADMIN, Role.ADMIN, Role.FACULTY);

const getOwner = async (id: string) => {
  const d = await prisma.document.findUnique({ where: { id }, include: { student: { select: { userId: true } } } });
  return d?.student.userId ?? null;
};

router.get(
  "/student/:studentId",
  authorizeSelfOrStaff(async (req) => {
    const s = await prisma.studentProfile.findUnique({ where: { id: req.params.studentId }, select: { userId: true } });
    return s?.userId ?? null;
  }),
  async (req, res) => {
    const docs = await prisma.document.findMany({
      where: { studentId: req.params.studentId },
      orderBy: { createdAt: "desc" },
    });
    res.json({ success: true, data: docs });
  }
);

router.post(
  "/student/:studentId",
  upload.single("file"),
  validate(z.object({ body: z.object({ title: z.string().min(1), type: z.string().optional() }) })),
  async (req, res) => {
    if (!req.file) throw ApiError.badRequest("No file uploaded");
    const studentProfile = await prisma.studentProfile.findUnique({ where: { id: req.params.studentId } });
    if (!studentProfile) throw ApiError.notFound("Student not found");
    if (req.user!.role === Role.STUDENT && studentProfile.userId !== req.user!.id) {
      throw ApiError.forbidden("You can only upload your own documents");
    }

    const doc = await prisma.document.create({
      data: {
        studentId: req.params.studentId,
        title: req.body.title,
        type: (req.body.type as any) ?? "OTHER",
        fileUrl: `/uploads/${req.file.filename}`,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        uploadedById: req.user!.id,
      },
    });
    res.status(201).json({ success: true, data: doc });
  }
);

router.patch(
  "/:id/verify",
  staffOnly,
  validate(z.object({ body: z.object({ verified: z.boolean() }) })),
  async (req, res) => {
    const updated = await prisma.document.update({ where: { id: req.params.id }, data: { verified: req.body.verified } });
    res.json({ success: true, data: updated });
  }
);

router.delete(
  "/:id",
  authorizeSelfOrStaff((req) => getOwner(req.params.id)),
  async (req, res) => {
    await prisma.document.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: "Document deleted" });
  }
);

export default router;
