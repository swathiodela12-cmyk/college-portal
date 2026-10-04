import { z } from "zod";
import { prisma } from "../lib/prisma";
import { buildApprovalResourceRouter } from "../utils/approvalResourceFactory";

const createSchema = z.object({
  body: z.object({
    studentId: z.string().optional(),
    title: z.string().min(1),
    issuedBy: z.string().optional(),
    level: z.string().optional(),
    date: z.string(),
    description: z.string().optional(),
    proofUrl: z.string().optional(),
  }),
});

const updateSchema = z.object({
  body: z.object({
    title: z.string().optional(),
    issuedBy: z.string().optional(),
    level: z.string().optional(),
    date: z.string().optional(),
    description: z.string().optional(),
    proofUrl: z.string().optional(),
    status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
  }),
});

export default buildApprovalResourceRouter({
  model: prisma.award as any,
  createSchema,
  updateSchema,
  searchFields: ["title", "issuedBy", "level"],
  sortFields: ["createdAt", "date", "title"],
  resourceName: "Award",
});
