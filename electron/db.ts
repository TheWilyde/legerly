import Database from 'better-sqlite3';
import {randomUUID} from 'node:crypto';
import {AppError, ErrorCodes} from './errors';
import log from './logger';
import {normalizeCode} from './utils';
import {encryptionService} from './encryption';

// ✅ Define encrypted fields
const ENCRYPTED_INVOICE_FIELDS = ['supplierName', 'address'] as const;
const ENCRYPTED_LEDGER_FIELDS = ['customerName', 'contactNo'] as const;

export type NewInvoice = {
  supplierName: string;
  total: number;
  number: string;
  address?: string;
  invoiceDate?: string;
};

export type Invoice = {
  id: number;
  number: string;
  supplierName: string;
  total: number;
  createdAt: string;
  address?: string;
  invoiceDate?: string;
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

// ✅ REMOVED: Global db variable (now managed by ProfileManager)
// let db: Database.Database;

// ✅ REMOVED: initDatabase() - now handled by ProfileManager

// ✅ REMOVED: _db() helper - replaced with explicit db parameter

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
  encryptionKey: Buffer
): (Invoice & {totalQty: number})[] {
  const results = db
    .prepare(
      `SELECT
        i.id, i.number, i.supplierName, i.address, i.invoiceDate, i.total, i.createdAt,
        COALESCE(SUM(ii.qty), 0) AS totalQty
      FROM invoices i
      LEFT JOIN invoice_items ii ON ii.invoiceId = i.id
      GROUP BY i.id
      ORDER BY i.id DESC`
    )
    .all() as any[];

  return results.map((invoice) => {
    const decrypted = encryptionService.decryptFields(
      invoice,
      ENCRYPTED_INVOICE_FIELDS,
      encryptionKey
    );
    return {
      ...decrypted,
      total: decryptNumber(invoice.total, encryptionKey),
    };
  });
}

export function createInvoice(
  input: NewInvoice,
  db: Database.Database,
  encryptionKey: Buffer
) {
  const createdAt = new Date().toISOString();
  const uid = `PI-${randomUUID()}`;

  const encrypted = encryptionService.encryptFields(
    input,
    ENCRYPTED_INVOICE_FIELDS,
    encryptionKey
  );

  const stmt = db.prepare(
    `INSERT INTO invoices (uid, number, supplierName, total, createdAt, address, invoiceDate)
     VALUES (@uid, @number, @supplierName, @total, @createdAt, @address, @invoiceDate)`
  );
  const info = stmt.run({
    uid,
    number: input.number,
    supplierName: encrypted.supplierName,
    total: encryptNumber(input.total, encryptionKey),
    createdAt,
    address: encrypted.address ?? '',
    invoiceDate: input.invoiceDate ?? null,
  });

  return {
    id: Number(info.lastInsertRowid),
    number: input.number,
    supplierName: input.supplierName,
    total: input.total,
    createdAt,
    address: input.address ?? '',
    invoiceDate: input.invoiceDate ?? null,
  } as const;
}

export function deleteInvoice(
  id: number,
  db: Database.Database,
  _encryptionKey: Buffer // ✅ Add underscore prefix
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
      `SELECT id, number, supplierName, total, createdAt, address, invoiceDate FROM invoices WHERE id = ?`
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
    items: NewInvoiceItem[];
  },
  db: Database.Database,
  encryptionKey: Buffer
): InvoiceWithItems {
  const encrypted = encryptionService.encryptFields(
    payload,
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
          `INSERT INTO invoices (uid, number, supplierName, total, createdAt, address, invoiceDate)
           VALUES (@uid, @number, @supplierName, @total, @createdAt, @address, @invoiceDate)`
        )
        .run({
          uid,
          number: p.number,
          supplierName: encrypted.supplierName,
          total: encryptNumber(p.total, encryptionKey),
          createdAt,
          address: encrypted.address ?? '',
          invoiceDate: p.invoiceDate ?? null,
        });
      invoiceId = Number(info.lastInsertRowid);
    } else {
      db.prepare(
        `UPDATE invoices
         SET number=@number, supplierName=@supplierName, total=@total, address=@address, invoiceDate=@invoiceDate
         WHERE id=@id`
      ).run({
        id: p.id,
        number: p.number,
        supplierName: encrypted.supplierName,
        total: encryptNumber(p.total, encryptionKey),
        address: encrypted.address ?? '',
        invoiceDate: p.invoiceDate ?? null,
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
        `SELECT id, number, supplierName, total, createdAt, address, invoiceDate FROM invoices WHERE id = ?`
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
  encryptionKey: Buffer
): (Invoice & {totalQty: number})[] {
  const results = db
    .prepare(
      `SELECT
        i.id, i.number, i.supplierName, i.address, i.invoiceDate, i.total, i.createdAt,
        COALESCE(SUM(ii.qty), 0) AS totalQty
      FROM sale_invoices i
      LEFT JOIN sale_invoice_items ii ON ii.invoiceId = i.id
      GROUP BY i.id
      ORDER BY i.id DESC`
    )
    .all() as any[];

  return results.map((invoice) => {
    const decrypted = encryptionService.decryptFields(
      invoice,
      ENCRYPTED_INVOICE_FIELDS,
      encryptionKey
    );
    return {
      ...decrypted,
      total: decryptNumber(invoice.total, encryptionKey),
    };
  });
}

export function createSaleInvoice(
  input: NewInvoice,
  db: Database.Database,
  encryptionKey: Buffer
) {
  const createdAt = new Date().toISOString();
  const uid = `SI-${randomUUID()}`;

  const encrypted = encryptionService.encryptFields(
    input,
    ENCRYPTED_INVOICE_FIELDS,
    encryptionKey
  );

  const stmt = db.prepare(
    `INSERT INTO sale_invoices (uid, number, supplierName, total, createdAt, address, invoiceDate)
     VALUES (@uid, @number, @supplierName, @total, @createdAt, @address, @invoiceDate)`
  );
  const info = stmt.run({
    uid,
    number: input.number,
    supplierName: encrypted.supplierName,
    total: encryptNumber(input.total, encryptionKey),
    createdAt,
    address: encrypted.address ?? '',
    invoiceDate: input.invoiceDate ?? null,
  });

  return {
    id: Number(info.lastInsertRowid),
    number: input.number,
    supplierName: input.supplierName,
    total: input.total,
    createdAt,
    address: input.address ?? '',
    invoiceDate: input.invoiceDate ?? null,
  } as const;
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
  const inv = db
    .prepare(
      `SELECT id, number, supplierName, total, createdAt, address, invoiceDate FROM sale_invoices WHERE id = ?`
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
      `SELECT id, invoiceId, code, name, rate, qty, position
       FROM sale_invoice_items WHERE invoiceId = ? ORDER BY position ASC`
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

export function saveSaleInvoice(
  payload: {
    id?: number;
    number: string;
    supplierName: string;
    total: number;
    address?: string;
    invoiceDate?: string;
    items: NewInvoiceItem[];
  },
  db: Database.Database,
  encryptionKey: Buffer
): InvoiceWithItems {
  const encrypted = encryptionService.encryptFields(
    payload,
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
          `SELECT id, invoiceId, code, name, rate, qty, position FROM sale_invoice_items WHERE invoiceId = ?`
        )
        .all(p.id) as any[];
      previousItems = prevRaw.map((item: any) => ({
        ...item,
        rate: decryptNumber(item.rate, encryptionKey),
      }));
    }

    if (!p.id) {
      const uid = `SI-${randomUUID()}`;
      const info = db
        .prepare(
          `INSERT INTO sale_invoices (uid, number, supplierName, total, createdAt, address, invoiceDate)
           VALUES (@uid, @number, @supplierName, @total, @createdAt, @address, @invoiceDate)`
        )
        .run({
          uid,
          number: p.number,
          supplierName: encrypted.supplierName,
          total: encryptNumber(p.total, encryptionKey),
          createdAt,
          address: encrypted.address ?? '',
          invoiceDate: p.invoiceDate ?? null,
        });
      invoiceId = Number(info.lastInsertRowid);
    } else {
      db.prepare(
        `UPDATE sale_invoices
         SET number=@number, supplierName=@supplierName, total=@total, address=@address, invoiceDate=@invoiceDate
         WHERE id=@id`
      ).run({
        id: p.id,
        number: p.number,
        supplierName: encrypted.supplierName,
        total: encryptNumber(p.total, encryptionKey),
        address: encrypted.address ?? '',
        invoiceDate: p.invoiceDate ?? null,
      });
      db.prepare(`DELETE FROM sale_invoice_items WHERE invoiceId = ?`).run(
        p.id
      );
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

    const invoice = db
      .prepare(
        `SELECT id, number, supplierName, total, createdAt, address, invoiceDate FROM sale_invoices WHERE id = ?`
      )
      .get(invoiceId) as any;

    const decryptedInvoice = encryptionService.decryptFields(
      invoice,
      ENCRYPTED_INVOICE_FIELDS,
      encryptionKey
    );

    const itemsOut = db
      .prepare(
        `SELECT id, invoiceId, code, name, rate, qty, position FROM sale_invoice_items WHERE invoiceId = ? ORDER BY position ASC`
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

// ==================== LEDGER ====================

export function ledgerSave(
  payload: LedgerSavePayload,
  db: Database.Database,
  encryptionKey: Buffer
): {
  id?: number;
  error?: string;
} {
  const customerName = String(payload.customerName || '').trim();
  const contactNo = String(payload.contactNo || '').trim();

  if (!customerName) {
    return {error: 'Customer name is required'};
  }

  const encrypted = encryptionService.encryptFields(
    {customerName, contactNo},
    ENCRYPTED_LEDGER_FIELDS,
    encryptionKey
  );

  const tx = db.transaction(() => {
    let ledgerId = payload.id ?? 0;

    if (!payload.id) {
      const info = db
        .prepare(
          `INSERT INTO ledgers (customerName, contactNo, totalDebit, totalCredit, netBalance)
           VALUES (@customerName, @contactNo, @totalDebit, @totalCredit, @netBalance)`
        )
        .run({
          customerName: encrypted.customerName,
          contactNo: encrypted.contactNo,
          totalDebit: encryptNumber(+payload.totals.debit || 0, encryptionKey),
          totalCredit: encryptNumber(
            +payload.totals.credit || 0,
            encryptionKey
          ),
          netBalance: encryptNumber(+payload.totals.net || 0, encryptionKey),
        });
      ledgerId = Number(info.lastInsertRowid);
    } else {
      db.prepare(
        `UPDATE ledgers
         SET customerName=@customerName, contactNo=@contactNo,
             totalDebit=@totalDebit, totalCredit=@totalCredit, netBalance=@netBalance
         WHERE id=@id`
      ).run({
        id: payload.id,
        customerName: encrypted.customerName,
        contactNo: encrypted.contactNo,
        totalDebit: encryptNumber(+payload.totals.debit || 0, encryptionKey),
        totalCredit: encryptNumber(+payload.totals.credit || 0, encryptionKey),
        netBalance: encryptNumber(+payload.totals.net || 0, encryptionKey),
      });
      db.prepare(`DELETE FROM ledger_rows WHERE ledgerId = ?`).run(payload.id);
    }

    const insertRow = db.prepare(
      `INSERT INTO ledger_rows (ledgerId, date, particulars, debit, credit, crDr, position)
       VALUES (@ledgerId, @date, @particulars, @debit, @credit, @crDr, @position)`
    );
    for (const row of payload.rows) {
      const encryptedParticulars = encryptionService.encrypt(
        String(row.particulars || '').trim(),
        encryptionKey
      );

      insertRow.run({
        ledgerId,
        date: row.date,
        particulars: encryptedParticulars,
        debit: encryptNumber(+row.debit || 0, encryptionKey),
        credit: encryptNumber(+row.credit || 0, encryptionKey),
        crDr: row.crDr === 'DR' ? 'DR' : 'CR',
        position: +row.position || 0,
      });
    }

    return {id: ledgerId};
  });

  return tx();
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

  const decryptedRows = rows.map((row) => ({
    ...row,
    particulars: encryptionService.isEncrypted(row.particulars)
      ? encryptionService.decrypt(row.particulars, encryptionKey)
      : row.particulars,
    debit: decryptNumber(row.debit, encryptionKey),
    credit: decryptNumber(row.credit, encryptionKey),
  }));

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
      invoiceDate TEXT
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
}

export function getMeta(
  db: Database.Database,
  key: string
): string | undefined {
  try {
    const row: any = db.prepare('SELECT value FROM meta WHERE key=?').get(key);
    return row?.value;
  } catch {
    return undefined;
  }
}
