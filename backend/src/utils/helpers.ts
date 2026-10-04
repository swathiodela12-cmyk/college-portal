import { Request } from "express";

export function getPagination(req: Request) {
  const page = Math.max(parseInt((req.query.page as string) ?? "1", 10), 1);
  const limit = Math.min(Math.max(parseInt((req.query.limit as string) ?? "10", 10), 1), 100);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

export function getSort(req: Request, allowedFields: string[], defaultField = "createdAt") {
  const sortBy = allowedFields.includes(req.query.sortBy as string)
    ? (req.query.sortBy as string)
    : defaultField;
  const sortOrder = req.query.sortOrder === "asc" ? "asc" : "desc";
  return { [sortBy]: sortOrder } as Record<string, "asc" | "desc">;
}

export function buildMeta(total: number, page: number, limit: number) {
  return {
    total,
    page,
    limit,
    totalPages: Math.max(Math.ceil(total / limit), 1),
  };
}

export function toCSV(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (val: unknown) => {
    const str = val === null || val === undefined ? "" : String(val);
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(","));
  }
  return lines.join("\n");
}
