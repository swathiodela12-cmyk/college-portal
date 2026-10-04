import { z } from "zod";
import { prisma } from "../lib/prisma";
import { buildApprovalResourceRouter } from "../utils/approvalResourceFactory";

const createSchema = z.object({
  body: z.object({
    studentId: z.string().optional(),
    companyName: z.string().min(1),
    role: z.string().min(1),
    startDate: z.string(),
    endDate: z.string().optional(),
    stipend: z.number().optional(),
    location: z.string().optional(),
    mode: z.string().optional(),
    description: z.string().optional(),
    certificateUrl: z.string().optional(),
  }),
});

const updateSchema = z.object({
  body: z.object({
    companyName: z.string().optional(),
    role: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    stipend: z.number().optional(),
    location: z.string().optional(),
    mode: z.string().optional(),
    description: z.string().optional(),
    certificateUrl: z.string().optional(),
    status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
  }),
});

export default buildApprovalResourceRouter({
  model: prisma.internship as any,
  createSchema,
  updateSchema,
  searchFields: ["companyName", "role", "location"],
  sortFields: ["createdAt", "startDate", "companyName"],
  resourceName: "Internship",
});
