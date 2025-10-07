import {z} from 'zod';

export const NewInvoiceSchema = z.object({
  supplierName: z.string().trim().min(1).max(200),
  total: z.number().finite().min(0),
  number: z.string().trim().min(1).max(50),
  address: z.string().max(500).optional(),
  invoiceDate: z.string().max(50).optional(),
});

export const NewInvoiceItemSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  rate: z.number().finite().min(0),
  qty: z.number().finite().min(0),
  position: z.number().int().nonnegative(),
});

export const SaveInvoiceSchema = z.object({
  id: z.number().int().positive().optional(),
  number: z.string().trim().min(1).max(50),
  supplierName: z.string().trim().min(1).max(200),
  total: z.number().finite().min(0),
  address: z.string().max(500).optional(),
  invoiceDate: z.string().max(50).optional(),
  items: z.array(NewInvoiceItemSchema),
});

export const IdSchema = z.number().int().positive();

export const NewStockItemSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  purchaseRate: z.number().finite().min(0),
  purchaseQty: z.number().finite().min(0),
  saleRate: z.number().finite().min(0),
  saleQty: z.number().finite().min(0),
});

// ✅ Add missing LedgerSaveSchema
const LedgerRowSchema = z.object({
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
  customerName: z.string().trim().min(1).max(200),
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
