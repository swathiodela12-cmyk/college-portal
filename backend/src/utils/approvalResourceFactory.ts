import { Router } from "express";
import { z, AnyZodObject } from "zod";
import { Role } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { authenticate, authorize, authorizeSelfOrStaff } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { getPagination, getSort, buildMeta } from "../utils/helpers";
import { ApiError } from "../utils/ApiError";

type ModelDelegate = {
  findMany: (args: any) => Promise<any[]>;
  findUnique: (args: any) => Promise<any>;
  count: (args: any) => Promise<number>;
  create: (args: any) => Promise<any>;
  update: (args: any) => Promise<any>;
  delete: (args: any) => Promise<any>;
};

interface ApprovalResourceConfig {
  model: ModelDelegate;
  createSchema: AnyZodObject;
  updateSchema: AnyZodObject;
  searchFields: string[];
  sortFields: string[];
  resourceName: string;
}

/**
 * Builds a full CRUD router for student sub-resources that follow the
 * "created by student or staff, approved by staff" pattern
 * (Achievements, Awards, Certifications, Internships).
 */
export function buildApprovalResourceRouter(config: ApprovalResourceConfig): Router {
  const router = Router();
  router.use(authenticate);
  const staffOnly = authorize(Role.SUPER_ADMIN, Role.ADMIN, Role.FACULTY);

  const getOwnerUserId = async (id: string) => {
    const record = await config.model.findUnique({ where: { id }, include: { student: { select: { userId: true } } } });
    return record?.student?.userId ?? null;
  };

  // LIST - staff sees all (with filters), students see only their own
  router.get("/", async (req, res) => {
    const { page, limit, skip } = getPagination(req);
    const orderBy = getSort(req, config.sortFields);
    const { search, status, studentId } = req.query as Record<string, string>;

    const where: any = { AND: [] };
    if (search) {
      where.AND.push({ OR: config.searchFields.map((f) => ({ [f]: { contains: search, mode: "insensitive" } })) });
    }
    if (status) where.AND.push({ status });

    if (req.user!.role === Role.STUDENT) {
      const profile = await prisma.studentProfile.findUnique({ where: { userId: req.user!.id }, select: { id: true } });
      if (!profile) throw ApiError.notFound("Student profile not found");
      where.AND.push({ studentId: profile.id });
    } else if (studentId) {
      where.AND.push({ studentId });
    }

    const [items, total] = await Promise.all([
      config.model.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: { student: { select: { firstName: true, lastName: true, rollNumber: true } } },
      }),
      config.model.count({ where }),
    ]);
    res.json({ success: true, data: items, meta: buildMeta(total, page, limit) });
  });

  // GET ONE
  router.get(
    "/:id",
    authorizeSelfOrStaff((req) => getOwnerUserId(req.params.id)),
    async (req, res) => {
      const record = await config.model.findUnique({ where: { id: req.params.id }, include: { student: true } });
      if (!record) throw ApiError.notFound(`${config.resourceName} not found`);
      res.json({ success: true, data: record });
    }
  );

  // CREATE - student can create for self (auto-detected), staff for anyone
  router.post("/", validate(config.createSchema), async (req, res) => {
    let studentId = req.body.studentId;
    if (req.user!.role === Role.STUDENT) {
      const profile = await prisma.studentProfile.findUnique({ where: { userId: req.user!.id }, select: { id: true } });
      if (!profile) throw ApiError.notFound("Student profile not found");
      studentId = profile.id;
    } else if (!studentId) {
      throw ApiError.badRequest("studentId is required");
    }

    const { studentId: _omit, ...rest } = req.body;
    const dateFields = ["date", "startDate", "endDate", "issueDate", "expiryDate"];
    for (const f of dateFields) if (rest[f]) rest[f] = new Date(rest[f]);

    const created = await config.model.create({ data: { ...rest, studentId } });
    res.status(201).json({ success: true, data: created });
  });

  // UPDATE
  router.patch(
    "/:id",
    authorizeSelfOrStaff((req) => getOwnerUserId(req.params.id)),
    validate(config.updateSchema),
    async (req, res) => {
      const payload = { ...req.body };
      if (req.user!.role === Role.STUDENT) delete payload.status; // students cannot self-approve
      const dateFields = ["date", "startDate", "endDate", "issueDate", "expiryDate"];
      for (const f of dateFields) if (payload[f]) payload[f] = new Date(payload[f]);
      const updated = await config.model.update({ where: { id: req.params.id }, data: payload });
      res.json({ success: true, data: updated });
    }
  );

  // APPROVE / REJECT - staff only
  router.patch(
    "/:id/status",
    staffOnly,
    validate(z.object({ body: z.object({ status: z.enum(["PENDING", "APPROVED", "REJECTED"]) }) })),
    async (req, res) => {
      const updated = await config.model.update({ where: { id: req.params.id }, data: { status: req.body.status } });
      res.json({ success: true, data: updated });
    }
  );

  // DELETE
  router.delete(
    "/:id",
    authorizeSelfOrStaff((req) => getOwnerUserId(req.params.id)),
    async (req, res) => {
      await config.model.delete({ where: { id: req.params.id } });
      res.json({ success: true, message: `${config.resourceName} deleted successfully` });
    }
  );

  return router;
}
