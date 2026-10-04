import { z } from "zod";
import { prisma } from "../lib/prisma";
import { buildApprovalResourceRouter } from "../utils/approvalResourceFactory";

const createSchema = z.object({
  body: z.object({
    studentId: z.string().optional(),
    title: z.string().min(1),
    issuingOrg: z.string().min(1),
    issueDate: z.string(),
    expiryDate: z.string().optional(),
    credentialId: z.string().optional(),
    credentialUrl: z.string().optional(),
    certificateUrl: z.string().optional(),
  }),
});

const updateSchema = z.object({
  body: z.object({
    title: z.string().optional(),
    issuingOrg: z.string().optional(),
    issueDate: z.string().optional(),
    expiryDate: z.string().optional(),
    credentialId: z.string().optional(),
    credentialUrl: z.string().optional(),
    certificateUrl: z.string().optional(),
    status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
  }),
});

export default buildApprovalResourceRouter({
  model: prisma.certification as any,
  createSchema,
  updateSchema,
  searchFields: ["title", "issuingOrg"],
  sortFields: ["createdAt", "issueDate", "title"],
  resourceName: "Certification",
});
