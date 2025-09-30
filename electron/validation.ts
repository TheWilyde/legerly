import { z } from 'zod';

// Shared
export const IdSchema = z.coerce.number().int().nonnegative();

const DateYMD = /^\d{4}-\d{2}-\d{2}$/;

export const NewInvoiceSchema = z.object({
  supplierName: z.string().min(1).max(200),
  total: z.number().finite().min(0),
  number: z.string().min(1).max(50),
  address: z.string().max(500).optional(),
  invoiceDate: z.string().regex(DateYMD).optional(),
});

const InvoiceItemSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  rate: z.number().finite().min(0),
  qty: z.number().finite().min(0),
  position: z.coerce.number().int().min(0),
});

export const SaveInvoiceSchema = z.object({
  id: IdSchema.optional(),
  number: z.string().min(1).max(50),
  supplierName: z.string().min(1).max(200),
  total: z.number().finite().min(0),
  address: z.string().max(500).optional(),
  invoiceDate: z.string().regex(DateYMD).optional(),
  items: z.array(InvoiceItemSchema),
});

export const NewStockItemSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  purchaseRate: z.number().finite().min(0),
  purchaseQty: z.number().finite().min(0),
  saleRate: z.number().finite().min(0),
  saleQty: z.number().finite().min(0),
});

export const WorkspaceIdSchema = z.string().min(1);
export const WorkspaceNameSchema = z.string().trim().min(1).max(200);

export const LedgerRowSchema = z.object({
  id: z.number().int().nonnegative().optional(),
  date: z.string().max(50),
  particulars: z.string().max(500),
  debit: z.number().finite(),
  credit: z.number().finite(),
  crDr: z.enum(['CR', 'DR']),
  position: z.number().int().nonnegative(),
});

export const LedgerSaveSchema = z.object({
  id: z.number().int().positive().optional(),
  customerName: z.string().min(1).max(200),
  contactNo: z.string().max(50).optional(),
  totals: z.object({
    debit: z.number().finite(),
    credit: z.number().finite(),
    net: z.number().finite(),
  }),
  rows: z.array(LedgerRowSchema),
});

export type NewInvoiceInput = z.infer<typeof NewInvoiceSchema>;
export type SaveInvoiceInput = z.infer<typeof SaveInvoiceSchema>;
export type NewStockItemInput = z.infer<typeof NewStockItemSchema>;
export type LedgerSaveInput = z.infer<typeof LedgerSaveSchema>;