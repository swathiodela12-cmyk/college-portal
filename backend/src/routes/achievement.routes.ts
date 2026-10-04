import { z } from "zod";
import { prisma } from "../lib/prisma";
import { buildApprovalResourceRouter } from "../utils/approvalResourceFactory";

const createSchema = z.object({
  body: z.object({
    studentId: z.string().optional(),
    title: z.string().min(1),
    description: z.string().optional(),
    category: z.string().optional(),
    date: z.string(),
    proofUrl: z.string().optional(),
  }),
});

const updateSchema = z.object({
  body: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    category: z.string().optional(),
    date: z.string().optional(),
    proofUrl: z.string().optional(),
    status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
  }),
});

export default buildApprovalResourceRouter({
  model: prisma.achievement as any,
  createSchema,
  updateSchema,
  searchFields: ["title", "category"],
  sortFields: ["createdAt", "date", "title"],
  resourceName: "Achievement",
});
