import {faker} from '@faker-js/faker';

/**
 * Generate demo data for testing
 * Creates sample invoices, stock items, and ledgers
 */
export async function generateDemoData() {
  try {
    // ✅ Get active profile - remove unused variable
    const openProfiles = await window.electron.profiles.getOpen();
    const activeProfileId = await window.electron.profiles.getActive();

    if (!activeProfileId) {
      alert('No active profile. Please create or open a profile first.');
      return;
    }

    console.log('🔵 Generating demo data for profile:', activeProfileId);

    // ✅ Verify profile is actually open
    if (!openProfiles.includes(activeProfileId)) {
      console.log('⚠️ Profile not in open list, opening...');
      await window.electron.profiles.open(activeProfileId);
      // Wait for profile to fully open
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    const confirm = window.confirm(
      'This will generate sample data including:\n' +
        '• 50 stock items\n' +
        '• 20 purchase invoices\n' +
        '• 20 sale invoices\n' +
        '• 10 ledger entries\n\n' +
        'Continue?'
    );

    if (!confirm) return;

    console.log('Creating stock items...');
    const stockItems = await createStockItems(activeProfileId, 50);

    console.log('Creating purchase invoices...');
    await createPurchaseInvoices(activeProfileId, stockItems, 20);

    console.log('Creating sale invoices...');
    await createSaleInvoices(activeProfileId, stockItems, 20);

    console.log('Creating ledger entries...');
    await createLedgerEntries(activeProfileId, 10);

    // ✅ Invalidate analytics cache after generating data
    window.dispatchEvent(new CustomEvent('analytics:invalidate'));

    alert('Demo data generated successfully!');
    console.log('✅ Demo data generation complete');

    // ✅ Reload the current page to show new data
    window.location.reload();
  } catch (error) {
    console.error('Error generating demo data:', error);
    alert('Failed to generate demo data. Check console for details.');
  }
}

/**
 * Clear all data from the active profile
 */
export async function clearAllData() {
  try {
    const activeProfileId = await window.electron.profiles.getActive();

    if (!activeProfileId) {
      alert('No active profile.');
      return;
    }

    const confirm = window.confirm(
      '⚠️ WARNING ⚠️\n\n' +
        'This will DELETE ALL DATA including:\n' +
        '• All stock items\n' +
        '• All purchase invoices\n' +
        '• All sale invoices\n' +
        '• All ledger entries\n\n' +
        'This action CANNOT be undone!\n\n' +
        'Are you absolutely sure?'
    );

    if (!confirm) return;

    console.log('🗑️ Clearing all data...');

    // Get all data
    const [stock, purchases, sales, ledgers] = await Promise.all([
      window.api.stock.list(activeProfileId),
      window.api.invoices.list(activeProfileId),
      window.api.saleInvoices.list(activeProfileId),
      window.api.ledger.list(activeProfileId),
    ]);

    // Delete everything
    await Promise.all([
      ...stock.map((item) => window.api.stock.delete(activeProfileId, item.id)),
      ...purchases.map((inv) =>
        window.api.invoices.delete(activeProfileId, inv.id)
      ),
      ...sales.map((inv) =>
        window.api.saleInvoices.delete(activeProfileId, inv.id)
      ),
      ...ledgers.map((ledger) =>
        window.api.ledger.delete(activeProfileId, ledger.id)
      ),
    ]);

    // ✅ Invalidate analytics cache
    window.dispatchEvent(new CustomEvent('analytics:invalidate'));

    alert('All data cleared successfully!');
    console.log('✅ Data clearing complete');

    // ✅ Reload the page
    window.location.reload();
  } catch (error) {
    console.error('Error clearing data:', error);
    alert('Failed to clear data. Check console for details.');
  }
}

// ===== Helper Functions =====

async function createStockItems(profileId: string, count: number) {
  const items = [];

  for (let i = 0; i < count; i++) {
    // ✅ Fixed: Use fractionDigits instead of precision
    const purchaseRate = faker.number.float({
      min: 100,
      max: 5000,
      fractionDigits: 2, // ✅ Changed from precision
    });
    const saleRate =
      purchaseRate * faker.number.float({min: 1.1, max: 1.5, fractionDigits: 2}); // ✅ Changed from precision
    const purchaseQty = faker.number.int({min: 10, max: 500});
    const saleQty = faker.number.int({
      min: 0,
      max: Math.floor(purchaseQty * 0.7),
    });

    const item = await window.api.stock.create(profileId, {
      code: `ITEM-${String(i + 1).padStart(4, '0')}`,
      name: faker.commerce.productName(),
      purchaseRate,
      purchaseQty,
      saleRate,
      saleQty,
    });

    items.push(item);
  }

  return items;
}

async function createPurchaseInvoices(
  profileId: string,
  stockItems: RendererStockItem[], // ✅ Add explicit type
  count: number
) {
  const suppliers = Array.from({length: 10}, () => ({
    name: faker.company.name(),
    contact: faker.phone.number(),
  }));

  for (let i = 0; i < count; i++) {
    const supplier = faker.helpers.arrayElement(suppliers);
    const invoiceDate = faker.date
      .recent({days: 90})
      .toISOString()
      .split('T')[0];
    const itemCount = faker.number.int({min: 1, max: 5});
    const selectedItems = faker.helpers.arrayElements(stockItems, itemCount);

    // ✅ Add explicit types
    const items = selectedItems.map((item: RendererStockItem, idx: number) => ({
      code: item.code,
      name: item.name,
      rate: item.purchaseRate,
      qty: faker.number.int({min: 5, max: 50}),
      position: idx,
    }));

    const total = items.reduce((sum: number, item) => sum + item.rate * item.qty, 0);

    // ✅ Fixed: Added missing 'number' field
    await window.api.invoices.create(profileId, {
      number: `PI-${String(i + 1).padStart(4, '0')}`, // ✅ Generate invoice number
      supplierName: supplier.name,
      contactNo: supplier.contact,
      invoiceDate,
      total,
      items,
    });
  }
}

async function createSaleInvoices(
  profileId: string,
  stockItems: RendererStockItem[], // ✅ Add explicit type
  count: number
) {
  const customers = Array.from({length: 15}, () => ({
    name: faker.person.fullName(),
    contact: faker.phone.number(),
  }));

  for (let i = 0; i < count; i++) {
    const customer = faker.helpers.arrayElement(customers);
    const invoiceDate = faker.date
      .recent({days: 60})
      .toISOString()
      .split('T')[0];
    const itemCount = faker.number.int({min: 1, max: 4});
    const selectedItems = faker.helpers.arrayElements(stockItems, itemCount);

    // ✅ Add explicit types
    const items = selectedItems.map((item: RendererStockItem, idx: number) => ({
      code: item.code,
      name: item.name,
      rate: item.saleRate,
      qty: faker.number.int({min: 1, max: 20}),
      position: idx,
    }));

    const total = items.reduce((sum: number, item) => sum + item.rate * item.qty, 0);

    // ✅ Fixed: Added missing 'number' field
    await window.api.saleInvoices.create(profileId, {
      number: `SI-${String(i + 1).padStart(4, '0')}`, // ✅ Generate invoice number
      customerName: customer.name,
      contactNo: customer.contact,
      invoiceDate,
      total,
      items,
    });
  }
}

async function createLedgerEntries(profileId: string, count: number) {
  const customers = Array.from({length: 10}, () => ({
    name: faker.person.fullName(),
    contact: faker.phone.number(),
  }));

  for (let i = 0; i < count; i++) {
    const customer = faker.helpers.arrayElement(customers);
    const rowCount = faker.number.int({min: 3, max: 8});

    const rows = Array.from({length: rowCount}, (_, idx) => {
      const isDebit = faker.datatype.boolean();
      // ✅ Fixed: Use fractionDigits instead of precision
      const amount = faker.number.float({
        min: 1000,
        max: 50000,
        fractionDigits: 2, // ✅ Changed from precision
      });

      return {
        date: faker.date.recent({days: 90}).toISOString().split('T')[0],
        particulars: faker.helpers.arrayElement([
          'Sale Invoice',
          'Payment Received',
          'Purchase Invoice',
          'Payment Made',
          'Opening Balance',
          'Adjustment',
        ]),
        debit: isDebit ? amount : 0,
        credit: isDebit ? 0 : amount,
        crDr: (isDebit ? 'DR' : 'CR') as 'CR' | 'DR',
        position: idx,
      };
    });

    const debitTotal = rows.reduce((sum, row) => sum + row.debit, 0);
    const creditTotal = rows.reduce((sum, row) => sum + row.credit, 0);
    const net = debitTotal - creditTotal;

    await window.api.ledger.save(profileId, {
      customerName: customer.name,
      contactNo: customer.contact,
      totals: {
        debit: debitTotal,
        credit: creditTotal,
        net,
      },
      rows,
    });
  }
}
