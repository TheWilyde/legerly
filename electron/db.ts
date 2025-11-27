import Database from 'better-sqlite3';
import {AppError, ErrorCodes} from './errors';
import {normalizeCode} from './utils';
import {encryptionService} from './encryption';

// Fields to encrypt
const ENCRYPTED_INVOICE_FIELDS = [
  'supplierName',
  'address',
  'contactNo',
] as const;
const ENCRYPTED_SALE_INVOICE_FIELDS = [
  'customerName',
  'address',
  'contactNo',
] as const;
const ENCRYPTED_LEDGER_FIELDS = ['customerName', 'contactNo'] as const;

export type NewPurchaseInvoice = {
  supplierName: string;
  total: number;
  number: string;
  address?: string;
  invoiceDate?: string;
  contactNo?: string;
};

export type NewSaleInvoice = {
  customerName: string;
  total: number;
  number: string;
  address?: string;
  invoiceDate?: string;
  contactNo?: string;
};

export type Invoice = {
  id: number;
  number: string;
  supplierName: string;
  total: number;
  createdAt: string;
  address?: string;
  invoiceDate?: string;
  contactNo?: string;
  status: 'draft' | 'posted';
};

export type SaleInvoice = {
  id: number;
  number: string;
  customerName: string;
  total: number;
  createdAt: string;
  address?: string;
  invoiceDate?: string;
  contactNo?: string;
  status: 'draft' | 'posted';
};

export type NewStockItem = {
  code: string;
  name: string;
  purchaseRate: number;
  purchaseQty: number;
  saleRate: number;
  saleQty: number;
};
export type StockItem = NewStockItem & {id: number; createdAt: string};

export type NewInvoiceItem = {
  code: string;
  name: string;
  rate: number;
  qty: number;
  position: number;
};
export type InvoiceItem = NewInvoiceItem & {id: number; invoiceId: number};
export type InvoiceWithItems = {invoice: Invoice; items: InvoiceItem[]};

export type LedgerSavePayload = {
  id?: number;
  customerName: string;
  contactNo?: string;
  totals: {
    debit: number;
    credit: number;
    net: number;
  };
  rows: {
    id?: number;
    date: string;
    particulars: string;
    debit: number;
    credit: number;
    crDr: 'CR' | 'DR';
    position: number;
  }[];
};

// ✅ Encryption helpers
function encryptNumber(value: number, key?: Buffer): string {
  return encryptionService.encrypt(String(value), key);
}

function decryptNumber(encrypted: string, key?: Buffer): number {
  if (!encryptionService.isEncrypted(encrypted)) {
    return Number(encrypted) || 0;
  }
  return Number(encryptionService.decrypt(encrypted, key)) || 0;
}

function decrypt(value: string | null | undefined, key: Buffer): string {
  if (!value) return '';
  if (!encryptionService.isEncrypted(value)) {
    return value;
  }
  try {
    return encryptionService.decrypt(value, key);
  } catch {
    return value;
  }
}

// ==================== INVOICES ====================

export function listInvoices(
  db: Database.Database,
  encryptionKey: Buffer,
  filters: {startDate?: string; endDate?: string} = {}
): Invoice[] {
  // ✅ FIX: Use invoiceNumber column (matches schema), not number
  let sql = `
    SELECT id, invoiceNumber, invoiceDate, supplierName, total, totalQty, status, createdAt, updatedAt
    FROM invoices
  `;

  const conditions: string[] = [];
  const params: any[] = [];

  if (filters.startDate) {
    conditions.push(`invoiceDate >= ?`);
    params.push(filters.startDate);
  }
  if (filters.endDate) {
    conditions.push(`invoiceDate <= ?`);
    params.push(filters.endDate);
  }

  if (conditions.length > 0) {
    sql += ` WHERE ${conditions.join(' AND ')}`;
  }

  sql += ` ORDER BY createdAt DESC`;

  const rows = db.prepare(sql).all(...params) as any[];

  return rows.map((row) => ({
    id: row.id,
    number: row.invoiceNumber || '', // ✅ Map invoiceNumber to number
    invoiceDate: row.invoiceDate,
    supplierName: decrypt(row.supplierName, encryptionKey),
    total: decryptNumber(String(row.total), encryptionKey),
    totalQty: row.totalQty || 0,
    status: row.status || 'draft',
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

export function createInvoice(
  input: NewPurchaseInvoice,
  db: Database.Database,
  encryptionKey: Buffer
) {
  const createdAt = new Date().toISOString();

  const encrypted = encryptionService.encryptFields(
    {
      supplierName: input.supplierName,
      address: input.address,
      contactNo: input.contactNo,
    },
    ENCRYPTED_INVOICE_FIELDS,
    encryptionKey
  );

  // ✅ FIX: Use invoiceNumber column (matches schema)
  const stmt = db.prepare(
    `INSERT INTO invoices (invoiceNumber, supplierName, total, createdAt, address, invoiceDate, contactNo, status)
     VALUES (@invoiceNumber, @supplierName, @total, @createdAt, @address, @invoiceDate, @contactNo, @status)`
  );
  const info = stmt.run({
    invoiceNumber: input.number,
    supplierName: encrypted.supplierName,
    total: encryptNumber(input.total, encryptionKey),
    createdAt,
    address: encrypted.address ?? '',
    invoiceDate: input.invoiceDate ?? null,
    contactNo: encrypted.contactNo ?? '',
    status: 'draft',
  });

  return {
    id: Number(info.lastInsertRowid),
    number: input.number,
    supplierName: input.supplierName,
    total: input.total,
    createdAt,
    address: input.address ?? '',
    invoiceDate: input.invoiceDate ?? null,
    contactNo: input.contactNo ?? '',
    status: 'draft',
  } as const;
}

export function deleteInvoice(
  id: number,
  db: Database.Database,
  _encryptionKey: Buffer
): void {
  db.prepare(`DELETE FROM invoices WHERE id = ?`).run(id);
}

export function getInvoice(
  id: number,
  db: Database.Database,
  encryptionKey: Buffer
): InvoiceWithItems | undefined {
  // ✅ FIX: Use invoiceNumber column
  const inv = db
    .prepare(
      `SELECT id, invoiceNumber, supplierName, total, createdAt, address, invoiceDate, contactNo, status FROM invoices WHERE id = ?`
    )
    .get(id) as any;

  if (!inv) return undefined;

  const decrypted = encryptionService.decryptFields(
    inv,
    ENCRYPTED_INVOICE_FIELDS,
    encryptionKey
  );

  const items = db
    .prepare(
      `SELECT id, invoiceId, code, name, rate, qty, position FROM invoice_items WHERE invoiceId = ? ORDER BY position ASC`
    )
    .all(id) as any[];

  const decryptedItems = items.map((item) => ({
    ...item,
    rate: decryptNumber(String(item.rate), encryptionKey),
  }));

  return {
    invoice: {
      ...decrypted,
      number: inv.invoiceNumber || '', // ✅ Map invoiceNumber to number
      total: decryptNumber(String(inv.total), encryptionKey),
      status: inv.status || 'posted',
    } as any,
    items: decryptedItems,
  };
}

export function saveInvoice(
  payload: {
    id?: number;
    number: string;
    supplierName: string;
    total: number;
    address?: string;
    invoiceDate?: string;
    contactNo?: string;
    items: NewInvoiceItem[];
    status?: 'draft' | 'posted';
  },
  db: Database.Database,
  encryptionKey: Buffer
): InvoiceWithItems {
  const p = payload;
  const items = p.items;
  const newStatus = p.status || 'posted';

  let finalInvoiceDate = p.invoiceDate;
  if (newStatus === 'posted' && !finalInvoiceDate) {
    finalInvoiceDate = new Date().toISOString().split('T')[0];
  }

  let invoiceId = p.id;
  let previousItems: InvoiceItem[] | undefined;
  let previousStatus: 'draft' | 'posted' | undefined;

  const tx = db.transaction(() => {
    if (p.id) {
      const prevInvoice = db
        .prepare('SELECT status FROM invoices WHERE id = ?')
        .get(p.id) as any;
      previousStatus = prevInvoice?.status || 'posted';

      const prevRaw = db
        .prepare(
          `SELECT id, invoiceId, code, name, rate, qty, position FROM invoice_items WHERE invoiceId = ?`
        )
        .all(p.id) as any[];
      previousItems = prevRaw.map((item: any) => ({
        ...item,
        rate: decryptNumber(String(item.rate), encryptionKey),
      }));

      db.prepare(`DELETE FROM invoice_items WHERE invoiceId = ?`).run(p.id);

      const enc = encryptionService.encryptFields(
        {
          supplierName: p.supplierName,
          address: p.address ?? '',
          contactNo: p.contactNo ?? '',
        },
        ENCRYPTED_INVOICE_FIELDS,
        encryptionKey
      );

      // ✅ FIX: Use invoiceNumber column
      db.prepare(
        `UPDATE invoices 
         SET invoiceNumber = @invoiceNumber, supplierName = @supplierName, total = @total, 
             address = @address, invoiceDate = @invoiceDate, contactNo = @contactNo,
             status = @status
         WHERE id = @id`
      ).run({
        id: p.id,
        invoiceNumber: p.number,
        supplierName: enc.supplierName,
        total: encryptNumber(p.total, encryptionKey),
        address: enc.address || null,
        invoiceDate: finalInvoiceDate || null,
        contactNo: enc.contactNo || null,
        status: newStatus,
      });
    } else {
      const enc = encryptionService.encryptFields(
        {
          supplierName: p.supplierName,
          address: p.address ?? '',
          contactNo: p.contactNo ?? '',
        },
        ENCRYPTED_INVOICE_FIELDS,
        encryptionKey
      );
      // ✅ FIX: Use invoiceNumber column
      const info = db
        .prepare(
          `INSERT INTO invoices (invoiceNumber, supplierName, total, createdAt, address, invoiceDate, contactNo, status)
           VALUES (@invoiceNumber, @supplierName, @total, @createdAt, @address, @invoiceDate, @contactNo, @status)`
        )
        .run({
          invoiceNumber: p.number,
          supplierName: enc.supplierName,
          total: encryptNumber(p.total, encryptionKey),
          createdAt: new Date().toISOString(),
          address: enc.address || null,
          invoiceDate: finalInvoiceDate || null,
          contactNo: enc.contactNo || null,
          status: newStatus,
        });
      invoiceId = Number(info.lastInsertRowid);
    }

    const insertItem = db.prepare(
      `INSERT INTO invoice_items (invoiceId, code, name, rate, qty, position)
       VALUES (@invoiceId, @code, @name, @rate, @qty, @position)`
    );
    for (const it of items) {
      insertItem.run({
        invoiceId,
        code: it.code,
        name: it.name,
        rate: encryptNumber(it.rate, encryptionKey),
        qty: it.qty,
        position: it.position,
      });
    }

    updateStockOnPurchase(
      db,
      items,
      newStatus,
      previousItems,
      previousStatus,
      encryptionKey
    );
  });

  tx();
  return getInvoice(invoiceId!, db, encryptionKey)!;
}

// ==================== STOCK ====================

export function listStock(
  db: Database.Database,
  encryptionKey: Buffer
): StockItem[] {
  const results = db
    .prepare(
      `SELECT id, code, name, purchaseRate, purchaseQty, saleRate, saleQty, createdAt
       FROM stock ORDER BY id DESC`
    )
    .all() as any[];

  return results.map((item) => ({
    ...item,
    purchaseRate: decryptNumber(String(item.purchaseRate), encryptionKey),
    saleRate: decryptNumber(String(item.saleRate), encryptionKey),
  }));
}

export function createStock(
  input: NewStockItem,
  db: Database.Database,
  encryptionKey: Buffer
): StockItem {
  const code = normalizeCode(input.code);
  const name = String(input.name ?? '').trim();

  try {
    const stmt = db.prepare(`
      INSERT INTO stock (code, name, purchaseRate, purchaseQty, saleRate, saleQty, createdAt)
      VALUES (@code, @name, @purchaseRate, @purchaseQty, @saleRate, @saleQty, datetime('now'))
    `);
    const info = stmt.run({
      code,
      name,
      purchaseRate: encryptNumber(+input.purchaseRate || 0, encryptionKey),
      purchaseQty: +input.purchaseQty || 0,
      saleRate: encryptNumber(+input.saleRate || 0, encryptionKey),
      saleQty: +input.saleQty || 0,
    });

    const result = db
      .prepare(`SELECT * FROM stock WHERE id=@id`)
      .get({id: info.lastInsertRowid}) as any;

    return {
      ...result,
      purchaseRate: decryptNumber(String(result.purchaseRate), encryptionKey),
      saleRate: decryptNumber(String(result.saleRate), encryptionKey),
    };
  } catch (e: any) {
    if (
      String(e?.message || '').includes('UNIQUE') &&
      String(e?.message || '').includes('code')
    ) {
      throw new AppError(
        `Code "${code}" already exists. Please use a unique code.`,
        ErrorCodes.DUPLICATE_CODE
      );
    }
    throw e;
  }
}

export function updateStock(
  id: number,
  input: NewStockItem,
  db: Database.Database,
  encryptionKey: Buffer
): StockItem {
  const code = normalizeCode(input.code);
  const name = String(input.name ?? '').trim();

  try {
    db.prepare(
      `UPDATE stock
       SET code=@code, name=@name, purchaseRate=@purchaseRate, purchaseQty=@purchaseQty,
           saleRate=@saleRate, saleQty=@saleQty
       WHERE id=@id`
    ).run({
      id,
      code,
      name,
      purchaseRate: encryptNumber(+input.purchaseRate || 0, encryptionKey),
      purchaseQty: +input.purchaseQty || 0,
      saleRate: encryptNumber(+input.saleRate || 0, encryptionKey),
      saleQty: +input.saleQty || 0,
    });

    const result = db
      .prepare(`SELECT * FROM stock WHERE id=@id`)
      .get({id}) as any;

    return {
      ...result,
      purchaseRate: decryptNumber(String(result.purchaseRate), encryptionKey),
      saleRate: decryptNumber(String(result.saleRate), encryptionKey),
    };
  } catch (e: any) {
    if (
      String(e?.message || '').includes('UNIQUE') &&
      String(e?.message || '').includes('code')
    ) {
      throw new AppError(
        `Code "${code}" already exists. Please use a unique code.`,
        ErrorCodes.DUPLICATE_CODE
      );
    }
    throw e;
  }
}

export function deleteStock(
  id: number,
  db: Database.Database,
  _encryptionKey: Buffer
): void {
  db.prepare(`DELETE FROM stock WHERE id = ?`).run(id);
}

// ==================== STOCK UPDATE HELPERS ====================

function updateStockOnPurchase(
  db: Database.Database,
  items: NewInvoiceItem[],
  newStatus: 'draft' | 'posted',
  previousItems: InvoiceItem[] | undefined,
  previousStatus: 'draft' | 'posted' | undefined,
  encryptionKey: Buffer
) {
  if (previousItems && previousStatus === 'posted') {
    for (const item of previousItems) {
      const stock = db
        .prepare(`SELECT purchaseQty, purchaseRate FROM stock WHERE code = ?`)
        .get(item.code) as any;

      if (stock) {
        const newQty = stock.purchaseQty - item.qty;
        db.prepare(
          `UPDATE stock SET purchaseQty = @qty WHERE code = @code`
        ).run({
          code: item.code,
          qty: newQty,
        });
      }
    }
  }

  if (newStatus === 'posted') {
    for (const item of items) {
      const stock = db
        .prepare(`SELECT purchaseQty, purchaseRate FROM stock WHERE code = ?`)
        .get(item.code) as any;

      if (stock) {
        db.prepare(
          `UPDATE stock
           SET purchaseQty = purchaseQty + @qty,
               purchaseRate = @rate,
               name = @name
           WHERE code = @code`
        ).run({
          code: item.code,
          qty: item.qty,
          rate: encryptNumber(item.rate, encryptionKey),
          name: item.name,
        });
      } else {
        db.prepare(
          `INSERT INTO stock (code, name, purchaseRate, purchaseQty, saleRate, saleQty, createdAt)
           VALUES (@code, @name, @purchaseRate, @purchaseQty, @saleRate, @saleQty, datetime('now'))`
        ).run({
          code: item.code,
          name: item.name,
          purchaseRate: encryptNumber(item.rate, encryptionKey),
          purchaseQty: item.qty,
          saleRate: encryptNumber(0, encryptionKey),
          saleQty: 0,
        });
      }
    }
  }
}

function updateStockOnSale(
  db: Database.Database,
  items: NewInvoiceItem[],
  newStatus: 'draft' | 'posted',
  previousItems: InvoiceItem[] | undefined,
  previousStatus: 'draft' | 'posted' | undefined,
  encryptionKey: Buffer
) {
  if (previousItems && previousStatus === 'posted') {
    for (const item of previousItems) {
      const stock = db
        .prepare(`SELECT saleQty, saleRate FROM stock WHERE code = ?`)
        .get(item.code) as any;

      if (stock) {
        const newQty = stock.saleQty - item.qty;
        db.prepare(`UPDATE stock SET saleQty = @qty WHERE code = @code`).run({
          code: item.code,
          qty: newQty,
        });
      }
    }
  }

  if (newStatus === 'posted') {
    for (const item of items) {
      const stock = db
        .prepare(`SELECT saleQty, saleRate FROM stock WHERE code = ?`)
        .get(item.code) as any;

      if (stock) {
        db.prepare(
          `UPDATE stock
           SET saleQty = saleQty + @qty,
               saleRate = @rate,
               name = @name
           WHERE code = @code`
        ).run({
          code: item.code,
          qty: item.qty,
          rate: encryptNumber(item.rate, encryptionKey),
          name: item.name,
        });
      } else {
        db.prepare(
          `INSERT INTO stock (code, name, purchaseRate, purchaseQty, saleRate, saleQty, createdAt)
           VALUES (@code, @name, @purchaseRate, @purchaseQty, @saleRate, @saleQty, datetime('now'))`
        ).run({
          code: item.code,
          name: item.name,
          purchaseRate: encryptNumber(0, encryptionKey),
          purchaseQty: 0,
          saleRate: encryptNumber(item.rate, encryptionKey),
          saleQty: item.qty,
        });
      }
    }
  }
}

// ==================== SALE INVOICES ====================

export function listSaleInvoices(
  db: Database.Database,
  encryptionKey: Buffer,
  filters: {startDate?: string; endDate?: string} = {}
): SaleInvoice[] {
  // ✅ FIX: Use invoiceNumber column (matches schema)
  let sql = `
    SELECT id, invoiceNumber, invoiceDate, customerName, total, totalQty, status, createdAt, updatedAt
    FROM sale_invoices
  `;

  const conditions: string[] = [];
  const params: any[] = [];

  if (filters.startDate) {
    conditions.push(`invoiceDate >= ?`);
    params.push(filters.startDate);
  }
  if (filters.endDate) {
    conditions.push(`invoiceDate <= ?`);
    params.push(filters.endDate);
  }

  if (conditions.length > 0) {
    sql += ` WHERE ${conditions.join(' AND ')}`;
  }

  sql += ` ORDER BY createdAt DESC`;

  const rows = db.prepare(sql).all(...params) as any[];

  return rows.map((row) => ({
    id: row.id,
    number: row.invoiceNumber || '', // ✅ Map invoiceNumber to number
    invoiceDate: row.invoiceDate,
    customerName: decrypt(row.customerName, encryptionKey),
    total: decryptNumber(String(row.total), encryptionKey),
    totalQty: row.totalQty || 0,
    status: row.status || 'draft',
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

export function createSaleInvoice(
  input: NewSaleInvoice,
  db: Database.Database,
  encryptionKey: Buffer
) {
  const p = input;
  const enc = encryptionService.encryptFields(
    {
      customerName: p.customerName,
      address: p.address ?? '',
      contactNo: p.contactNo ?? '',
    },
    ENCRYPTED_SALE_INVOICE_FIELDS,
    encryptionKey
  );
  // ✅ FIX: Use invoiceNumber column
  const info = db
    .prepare(
      `INSERT INTO sale_invoices (invoiceNumber, customerName, total, createdAt, address, invoiceDate, contactNo, status)
       VALUES (@invoiceNumber, @customerName, @total, @createdAt, @address, @invoiceDate, @contactNo, @status)`
    )
    .run({
      invoiceNumber: p.number,
      customerName: enc.customerName,
      total: encryptNumber(p.total, encryptionKey),
      createdAt: new Date().toISOString(),
      address: enc.address || null,
      invoiceDate: p.invoiceDate ?? null,
      contactNo: enc.contactNo || null,
      status: 'draft',
    });
  const id = Number(info.lastInsertRowid);
  return getSaleInvoice(id, db, encryptionKey)!;
}

export function deleteSaleInvoice(
  id: number,
  db: Database.Database,
  _encryptionKey: Buffer
): void {
  db.prepare(`DELETE FROM sale_invoices WHERE id = ?`).run(id);
}

export function getSaleInvoice(
  id: number,
  db: Database.Database,
  encryptionKey: Buffer
): InvoiceWithItems | undefined {
  // ✅ FIX: Use invoiceNumber column
  const invoice = db
    .prepare(
      `SELECT id, invoiceNumber, customerName, total, createdAt, address, invoiceDate, contactNo, status
       FROM sale_invoices WHERE id = ?`
    )
    .get(id) as any;
  if (!invoice) return undefined;

  const decryptedInvoice = encryptionService.decryptFields(
    invoice,
    ENCRYPTED_SALE_INVOICE_FIELDS,
    encryptionKey
  );
  const itemsOut = db
    .prepare(
      `SELECT id, invoiceId, code, name, rate, qty, position
       FROM sale_invoice_items WHERE invoiceId = ? ORDER BY position ASC`
    )
    .all(id) as any[];
  const decryptedItems = itemsOut.map((item) => ({
    ...item,
    rate: decryptNumber(String(item.rate), encryptionKey),
  }));
  return {
    invoice: {
      ...decryptedInvoice,
      number: invoice.invoiceNumber || '', // ✅ Map invoiceNumber to number
      total: decryptNumber(String(invoice.total), encryptionKey),
      status: invoice.status || 'posted',
    } as any,
    items: decryptedItems as any,
  };
}

export function saveSaleInvoice(
  payload: {
    id?: number;
    number: string;
    customerName: string;
    total: number;
    address?: string;
    invoiceDate?: string;
    contactNo?: string;
    items: NewInvoiceItem[];
    status?: 'draft' | 'posted';
  },
  db: Database.Database,
  encryptionKey: Buffer
): InvoiceWithItems {
  const p = payload;
  const items = p.items;
  const newStatus = p.status || 'posted';

  let finalInvoiceDate = p.invoiceDate;
  if (newStatus === 'posted' && !finalInvoiceDate) {
    finalInvoiceDate = new Date().toISOString().split('T')[0];
  }

  let invoiceId = p.id;
  let previousItems: InvoiceItem[] | undefined;
  let previousStatus: 'draft' | 'posted' | undefined;

  const tx = db.transaction(() => {
    if (p.id) {
      const prevInvoice = db
        .prepare('SELECT status FROM sale_invoices WHERE id = ?')
        .get(p.id) as any;
      previousStatus = prevInvoice?.status || 'posted';

      const prevRaw = db
        .prepare(
          `SELECT id, invoiceId, code, name, rate, qty, position
           FROM sale_invoice_items WHERE invoiceId = ?`
        )
        .all(p.id) as any[];
      previousItems = prevRaw.map((item: any) => ({
        ...item,
        rate: decryptNumber(String(item.rate), encryptionKey),
      }));

      db.prepare(`DELETE FROM sale_invoice_items WHERE invoiceId = ?`).run(
        p.id
      );

      const enc = encryptionService.encryptFields(
        {
          customerName: p.customerName,
          address: p.address ?? '',
          contactNo: p.contactNo ?? '',
        },
        ENCRYPTED_SALE_INVOICE_FIELDS,
        encryptionKey
      );

      // ✅ FIX: Use invoiceNumber column
      db.prepare(
        `UPDATE sale_invoices
         SET invoiceNumber = @invoiceNumber, customerName = @customerName, total = @total,
             address = @address, invoiceDate = @invoiceDate, contactNo = @contactNo,
             status = @status
         WHERE id = @id`
      ).run({
        id: p.id,
        invoiceNumber: p.number,
        customerName: enc.customerName,
        total: encryptNumber(p.total, encryptionKey),
        address: enc.address || null,
        invoiceDate: finalInvoiceDate || null,
        contactNo: enc.contactNo || null,
        status: newStatus,
      });
    } else {
      const enc = encryptionService.encryptFields(
        {
          customerName: p.customerName,
          address: p.address ?? '',
          contactNo: p.contactNo ?? '',
        },
        ENCRYPTED_SALE_INVOICE_FIELDS,
        encryptionKey
      );
      // ✅ FIX: Use invoiceNumber column
      const info = db
        .prepare(
          `INSERT INTO sale_invoices (invoiceNumber, customerName, total, createdAt, address, invoiceDate, contactNo, status)
           VALUES (@invoiceNumber, @customerName, @total, @createdAt, @address, @invoiceDate, @contactNo, @status)`
        )
        .run({
          invoiceNumber: p.number,
          customerName: enc.customerName,
          total: encryptNumber(p.total, encryptionKey),
          createdAt: new Date().toISOString(),
          address: enc.address || null,
          invoiceDate: finalInvoiceDate || null,
          contactNo: enc.contactNo || null,
          status: newStatus,
        });
      invoiceId = Number(info.lastInsertRowid);
    }

    const insertItem = db.prepare(
      `INSERT INTO sale_invoice_items (invoiceId, code, name, rate, qty, position)
       VALUES (@invoiceId, @code, @name, @rate, @qty, @position)`
    );
    for (const it of items) {
      insertItem.run({
        invoiceId,
        code: it.code,
        name: it.name,
        rate: encryptNumber(it.rate, encryptionKey),
        qty: it.qty,
        position: it.position,
      });
    }

    updateStockOnSale(
      db,
      items,
      newStatus,
      previousItems,
      previousStatus,
      encryptionKey
    );
  });

  tx();
  return getSaleInvoice(invoiceId!, db, encryptionKey)!;
}

// ==================== LEDGER ====================

export function ledgerSave(
  payload: LedgerSavePayload,
  db: Database.Database,
  encryptionKey: Buffer
): {
  id?: number;
  error?: string;
} {
  const {id, customerName, contactNo, totals, rows} = payload;

  const transaction = db.transaction(() => {
    let ledgerId = id;

    const encryptedCustomerName = encryptionService.encrypt(
      customerName,
      encryptionKey
    );
    const encryptedContactNo = contactNo
      ? encryptionService.encrypt(contactNo, encryptionKey)
      : '';

    if (ledgerId) {
      // ✅ FIX: Use ledgers table (consistent naming)
      db.prepare(
        `UPDATE ledgers SET
         customerName = @customerName,
         contactNo = @contactNo,
         totalDebit = @totalDebit,
         totalCredit = @totalCredit,
         netBalance = @netBalance
         WHERE id = @id`
      ).run({
        id: ledgerId,
        customerName: encryptedCustomerName,
        contactNo: encryptedContactNo,
        totalDebit: encryptNumber(totals.debit, encryptionKey),
        totalCredit: encryptNumber(totals.credit, encryptionKey),
        netBalance: encryptNumber(totals.net, encryptionKey),
      });

      db.prepare('DELETE FROM ledger_rows WHERE ledgerId = ?').run(ledgerId);
    } else {
      // ✅ FIX: Use ledgers table
      const info = db
        .prepare(
          `INSERT INTO ledgers (customerName, contactNo, totalDebit, totalCredit, netBalance, createdAt)
           VALUES (@customerName, @contactNo, @totalDebit, @totalCredit, @netBalance, datetime('now'))`
        )
        .run({
          customerName: encryptedCustomerName,
          contactNo: encryptedContactNo,
          totalDebit: encryptNumber(totals.debit, encryptionKey),
          totalCredit: encryptNumber(totals.credit, encryptionKey),
          netBalance: encryptNumber(totals.net, encryptionKey),
        });
      ledgerId = Number(info.lastInsertRowid);
    }

    const insertRow = db.prepare(
      `INSERT INTO ledger_rows (ledgerId, date, particulars, debit, credit, crDr, position)
       VALUES (@ledgerId, @date, @particulars, @debit, @credit, @crDr, @position)`
    );

    rows.forEach((row, index) => {
      const particulars = row.particulars?.trim()
        ? encryptionService.encrypt(row.particulars, encryptionKey)
        : '';

      insertRow.run({
        ledgerId,
        date: row.date,
        particulars,
        debit: encryptNumber(row.debit || 0, encryptionKey),
        credit: encryptNumber(row.credit || 0, encryptionKey),
        crDr: row.crDr,
        position: index,
      });
    });

    return ledgerId;
  });

  try {
    const newId = transaction();
    return {id: newId};
  } catch (error: any) {
    console.error('Ledger save failed:', error);
    return {error: error.message};
  }
}

export function getLedger(
  id: number,
  db: Database.Database,
  encryptionKey: Buffer
) {
  // ✅ FIX: Use ledgers table
  const ledger = db
    .prepare(
      `SELECT
        id,
        customerName,
        contactNo,
        totalDebit,
        totalCredit,
        netBalance
       FROM ledgers WHERE id = ?`
    )
    .get(id) as any;

  if (!ledger) return undefined;

  const decryptedLedger = encryptionService.decryptFields(
    ledger,
    ENCRYPTED_LEDGER_FIELDS,
    encryptionKey
  );

  const rows = db
    .prepare(
      `SELECT id, ledgerId, date, particulars, debit, credit, crDr, position
       FROM ledger_rows WHERE ledgerId = ? ORDER BY position ASC`
    )
    .all(id) as any[];

  const decryptedRows = rows.map((row) => {
    let particulars = row.particulars;
    if (encryptionService.isEncrypted(row.particulars)) {
      try {
        const val = encryptionService.decrypt(row.particulars, encryptionKey);
        if (val === row.particulars && row.particulars.includes(':')) {
          particulars = '';
        } else {
          particulars = val;
        }
      } catch {
        particulars = '';
      }
    }

    return {
      ...row,
      particulars,
      debit: decryptNumber(String(row.debit), encryptionKey),
      credit: decryptNumber(String(row.credit), encryptionKey),
    };
  });

  return {
    ledger: {
      ...decryptedLedger,
      totalDebit: decryptNumber(String(ledger.totalDebit), encryptionKey),
      totalCredit: decryptNumber(String(ledger.totalCredit), encryptionKey),
      netBalance: decryptNumber(String(ledger.netBalance), encryptionKey),
    },
    rows: decryptedRows,
  };
}

export function listLedgers(db: Database.Database, encryptionKey: Buffer) {
  // ✅ FIX: Use ledgers table
  const results = db
    .prepare(
      `SELECT
        id,
        customerName,
        totalDebit,
        totalCredit,
        netBalance
       FROM ledgers
       ORDER BY id DESC`
    )
    .all() as any[];

  return results.map((ledger) => {
    const decrypted = encryptionService.decryptFields(
      ledger,
      ['customerName'] as const,
      encryptionKey
    );
    return {
      ...decrypted,
      totals: {
        debit: decryptNumber(String(ledger.totalDebit), encryptionKey),
        credit: decryptNumber(String(ledger.totalCredit), encryptionKey),
        net: decryptNumber(String(ledger.netBalance), encryptionKey),
      },
    };
  });
}

export function deleteLedger(
  id: number,
  db: Database.Database,
  _encryptionKey: Buffer
): void {
  // ✅ FIX: Use ledgers table
  db.prepare(`DELETE FROM ledgers WHERE id = ?`).run(id);
}

// ==================== SCHEMA ====================

export function ensureSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoiceNumber TEXT,
      invoiceDate TEXT,
      supplierName TEXT,
      total TEXT DEFAULT '0',
      totalQty INTEGER DEFAULT 0,
      status TEXT DEFAULT 'draft',
      address TEXT,
      contactNo TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS invoice_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoiceId INTEGER,
      code TEXT,
      name TEXT,
      rate TEXT DEFAULT '0',
      qty INTEGER DEFAULT 0,
      position INTEGER DEFAULT 0,
      FOREIGN KEY (invoiceId) REFERENCES invoices(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sale_invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoiceNumber TEXT,
      invoiceDate TEXT,
      customerName TEXT,
      total TEXT DEFAULT '0',
      totalQty INTEGER DEFAULT 0,
      status TEXT DEFAULT 'draft',
      address TEXT,
      contactNo TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sale_invoice_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoiceId INTEGER,
      code TEXT,
      name TEXT,
      rate TEXT DEFAULT '0',
      qty INTEGER DEFAULT 0,
      position INTEGER DEFAULT 0,
      FOREIGN KEY (invoiceId) REFERENCES sale_invoices(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS stock (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE,
      name TEXT,
      purchaseRate TEXT DEFAULT '0',
      purchaseQty INTEGER DEFAULT 0,
      saleRate TEXT DEFAULT '0',
      saleQty INTEGER DEFAULT 0,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS stock_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      snapshotDate TEXT,
      code TEXT,
      name TEXT,
      purchaseRate TEXT DEFAULT '0',
      purchaseQty INTEGER DEFAULT 0,
      saleRate TEXT DEFAULT '0',
      saleQty INTEGER DEFAULT 0,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ledgers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customerName TEXT NOT NULL,
      contactNo TEXT,
      totalDebit TEXT DEFAULT '0',
      totalCredit TEXT DEFAULT '0',
      netBalance TEXT DEFAULT '0',
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ledger_rows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ledgerId INTEGER,
      date TEXT,
      particulars TEXT,
      debit TEXT DEFAULT '0',
      credit TEXT DEFAULT '0',
      crDr TEXT DEFAULT 'DR',
      position INTEGER DEFAULT 0,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (ledgerId) REFERENCES ledgers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  runMigrations(db);
}

function runMigrations(db: Database.Database) {
  const getColumns = (table: string): string[] => {
    try {
      const cols = db.prepare(`PRAGMA table_info(${table})`).all() as any[];
      return cols.map((c) => c.name);
    } catch {
      return [];
    }
  };

  const tableExists = (table: string): boolean => {
    try {
      const result = db
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
        .get(table);
      return !!result;
    } catch {
      return false;
    }
  };

  // Migration: Add status column to invoices
  const invoiceCols = getColumns('invoices');
  if (invoiceCols.length > 0 && !invoiceCols.includes('status')) {
    db.exec(`ALTER TABLE invoices ADD COLUMN status TEXT DEFAULT 'draft'`);
  }

  // Migration: Add status column to sale_invoices
  const saleInvoiceCols = getColumns('sale_invoices');
  if (saleInvoiceCols.length > 0 && !saleInvoiceCols.includes('status')) {
    db.exec(`ALTER TABLE sale_invoices ADD COLUMN status TEXT DEFAULT 'draft'`);
  }

  // Migration: Add totalQty to invoices
  if (invoiceCols.length > 0 && !invoiceCols.includes('totalQty')) {
    db.exec(`ALTER TABLE invoices ADD COLUMN totalQty INTEGER DEFAULT 0`);
  }

  // Migration: Add totalQty to sale_invoices
  if (saleInvoiceCols.length > 0 && !saleInvoiceCols.includes('totalQty')) {
    db.exec(`ALTER TABLE sale_invoices ADD COLUMN totalQty INTEGER DEFAULT 0`);
  }

  // Migration: Rename ledger to ledgers if needed
  if (!tableExists('ledgers') && tableExists('ledger')) {
    db.exec(`ALTER TABLE ledger RENAME TO ledgers`);
  }

  // Migration: Add columns to ledgers
  const ledgerCols = getColumns('ledgers');
  if (ledgerCols.length > 0) {
    if (!ledgerCols.includes('totalDebit')) {
      db.exec(`ALTER TABLE ledgers ADD COLUMN totalDebit TEXT DEFAULT '0'`);
    }
    if (!ledgerCols.includes('totalCredit')) {
      db.exec(`ALTER TABLE ledgers ADD COLUMN totalCredit TEXT DEFAULT '0'`);
    }
    if (!ledgerCols.includes('netBalance')) {
      db.exec(`ALTER TABLE ledgers ADD COLUMN netBalance TEXT DEFAULT '0'`);
    }
  }

  // Migration: Rename ledger_entries to ledger_rows if needed
  if (!tableExists('ledger_rows') && tableExists('ledger_entries')) {
    db.exec(`ALTER TABLE ledger_entries RENAME TO ledger_rows`);
  }
}

// ==================== META ====================

export function setMeta(
  db: Database.Database,
  key: string,
  value: string
): void {
  try {
    db.prepare(
      `INSERT INTO meta (key, value) VALUES (@key, @value)
       ON CONFLICT(key) DO UPDATE SET value=excluded.value`
    ).run({key, value});
  } catch {
    // meta writes are non-critical
  }
}

export function getMeta(
  db: Database.Database,
  key: string
): string | undefined {
  try {
    const row = db.prepare(`SELECT value FROM meta WHERE key = ?`).get(key) as
      | {value?: string}
      | undefined;
    return row?.value;
  } catch {
    return undefined;
  }
}

// ==================== STOCK SNAPSHOTS ====================

export function createStockSnapshot(
  db: Database.Database,
  encryptionKey: Buffer
) {
  const snapshotDate = new Date().toISOString().slice(0, 7);

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM stock_snapshots WHERE snapshotDate = ?').run(
      snapshotDate
    );

    const currentStock = listStock(db, encryptionKey);

    const insert = db.prepare(`
      INSERT INTO stock_snapshots (snapshotDate, code, name, purchaseRate, purchaseQty, saleRate, saleQty)
      VALUES (@snapshotDate, @code, @name, @purchaseRate, @purchaseQty, @saleRate, @saleQty)
    `);

    for (const item of currentStock) {
      insert.run({
        snapshotDate,
        code: item.code,
        name: item.name,
        purchaseRate: encryptNumber(item.purchaseRate, encryptionKey),
        purchaseQty: item.purchaseQty,
        saleRate: encryptNumber(item.saleRate, encryptionKey),
        saleQty: item.saleQty,
      });
    }
  });

  tx();
  return snapshotDate;
}

export function listStockSnapshots(db: Database.Database) {
  const rows = db
    .prepare(
      'SELECT DISTINCT snapshotDate FROM stock_snapshots ORDER BY snapshotDate DESC'
    )
    .all() as any[];
  return rows.map((r) => r.snapshotDate);
}

export function getStockSnapshot(
  db: Database.Database,
  encryptionKey: Buffer,
  date: string
): StockItem[] {
  const rows = db
    .prepare(
      'SELECT * FROM stock_snapshots WHERE snapshotDate = ? ORDER BY code ASC'
    )
    .all(date) as any[];

  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    purchaseRate: decryptNumber(String(row.purchaseRate), encryptionKey),
    purchaseQty: row.purchaseQty,
    saleRate: decryptNumber(String(row.saleRate), encryptionKey),
    saleQty: row.saleQty,
    createdAt: row.createdAt,
  }));
}
