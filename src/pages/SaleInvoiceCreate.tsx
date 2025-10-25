import {useState, useEffect, useMemo} from 'react';
import {useNavigate, useSearchParams} from 'react-router-dom';
import {FiSave, FiTrash2} from 'react-icons/fi';
import type React from 'react';
import InvoiceHeaderForm from '../components/features/invoice/InvoiceHeaderForm'; // ✅ Updated
import ItemsEditor from '../components/features/invoice/ItemsEditor'; // ✅ Updated
import InvoiceTotalsRow from '../components/features/invoice/InvoiceTotalsRow'; // ✅ Updated
import PageHeader from '../components/common/PageHeader';
import {clearAnalyticsCache} from '../components/hooks/useAnalytics';

export default function SaleInvoiceCreate() {
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const editingId = search.get('id') ? Number(search.get('id')) : undefined;

  const [supplierName, setSupplierName] = useState('');
  const [address, setAddress] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');

  const [stockByCode, setStockByCode] = useState<
    Map<string, {name: string; purchaseRate: number; saleRate: number}>
  >(new Map());
  const allCodes = useMemo(
    () => Array.from(stockByCode.keys()).sort(),
    [stockByCode]
  );

  type Item = {
    id: number;
    code: string;
    name: string;
    rate: number;
    qty: number;
  };
  const [items, setItems] = useState<Item[]>([]);
  // ✅ Add 'name' field to InputRow type
  type InputRow = {
    id: number;
    code: string;
    name: string;
    rate: string;
    qty: string;
  };
  const [inputRows, setInputRows] = useState<InputRow[]>([
    {id: -1, code: '', name: '', rate: '', qty: ''}, // ✅ Include name field
  ]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const computedTotal = useMemo(
    () => items.reduce((sum, it) => sum + it.rate * it.qty, 0),
    [items]
  );

  // ✅ Add totalQty calculation
  const totalQty = useMemo(
    () => items.reduce((sum, it) => sum + it.qty, 0),
    [items]
  );

  useEffect(() => {
    (async () => {
      const stock = await window.api?.stock.list();
      if (stock) {
        const map = new Map<
          string,
          {name: string; purchaseRate: number; saleRate: number}
        >();
        // Map saleRate into purchaseRate so the editor auto-fills sale price
        for (const s of stock)
          map.set(s.code, {
            name: s.name,
            purchaseRate: (s as any).saleRate ?? s.purchaseRate ?? 0,
            saleRate: (s as any).saleRate ?? 0,
          });
        setStockByCode(map);
      }
      if (editingId) {
        const data = await window.api?.sales.get(editingId);
        if (data) {
          setSupplierName(data.invoice.supplierName);
          setInvoiceNumber(data.invoice.number);
          setAddress(data.invoice.address ?? '');
          setInvoiceDate(data.invoice.invoiceDate ?? '');
          setItems(
            data.items.map((it) => ({
              id: it.id,
              code: it.code,
              name: it.name,
              rate: it.rate,
              qty: it.qty,
            }))
          );
        }
      } else {
        const list = await window.api?.sales.list();
        if (!invoiceNumber) setInvoiceNumber(String((list?.length ?? 0) + 1));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId, invoiceNumber]);

  function handleDeleteSelected() {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    setItems((prev) => prev.filter((i) => !ids.includes(i.id)));
    setInputRows((prev) =>
      prev.filter((r) => !ids.includes(r.id)).length === 0
        ? [{id: -Date.now(), code: '', name: '', rate: '', qty: ''}] // ✅ Include name field
        : prev.filter((r) => !ids.includes(r.id))
    );
    setSelectedIds(new Set());
  }

  function preventEnterSubmit(e: React.KeyboardEvent<HTMLFormElement>) {
    if (e.key === 'Enter') e.preventDefault();
  }

  function validate(): string[] {
    const errs: string[] = [];
    if (!supplierName.trim()) errs.push('Customer name is required.');
    if (!invoiceNumber.trim()) errs.push('Invoice number is required.');
    if (items.length === 0) errs.push('At least one item is required.');
    items.forEach((it, i) => {
      if (!it.code.trim()) errs.push(`Item ${i + 1}: code required.`);
      if (!it.name.trim()) errs.push(`Item ${i + 1}: name required.`);
      if (!(it.rate > 0)) errs.push(`Item ${i + 1}: rate must be > 0.`);
      if (!(it.qty > 0)) errs.push(`Item ${i + 1}: qty must be > 0.`);
    });
    return errs;
  }

  async function hasDuplicateInvoiceNumber(num: string) {
    const list = await window.api?.sales.list();
    if (!list) return false;
    return list.some((inv) => inv.number === num && inv.id !== editingId);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setErrors([]);
    const number = (invoiceNumber || '').trim();
    const errs = validate();
    try {
      if (await hasDuplicateInvoiceNumber(number)) {
        errs.push('Invoice number already exists.');
      }
    } catch {
      errs.push('Failed to verify invoice number uniqueness.');
    }
    if (errs.length) {
      setErrors(errs);
      return;
    }

    const payload = {
      id: editingId,
      number,
      supplierName: supplierName.trim(),
      total: computedTotal,
      address: address.trim(),
      invoiceDate,
      items: items.map((it, idx) => ({
        code: it.code.trim(),
        name: it.name.trim(),
        rate: it.rate,
        qty: it.qty,
        position: idx,
      })),
    };

    setSaving(true);
    try {
      await window.api?.sales.save(payload);

      // Clear analytics cache after successful save
      clearAnalyticsCache();

      navigate('/sale-invoice');
    } catch (err) {
      console.error(err);
      setErrors(['Failed to save invoice.']);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader title={editingId ? 'Edit Sale Invoice' : 'New Sale Invoice'}>
        {selectedIds.size > 0 && (
          <button
            type="button"
            onClick={handleDeleteSelected}
            className="inline-flex items-center gap-2 h-9 px-3 rounded-md border border-red-200 text-red-700 hover:bg-red-50"
            title="Delete selected">
            <FiTrash2 className="size-4" />
            <span>Delete</span>
          </button>
        )}

        <button
          form="sale-invoice-form"
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 h-9 px-3 rounded-md bg-neutral-900 text-white hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed">
          <FiSave className="size-4" />
          <span>{saving ? 'Saving…' : 'Save Invoice'}</span>
        </button>

        <button
          type="button"
          onClick={() => navigate('/sale-invoice')}
          disabled={saving}
          className="inline-flex items-center gap-2 h-9 px-3 rounded-md border border-neutral-200 hover:bg-neutral-100 disabled:opacity-50 disabled:cursor-not-allowed">
          Cancel
        </button>
      </PageHeader>

      {errors.length > 0 && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 space-y-1">
          {errors.map((er, i) => (
            <div key={i}>{er}</div>
          ))}
        </div>
      )}

      <form
        id="sale-invoice-form"
        onSubmit={handleSubmit}
        onKeyDown={preventEnterSubmit}
        className="mt-4 space-y-4">
        <InvoiceHeaderForm
          partyLabel="Customer Name"
          supplierName={supplierName}
          setSupplierName={setSupplierName}
          address={address}
          setAddress={setAddress}
          invoiceDate={invoiceDate}
          setInvoiceDate={setInvoiceDate}
          invoiceNumber={invoiceNumber}
          setInvoiceNumber={setInvoiceNumber}
        />

        <ItemsEditor
          items={items}
          setItems={setItems}
          inputRows={inputRows}
          setInputRows={setInputRows}
          stockByCode={stockByCode}
          allCodes={allCodes}
          selectedIds={selectedIds}
          setSelectedIds={setSelectedIds}
          codeHeader="Code"
          rateHeader="Rate"
          qtyHeader="Qty"
        />

        {/* ✅ Fixed: Pass both qty and amount */}
        <InvoiceTotalsRow qty={totalQty} amount={computedTotal} />
      </form>
    </div>
  );
}
