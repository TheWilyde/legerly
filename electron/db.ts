import Database from 'better-sqlite3';
import {randomUUID} from 'node:crypto';
import {AppError, ErrorCodes} from './errors';
import log from './logger';
import {normalizeCode} from './utils';
import {encryptionService} from './encryption';

// Fields to encrypt
// FIX: Added 'as const' to fix type error
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
  contactNo?: string; // FIX: Added contactNo to type definition
};

// For sale_invoices (uses customerName)
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
  contactNo?: string; // FIX: Added contactNo to type definition
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

// ✅ Encryption helpers (updated to accept explicit key)
function encryptNumber(value: number, key?: Buffer): string {
  return encryptionService.encrypt(String(value), key);
}

function decryptNumber(encrypted: string, key?: Buffer): number {
  if (!encryptionService.isEncrypted(encrypted)) {
    return Number(encrypted);
  }
  return Number(encryptionService.decrypt(encrypted, key));
}

// ==================== INVOICES ====================

export function listInvoices(
  db: Database.Database,
  encryptionKey: Buffer,
  filters: {startDate?: string; endDate?: string} = {}
) {
  // FIX: Added WHERE clause for date filtering
  let query = `SELECT id, number, total, createdAt, invoiceDate, supplierName, contactNo, address FROM invoices`;
  const params: any[] = [];

  if (filters.startDate && filters.endDate) {
    query += ` WHERE invoiceDate BETWEEN ? AND ?`;
    params.push(filters.startDate, filters.endDate);
  }

  query += ` ORDER BY invoiceDate DESC, createdAt DESC`;

  const rows = db.prepare(query).all(...params) as any[];

  return rows.map((row) => {
    const decrypted = encryptionService.decryptFields(
      row,
      // FIX: Use the typed constant instead of inline array
      ENCRYPTED_INVOICE_FIELDS,
      encryptionKey
    );
    return {
      ...row,
      ...decrypted,
      total: decryptNumber(row.total, encryptionKey),
    };
  });
}

export function createInvoice(
  input: NewPurchaseInvoice,
  db: Database.Database,
  encryptionKey: Buffer
) {
  const createdAt = new Date().toISOString();
  const uid = `PI-${randomUUID()}`;

  const encrypted = encryptionService.encryptFields(
    {
      supplierName: input.supplierName,
      address: input.address,
      // FIX: Encrypt contactNo
      contactNo: input.contactNo,
    },
    ENCRYPTED_INVOICE_FIELDS,
    encryptionKey
  );

  const stmt = db.prepare(
    `INSERT INTO invoices (uid, number, supplierName, total, createdAt, address, invoiceDate, contactNo)
     VALUES (@uid, @number, @supplierName, @total, @createdAt, @address, @invoiceDate, @contactNo)`
  );
  const info = stmt.run({
    uid,
    number: input.number,
    supplierName: encrypted.supplierName,
    total: encryptNumber(input.total, encryptionKey),
    createdAt,
    address: encrypted.address ?? '',
    invoiceDate: input.invoiceDate ?? null,
    // FIX: Save contactNo
    contactNo: encrypted.contactNo ?? '',
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
  const inv = db
    .prepare(
      `SELECT id, number, supplierName, total, createdAt, address, invoiceDate, contactNo FROM invoices WHERE id = ?`
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
    rate: decryptNumber(item.rate, encryptionKey),
  }));

  return {
    invoice: {
      ...decrypted,
      total: decryptNumber(inv.total, encryptionKey),
    },
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
    contactNo?: string; // FIX: Added contactNo
    items: NewInvoiceItem[];
  },
  db: Database.Database,
  encryptionKey: Buffer
): InvoiceWithItems {
  const encrypted = encryptionService.encryptFields(
    {
      supplierName: payload.supplierName,
      address: payload.address,
      // FIX: Encrypt contactNo
      contactNo: payload.contactNo,
    },
    ENCRYPTED_INVOICE_FIELDS,
    encryptionKey
  );

  const items = (payload.items ?? []).map((it) => ({
    code: normalizeCode(it.code),
    name: String(it.name ?? '').trim(),
    rate: +it.rate || 0,
    qty: +it.qty || 0,
    position: +it.position || 0,
  }));

  const tx = db.transaction((p: typeof payload) => {
    let invoiceId = p.id ?? 0;
    const createdAt = new Date().toISOString();

    let previousItems: InvoiceItem[] | undefined;
    if (p.id) {
      const prevRaw = db
        .prepare(
          `SELECT id, invoiceId, code, name, rate, qty, position FROM invoice_items WHERE invoiceId = ?`
        )
        .all(p.id) as any[];
      previousItems = prevRaw.map((item: any) => ({
        ...item,
        rate: decryptNumber(item.rate, encryptionKey),
      }));
    }

    if (!p.id) {
      const uid = `PI-${randomUUID()}`;
      const info = db
        .prepare(
          `INSERT INTO invoices (uid, number, supplierName, total, createdAt, address, invoiceDate, contactNo)
           VALUES (@uid, @number, @supplierName, @total, @createdAt, @address, @invoiceDate, @contactNo)`
        )
        .run({
          uid,
          number: p.number,
          supplierName: encrypted.supplierName,
          total: encryptNumber(p.total, encryptionKey),
          createdAt,
          address: encrypted.address ?? '',
          invoiceDate: p.invoiceDate ?? null,
          // FIX: Save contactNo
          contactNo: encrypted.contactNo ?? '',
        });
      invoiceId = Number(info.lastInsertRowid);
    } else {
      db.prepare(
        `UPDATE invoices
         SET number=@number, supplierName=@supplierName, total=@total, address=@address, invoiceDate=@invoiceDate, contactNo=@contactNo
         WHERE id=@id`
      ).run({
        id: p.id,
        number: p.number,
        supplierName: encrypted.supplierName,
        total: encryptNumber(p.total, encryptionKey),
        address: encrypted.address ?? '',
        invoiceDate: p.invoiceDate ?? null,
        // FIX: Update contactNo
        contactNo: encrypted.contactNo ?? '',
      });
      db.prepare(`DELETE FROM invoice_items WHERE invoiceId = ?`).run(p.id);
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

    updateStockOnPurchase(db, items, !!p.id, previousItems, encryptionKey);

    const invoice = db
      .prepare(
        `SELECT id, number, supplierName, total, createdAt, address, invoiceDate, contactNo FROM invoices WHERE id = ?`
      )
      .get(invoiceId) as any;

    const decryptedInvoice = encryptionService.decryptFields(
      invoice,
      ENCRYPTED_INVOICE_FIELDS,
      encryptionKey
    );

    const itemsOut = db
      .prepare(
        `SELECT id, invoiceId, code, name, rate, qty, position FROM invoice_items WHERE invoiceId = ? ORDER BY position ASC`
      )
      .all(invoiceId) as any[];

    const decryptedItems = itemsOut.map((item) => ({
      ...item,
      rate: decryptNumber(item.rate, encryptionKey),
    }));

    return {
      invoice: {
        ...decryptedInvoice,
        total: decryptNumber(invoice.total, encryptionKey),
      },
      items: decryptedItems,
    };
  });

  return tx(payload);
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
    purchaseRate: decryptNumber(item.purchaseRate, encryptionKey),
    saleRate: decryptNumber(item.saleRate, encryptionKey),
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
      purchaseRate: decryptNumber(result.purchaseRate, encryptionKey),
      saleRate: decryptNumber(result.saleRate, encryptionKey),
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
      purchaseRate: decryptNumber(result.purchaseRate, encryptionKey),
      saleRate: decryptNumber(result.saleRate, encryptionKey),
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
  _encryptionKey: Buffer // ✅ Add underscore prefix
): void {
  db.prepare(`DELETE FROM stock WHERE id = ?`).run(id);
}

// ==================== STOCK UPDATE HELPERS ====================

function updateStockOnPurchase(
  db: Database.Database,
  items: NewInvoiceItem[],
  isEdit: boolean,
  previousItems: InvoiceItem[] | undefined,
  encryptionKey: Buffer
) {
  if (isEdit && previousItems) {
    for (const prevItem of previousItems) {
      const stock = db
        .prepare(`SELECT * FROM stock WHERE code = ?`)
        .get(prevItem.code) as any;

      if (stock) {
        db.prepare(
          `UPDATE stock
           SET purchaseQty = purchaseQty - @qty
           WHERE code = @code`
        ).run({
          code: prevItem.code,
          qty: prevItem.qty,
        });
      }
    }
  }

  for (const item of items) {
    const stock = db
      .prepare(`SELECT * FROM stock WHERE code = ?`)
      .get(item.code) as any;

    if (stock) {
      db.prepare(
        `UPDATE stock
         SET name = @name,
             purchaseQty = purchaseQty + @qty,
             purchaseRate = @rate
         WHERE code = @code`
      ).run({
        code: item.code,
        name: item.name,
        qty: item.qty,
        rate: encryptNumber(item.rate, encryptionKey),
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

function updateStockOnSale(
  db: Database.Database,
  items: NewInvoiceItem[],
  isEdit: boolean,
  previousItems: InvoiceItem[] | undefined,
  encryptionKey: Buffer
) {
  if (isEdit && previousItems) {
    for (const prevItem of previousItems) {
      const stock = db
        .prepare(`SELECT * FROM stock WHERE code = ?`)
        .get(prevItem.code) as any;

      if (stock) {
        db.prepare(
          `UPDATE stock
           SET saleQty = saleQty - @qty
           WHERE code = @code`
        ).run({
          code: prevItem.code,
          qty: prevItem.qty,
        });
      }
    }
  }

  for (const item of items) {
    const stock = db
      .prepare(`SELECT * FROM stock WHERE code = ?`)
      .get(item.code) as any;

    if (stock) {
      db.prepare(
        `UPDATE stock
         SET name = @name,
             saleQty = saleQty + @qty,
             saleRate = @rate
         WHERE code = @code`
      ).run({
        code: item.code,
        name: item.name,
        qty: item.qty,
        rate: encryptNumber(item.rate, encryptionKey),
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

// ==================== SALE INVOICES ====================

export function listSaleInvoices(
  db: Database.Database,
  encryptionKey: Buffer,
  filters: {startDate?: string; endDate?: string} = {}
) {
  // FIX: Added WHERE clause for date filtering
  let query = `SELECT id, number, total, createdAt, invoiceDate, customerName, contactNo, address FROM sale_invoices`;
  const params: any[] = [];

  if (filters.startDate && filters.endDate) {
    query += ` WHERE invoiceDate BETWEEN ? AND ?`;
    params.push(filters.startDate, filters.endDate);
  }

  query += ` ORDER BY invoiceDate DESC, createdAt DESC`;

  const rows = db.prepare(query).all(...params) as any[];

  return rows.map((row) => {
    const decrypted = encryptionService.decryptFields(
      row,
      ['customerName', 'contactNo', 'address'],
      encryptionKey
    );
    return {
      ...row,
      ...decrypted,
      total: decryptNumber(row.total, encryptionKey),
    };
  });
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
  const uid = `SI-${randomUUID()}`;
  const info = db
    .prepare(
      `INSERT INTO sale_invoices (uid, number, customerName, total, createdAt, address, invoiceDate, contactNo)
       VALUES (@uid, @number, @customerName, @total, @createdAt, @address, @invoiceDate, @contactNo)`
    )
    .run({
      uid,
      number: p.number,
      customerName: enc.customerName,
      total: encryptNumber(p.total, encryptionKey),
      createdAt: new Date().toISOString(),
      address: enc.address || null,
      invoiceDate: p.invoiceDate ?? null,
      contactNo: enc.contactNo || null,
    });
  const id = Number(info.lastInsertRowid);
  return getSaleInvoice(id, db, encryptionKey)!;
}

export function deleteSaleInvoice(
  id: number,
  db: Database.Database,
  _encryptionKey: Buffer // ✅ Add underscore prefix
): void {
  db.prepare(`DELETE FROM sale_invoices WHERE id = ?`).run(id);
}

export function getSaleInvoice(
  id: number,
  db: Database.Database,
  encryptionKey: Buffer
): InvoiceWithItems | undefined {
  const invoice = db
    .prepare(
      `SELECT id, number, customerName, total, createdAt, address, invoiceDate, contactNo
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
    rate: decryptNumber(item.rate, encryptionKey),
  }));
  return {
    invoice: {
      ...decryptedInvoice,
      total: decryptNumber(invoice.total, encryptionKey),
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
  },
  db: Database.Database,
  encryptionKey: Buffer
): InvoiceWithItems {
  const p = payload;
  const items = p.items;
  let invoiceId = p.id;
  let previousItems: InvoiceItem[] | undefined;
  if (p.id) {
    const prevRaw = db
      .prepare(
        `SELECT id, invoiceId, code, name, rate, qty, position
         FROM sale_invoice_items WHERE invoiceId = ?`
      )
      .all(p.id) as any[];
    previousItems = prevRaw.map((item: any) => ({
      ...item,
      rate: decryptNumber(item.rate, encryptionKey),
    }));
    const enc = encryptionService.encryptFields(
      {
        customerName: p.customerName,
        address: p.address ?? '',
        contactNo: p.contactNo ?? '',
      },
      ENCRYPTED_SALE_INVOICE_FIELDS,
      encryptionKey
    );
    db.prepare(
      `UPDATE sale_invoices
       SET number=@number,
           customerName=@customerName,
           total=@total,
           address=@address,
           invoiceDate=@invoiceDate,
           contactNo=@contactNo
       WHERE id=@id`
    ).run({
      id: p.id,
      number: p.number,
      customerName: enc.customerName,
      total: encryptNumber(p.total, encryptionKey),
      address: enc.address || null,
      invoiceDate: p.invoiceDate ?? null,
      contactNo: enc.contactNo || null,
    });
    db.prepare(`DELETE FROM sale_invoice_items WHERE invoiceId = ?`).run(p.id);
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
    const uid = `SI-${randomUUID()}`;
    const info = db
      .prepare(
        `INSERT INTO sale_invoices (uid, number, customerName, total, createdAt, address, invoiceDate, contactNo)
         VALUES (@uid, @number, @customerName, @total, @createdAt, @address, @invoiceDate, @contactNo)`
      )
      .run({
        uid,
        number: p.number,
        customerName: enc.customerName,
        total: encryptNumber(p.total, encryptionKey),
        createdAt: new Date().toISOString(),
        address: enc.address || null,
        invoiceDate: p.invoiceDate ?? null,
        contactNo: enc.contactNo || null,
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
  updateStockOnSale(db, items, !!p.id, previousItems, encryptionKey);

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

    // Encrypt main fields
    const encryptedLedger = encryptionService.encryptFields(
      {
        customerName,
        contactNo,
        totalDebit: totals.debit,
        totalCredit: totals.credit,
        netBalance: totals.net,
      },
      ENCRYPTED_LEDGER_FIELDS,
      encryptionKey
    );

    if (ledgerId) {
      // Update existing
      db.prepare(
        `UPDATE ledgers SET
         customerName = @customerName,
         contactNo = @contactNo,
         totalDebit = @totalDebit,
         totalCredit = @totalCredit,
         netBalance = @netBalance
         WHERE id = @id`
      ).run({...encryptedLedger, id: ledgerId});

      // Delete existing rows to replace them
      db.prepare('DELETE FROM ledger_rows WHERE ledgerId = ?').run(ledgerId);
    } else {
      // Create new
      const info = db
        .prepare(
          `INSERT INTO ledgers (customerName, contactNo, totalDebit, totalCredit, netBalance, createdAt)
           VALUES (@customerName, @contactNo, @totalDebit, @totalCredit, @netBalance, datetime('now'))`
        )
        .run(encryptedLedger);
      ledgerId = Number(info.lastInsertRowid);
    }

    // Insert rows
    const insertRow = db.prepare(
      `INSERT INTO ledger_rows (ledgerId, date, particulars, debit, credit, crDr, position)
       VALUES (@ledgerId, @date, @particulars, @debit, @credit, @crDr, @position)`
    );

    rows.forEach((row, index) => {
      // FIX: Don't encrypt empty particulars to avoid "IV:" artifacts
      const particulars = row.particulars?.trim()
        ? encryptionService.encrypt(row.particulars, encryptionKey)
        : '';

      insertRow.run({
        ledgerId,
        date: row.date,
        particulars,
        // FIX: Convert numbers to string and use standard encrypt method
        debit: encryptionService.encrypt(String(row.debit || 0), encryptionKey),
        credit: encryptionService.encrypt(
          String(row.credit || 0),
          encryptionKey
        ),
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
    // FIX: Handle decryption of empty strings or malformed ciphertext
    if (encryptionService.isEncrypted(row.particulars)) {
      try {
        const val = encryptionService.decrypt(row.particulars, encryptionKey);
        // If decrypt returns the input (some libs do this on failure) or looks like raw IV, fallback
        if (val === row.particulars && row.particulars.includes(':')) {
          particulars = '';
        } else {
          particulars = val;
        }
      } catch (e) {
        // If decryption fails, assume it was an empty string that got corrupted/malformed
        particulars = '';
      }
    }

    return {
      ...row,
      particulars,
      debit: decryptNumber(row.debit, encryptionKey),
      credit: decryptNumber(row.credit, encryptionKey),
    };
  });

  return {
    ledger: {
      ...decryptedLedger,
      totalDebit: decryptNumber(ledger.totalDebit, encryptionKey),
      totalCredit: decryptNumber(ledger.totalCredit, encryptionKey),
      netBalance: decryptNumber(ledger.netBalance, encryptionKey),
    },
    rows: decryptedRows,
  };
}

export function listLedgers(db: Database.Database, encryptionKey: Buffer) {
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
      totalDebit: decryptNumber(ledger.totalDebit, encryptionKey),
      totalCredit: decryptNumber(ledger.totalCredit, encryptionKey),
      netBalance: decryptNumber(ledger.netBalance, encryptionKey),
    };
  });
}

export function deleteLedger(
  id: number,
  db: Database.Database,
  _encryptionKey: Buffer // ✅ Add underscore prefix
): void {
  db.prepare(`DELETE FROM ledgers WHERE id = ?`).run(id);
}

// ==================== SCHEMA ====================

export function ensureSchema(db: Database.Database) {
  // ==================== INVOICES (PURCHASES) ====================
  db.exec(`
    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uid TEXT NOT NULL UNIQUE,
      number TEXT NOT NULL,
      supplierName TEXT NOT NULL,
      total TEXT NOT NULL,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      address TEXT,
      invoiceDate TEXT,
      contactNo TEXT
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS invoice_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoiceId INTEGER NOT NULL,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      rate TEXT NOT NULL,
      qty INTEGER NOT NULL,
      position INTEGER NOT NULL,
      FOREIGN KEY(invoiceId) REFERENCES invoices(id) ON DELETE CASCADE
    )
  `);

  // ==================== SALE INVOICES ====================
  // ✅ Fixed: Use customerName instead of supplierName for sale invoices
  db.exec(`
    CREATE TABLE IF NOT EXISTS sale_invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uid TEXT NOT NULL UNIQUE,
      number TEXT NOT NULL,
      customerName TEXT NOT NULL,
      total TEXT NOT NULL,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      address TEXT,
      invoiceDate TEXT,
      contactNo TEXT
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS sale_invoice_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoiceId INTEGER NOT NULL,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      rate TEXT NOT NULL,
      qty INTEGER NOT NULL,
      position INTEGER NOT NULL,
      FOREIGN KEY(invoiceId) REFERENCES sale_invoices(id) ON DELETE CASCADE
    )
  `);

  // ==================== STOCK ====================
  db.exec(`
    CREATE TABLE IF NOT EXISTS stock (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      purchaseRate TEXT NOT NULL,
      purchaseQty REAL NOT NULL,
      saleRate TEXT NOT NULL,
      saleQty REAL NOT NULL,
      createdAt TEXT NOT NULL
    )
  `);

  // ==================== LEDGER ====================
  db.exec(`
    CREATE TABLE IF NOT EXISTS ledgers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customerName TEXT NOT NULL,
      contactNo TEXT DEFAULT '',
      totalDebit TEXT NOT NULL,
      totalCredit TEXT NOT NULL,
      netBalance TEXT NOT NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS ledger_rows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ledgerId INTEGER NOT NULL,
      date TEXT NOT NULL,
      particulars TEXT NOT NULL,
      debit TEXT NOT NULL,
      credit TEXT NOT NULL,
      crDr TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY(ledgerId) REFERENCES ledgers(id) ON DELETE CASCADE
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_invoice_items_invoiceId ON invoice_items(invoiceId);
    CREATE INDEX IF NOT EXISTS idx_sale_invoice_items_invoiceId ON sale_invoice_items(invoiceId);
    CREATE INDEX IF NOT EXISTS idx_stock_code ON stock(code);
    CREATE INDEX IF NOT EXISTS idx_ledger_rows_ledgerId ON ledger_rows(ledgerId);
  `);

  const getMeta = (k: string) => {
    try {
      const row: any = db.prepare('SELECT value FROM meta WHERE key=?').get(k);
      return row?.value;
    } catch {
      return null;
    }
  };

  const schemaVersion = getMeta('schema_version');
  if (!schemaVersion) {
    log.info('Creating initial schema...');
    db.exec(`
      INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', '1')
    `);
  }

  // ============================================================
  // FIX: MIGRATIONS (Add missing columns for existing databases)
  // ============================================================
  try {
    db.prepare('ALTER TABLE invoices ADD COLUMN contactNo TEXT').run();
  } catch (e) {
    // Ignore if column already exists
  }

  try {
    db.prepare('ALTER TABLE sale_invoices ADD COLUMN contactNo TEXT').run();
  } catch (e) {
    // Ignore if column already exists
  }

  // FIX: Add table for Stock Snapshots
  db.exec(`
    CREATE TABLE IF NOT EXISTS stock_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      snapshotDate TEXT NOT NULL,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      purchaseRate TEXT NOT NULL,
      purchaseQty REAL NOT NULL,
      saleRate TEXT NOT NULL,
      saleQty REAL NOT NULL,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
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
  // Use YYYY-MM format for the snapshot key
  const snapshotDate = new Date().toISOString().slice(0, 7);

  const tx = db.transaction(() => {
    // Remove existing snapshot for this month (allow re-closing)
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
        // FIX: Use local encryptNumber helper, not encryptionService method
        purchaseRate: encryptNumber(item.purchaseRate, encryptionKey),
        purchaseQty: item.purchaseQty,
        // FIX: Use local encryptNumber helper
        saleRate: encryptNumber(item.saleRate, encryptionKey),
        saleQty: item.saleQty,
      });
    }
  });

  tx();
  return snapshotDate;
}

export function listStockSnapshots(db: Database.Database) {
  // Returns list of months like ['2025-11', '2025-10']
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
    purchaseRate: decryptNumber(row.purchaseRate, encryptionKey),
    purchaseQty: row.purchaseQty,
    saleRate: decryptNumber(row.saleRate, encryptionKey),
    saleQty: row.saleQty,
    createdAt: row.createdAt,
  }));
}
