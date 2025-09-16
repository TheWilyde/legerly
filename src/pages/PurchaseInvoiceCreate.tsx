import {useState, useEffect, useMemo} from 'react';
import {useNavigate, useSearchParams} from 'react-router-dom';
import {FiSave, FiTrash2} from 'react-icons/fi';
import type React from 'react';
import InvoiceHeaderForm from '../components/invoice/InvoiceHeaderForm';
import ItemsEditor from '../components/invoice/ItemsEditor';
import PageHeader from '../components/common/PageHeader';
import IconButton from '../components/common/IconButton';
import Button from '../components/common/Button';

export default function PurchaseInvoiceCreate() {
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const editingId = search.get('id') ? Number(search.get('id')) : undefined;

  const [supplierName, setSupplierName] = useState(''); // Seller name
  const [contactNo, setContactNo] = useState('');
  const [address, setAddress] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(''); // yyyy-MM-dd
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  // Stock lookup by code -> name
  const [stockByCode, setStockByCode] = useState<
    Map<string, {name: string; purchaseRate: number; saleRate: number}>
  >(new Map());

  // Persisted invoice item rows
  type Item = {
    id: number;
    code: string;
    name: string;
    rate: number;
    qty: number;
  };
  const [items, setItems] = useState<Item[]>([]);

  // Input rows
  type InputRow = {id: number; code: string; rate: string; qty: string};
  const [inputRows, setInputRows] = useState<InputRow[]>([
    {id: -1, code: '', rate: '', qty: ''},
  ]);

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Totals
  const computedTotal = useMemo(
    () => items.reduce((sum, it) => sum + it.rate * it.qty, 0),
    [items]
  );

  // Load stock and (optional) existing invoice
  useEffect(() => {
    (async () => {
      const stock = await window.api?.stock.list();
      if (stock) {
        const map = new Map<
          string,
          {name: string; purchaseRate: number; saleRate: number}
        >();
        for (const s of stock)
          map.set(s.code, {
            name: s.name,
            purchaseRate: s.purchaseRate,
            saleRate: (s as any).saleRate ?? 0,
          });
        setStockByCode(map);
      }
      if (editingId) {
        const data = await window.api?.invoices.get(editingId);
        if (data) {
          setSupplierName(data.invoice.supplierName);
          setInvoiceNumber(data.invoice.number);
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
        const list = await window.api?.invoices.list();
        if (!invoiceNumber) setInvoiceNumber(String((list?.length ?? 0) + 1));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId]);

  function handleDeleteSelected() {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    setItems((prev) => prev.filter((i) => !ids.includes(i.id)));
    setInputRows((prev) => {
      const kept = prev.filter((r) => !ids.includes(r.id));
      return kept.length === 0
        ? [{id: -Date.now(), code: '', rate: '', qty: ''}]
        : kept;
    });
    setSelectedIds(new Set());
  }

  // Prevent Enter from submitting the form
  function preventEnterSubmit(e: React.KeyboardEvent<HTMLFormElement>) {
    if (e.key === 'Enter') e.preventDefault();
  }

  function validate(): string[] {
    const errs: string[] = [];
    if (!supplierName.trim()) errs.push('Seller name is required.');
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
    const list = await window.api?.invoices.list();
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
      await window.api?.invoices.save(payload);
      navigate('/purchase-invoice');
    } catch (err) {
      console.error(err);
      setErrors(['Failed to save invoice.']);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title={editingId ? 'Edit Purchase Invoice' : 'New Purchase Invoice'}>
        {selectedIds.size > 0 && (
          <IconButton
            type="button"
            onClick={handleDeleteSelected}
            variant="danger"
            startIcon={<FiTrash2 className="size-4" />}
            title="Delete selected">
            Delete
          </IconButton>
        )}
        <Button
          form="purchase-invoice-form"
          type="submit"
          variant="primary"
          className="gap-2"
          disabled={saving}>
          <FiSave className="size-4" />
          <span>{saving ? 'Saving…' : 'Save Invoice'}</span>
        </Button>
        <Button
          type="button"
          onClick={() => navigate('/purchase-invoice')}
          disabled={saving}>
          Cancel
        </Button>
      </PageHeader>

      {errors.length > 0 && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 space-y-1">
          {errors.map((er, i) => (
            <div key={i}>{er}</div>
          ))}
        </div>
      )}

      <form
        id="purchase-invoice-form"
        onSubmit={handleSubmit}
        onKeyDown={preventEnterSubmit}
        className="mt-4 space-y-4">
        <InvoiceHeaderForm
          partyLabel="Seller Name"
          supplierName={supplierName}
          setSupplierName={setSupplierName}
          address={address}
          setAddress={setAddress}
          invoiceDate={invoiceDate}
          setInvoiceDate={setInvoiceDate}
          invoiceNumber={invoiceNumber}
          setInvoiceNumber={setInvoiceNumber}
          showContact
          contactNo={contactNo}
          setContactNo={setContactNo}
        />

        {/* Items editor */}
        <ItemsEditor
          items={items}
          setItems={setItems}
          inputRows={inputRows}
          setInputRows={setInputRows}
          stockByCode={stockByCode}
          allCodes={Array.from(stockByCode.keys()).sort()}
          selectedIds={selectedIds}
          setSelectedIds={setSelectedIds}
          codeHeader="Code"
          rateHeader="Rate"
          qtyHeader="Qty"
          rateSource="purchase"
        />
      </form>
    </div>
  );
}
