import { z } from "zod";
import { AppError, ErrorCodes } from "./errors";

const itemSchema = z
  .object({
    id: z.number().int().positive().optional(),
    code: z.string().trim().min(1).max(64),
    name: z.string().trim().min(1).max(256),
    rate: z.number().finite().positive().optional(),
    rateMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
    qty: z.number().finite().positive().max(Number.MAX_SAFE_INTEGER),
    position: z.number().int().nonnegative().optional(),
  })
  .refine((item) => item.rateMinor !== undefined || item.rate !== undefined, {
    message: "Each item requires rateMinor.",
  });

const commonSchema = z
  .object({
    id: z.number().int().positive().optional(),
    version: z.number().int().positive().optional(),
    number: z.string().trim().min(1).max(64),
    invoiceDate: z.iso.date(),
    address: z.string().trim().max(1000).optional(),
    contactNo: z.string().trim().max(64).optional(),
    items: z.array(itemSchema).min(1).max(1000),
    status: z.enum(["draft", "posted"]).optional(),
    overrideClosedPeriod: z.boolean().optional(),
    periodId: z.number().int().positive().optional(),
    invoiceIdPerPeriod: z.number().int().positive().optional(),
    correctionReason: z.string().trim().max(500).optional(),
    total: z.number().finite().nonnegative().optional(),
    totalMinor: z.number().finite().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
  })
  .refine((payload) => payload.id === undefined || payload.version !== undefined, {
    message: "Version is required when editing an invoice.",
    path: ["version"],
  });

const purchaseSchema = commonSchema.extend({
  supplierName: z.string().trim().min(1).max(256),
});

const saleSchema = commonSchema.extend({
  customerName: z.string().trim().min(1).max(256),
});

export function validateInvoicePayload(
  kind: "purchase" | "sale",
  payload: unknown,
): unknown {
  const result = (kind === "purchase" ? purchaseSchema : saleSchema).safeParse(payload);
  if (!result.success) {
    const message = result.error.issues
      .slice(0, 3)
      .map((issue) => `${issue.path.join(".") || "invoice"}: ${issue.message}`)
      .join("; ");
    throw new AppError(message || "Invoice payload is invalid.", ErrorCodes.INVALID_INPUT);
  }
  return result.data;
}
