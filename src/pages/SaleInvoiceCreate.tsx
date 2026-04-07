import {useState, useEffect, useMemo} from 'react';
import {useNavigate, useParams} from 'react-router-dom';
import {FiSave, FiTrash2, FiFileText} from 'react-icons/fi'; // ✅ Added FiFileText
import type React from 'react';
import InvoiceHeaderForm from '../components/features/invoice/InvoiceHeaderForm';
import ItemsEditor from '../components/features/invoice/ItemsEditor';
import PageHeader from '../components/common/PageHeader';
import {useActiveProfile} from '../hooks/useActiveProfile';
import {useAppStore} from '../stores/appStore';

export default function SaleInvoiceCreate() {
  const navigate = useNavigate();
  const params = useParams<{id?: string}>();
  const editingId = params.id ? Number(params.id) : undefined;

  const profileId = useActiveProfile();
  const {invoiceForms, updateSaleInvoiceForm, resetSaleInvoiceForm} =
    useAppStore();

  const form = invoiceForms.sale;

  useEffect(() => {
    if (!profileId) navigate('/welcome');
  }, [profileId, navigate]);

  const [stockByCode, setStockByCode] = useState<
    Map<string, {name: string; purchaseRate: number; saleRate: number}>
  >(new Map());
  const allCodes = useMemo(
    () => Array.from(stockByCode.keys()).sort(),
    [stockByCode],
  );

  type Item = {
    id: number;
    code: string;
    name: string;
    rate: number;
    qty: number;
  };
  const [items, setItems] = useState<Item[]>([]);
  const [status, setStatus] = useState<'draft' | 'posted'>('posted');
  type InputRow = {
    id: number;
    code: string;
    name: string;
    rate: string;
    qty: string;
  };
  const [inputRows, setInputRows] = useState<InputRow[]>([
    {id: -1, code: '', name: '', rate: '', qty: ''},
  ]);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const computedTotal = useMemo(
    () => items.reduce((sum, it) => sum + it.rate * it.qty, 0),
    [items],
  );

  useEffect(() => {
    (async () => {
      if (!profileId) return;
      const stock = await window.api?.stock.list(profileId);
      if (stock) {
        const map = new Map<
          string,
          {name: string; purchaseRate: number; saleRate: number}
        >();
        for (const s of stock)
          map.set(s.code, {
            name: s.name,
            purchaseRate: (s as any).saleRate ?? s.purchaseRate ?? 0,
            saleRate: (s as any).saleRate ?? 0,
          });
        setStockByCode(map);
      }
      if (editingId) {
        const data = await window.api?.saleInvoices.get(profileId, editingId);
        if (data) {
          updateSaleInvoiceForm({
            supplierName:
              (data.invoice as any).customerName ||
              data.invoice.supplierName ||
              '',
            contactNo: data.invoice.contactNo || '',
            address: data.invoice.address || '',
            invoiceDate: data.invoice.invoiceDate || '',
            number: data.invoice.number || '',
          });
          setItems(
            data.items.map((it: any) => ({
              id: it.id,
              code: it.code,
              name: it.name,
              rate: it.rate,
              qty: it.qty,
            })),
          );
          setStatus(data.invoice.status || 'posted'); // ✅ Load status
          setInputRows([{id: -1, code: '', name: '', rate: '', qty: ''}]);
        }
      } else {
        const list =
          (await window.api?.saleInvoices.list(profileId)) ??
          ([] as RendererInvoice[]);
        if (!form.number) {
          const nextNumber = String((list?.length ?? 0) + 1);
          updateSaleInvoiceForm({number: nextNumber});
        }
      }
    })();
  }, [profileId, editingId, updateSaleInvoiceForm, form.number]);

  function handleDeleteSelected() {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    setItems((prev) => prev.filter((i) => !ids.includes(i.id)));
    setInputRows((prev) =>
      prev.filter((r) => !ids.includes(r.id)).length === 0
        ? [{id: -Date.now(), code: '', name: '', rate: '', qty: ''}]
        : prev.filter((r) => !ids.includes(r.id)),
    );
    setSelectedIds(new Set());
  }

  function preventEnterSubmit(e: React.KeyboardEvent<HTMLFormElement>) {
    if (e.key === 'Enter') e.preventDefault();
  }

  function validate(): string[] {
    const errs: string[] = [];
    if (!form.supplierName?.trim()) errs.push('Customer name is required.');
    if (!form.number?.trim()) errs.push('Invoice number is required.');
    if (form.invoiceDate && isNaN(Date.parse(form.invoiceDate)))
      errs.push('Invoice date is invalid.');
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
    if (!profileId) return false;
    const list = (await window.api?.saleInvoices.list(profileId)) ?? [];
    if (!list) return false;
    return list.some(
      (inv: RendererInvoice) => inv.number === num && inv.id !== editingId,
    );
  }

  // ✅ Updated handleSubmit
  async function handleSubmit(
    e: React.FormEvent,
    targetStatus: 'draft' | 'posted',
  ) {
    e.preventDefault();
    if (saving) return;
    setErrors([]);
    const number = (form.number || '').trim();
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
      customerName: form.supplierName.trim(),
      total: computedTotal,
      address: form.address.trim(),
      invoiceDate: form.invoiceDate,
      contactNo: form.contactNo.trim() || undefined,
      items: items.map((it, idx) => ({
        code: it.code.trim(),
        name: it.name.trim(),
        rate: it.rate,
        qty: it.qty,
        position: idx,
      })),
      status: targetStatus, // ✅ Send status
    };
    setSaving(true);
    try {
      if (!profileId) throw new Error('No active profile');
      await window.api?.saleInvoices.save(profileId, payload);
      resetSaleInvoiceForm(); // Reset form after successful save
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
      <PageHeader
        title={
          editingId
            ? status === 'draft'
              ? 'Edit Draft Invoice'
              : 'Edit Sale Invoice'
            : 'New Sale Invoice'
        }>
        {selectedIds.size > 0 && (
          <button
            type="button"
            onClick={handleDeleteSelected}
            className="inline-flex items-center gap-2 h-9 px-3 rounded-md border border-red-200 text-red-700 hover:bg-red-50"
            title="Delete">
            <FiTrash2 className="size-4" />
            <span>Delete</span>
          </button>
        )}

        {/* ✅ Save Draft Button */}
        <button
          type="button"
          disabled={saving}
          onClick={(e) => handleSubmit(e as any, 'draft')}
          className="inline-flex items-center gap-2 h-9 px-3 rounded-md bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 transition-colors text-sm font-medium">
          <FiFileText className="size-4" />
          <span>{status === 'draft' ? 'Update Draft' : 'Save Draft'}</span>
        </button>

        <button
          type="button"
          onClick={(e) => handleSubmit(e as any, 'posted')}
          disabled={saving}
          className="inline-flex items-center gap-2 h-9 px-3 rounded-md bg-neutral-900 text-white hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium">
          <FiSave className="size-4" />
          <span>
            {saving
              ? 'Saving…'
              : status === 'draft'
                ? 'Post Invoice'
                : 'Save Invoice'}
          </span>
        </button>

        <button
          type="button"
          onClick={() => navigate('/sale-invoice')}
          disabled={saving}
          className="inline-flex items-center gap-2 h-9 px-3 rounded-md border border-neutral-200 hover:bg-neutral-100 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium">
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
        onSubmit={(e) => handleSubmit(e, 'posted')}
        onKeyDown={preventEnterSubmit}
        className="mt-4 space-y-4">
        <InvoiceHeaderForm
          partyLabel="Customer Name"
          supplierName={form.supplierName}
          setSupplierName={(value) =>
            updateSaleInvoiceForm({supplierName: value})
          }
          address={form.address}
          setAddress={(value) => updateSaleInvoiceForm({address: value})}
          invoiceDate={form.invoiceDate}
          setInvoiceDate={(value) =>
            updateSaleInvoiceForm({invoiceDate: value})
          }
          invoiceNumber={form.number}
          setInvoiceNumber={(value) => updateSaleInvoiceForm({number: value})}
          showContact
          contactNo={form.contactNo}
          setContactNo={(value) => updateSaleInvoiceForm({contactNo: value})}
          kind="sale"
          editingId={editingId}
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

        {/* Totals now rendered inside ItemsEditor */}
      </form>
    </div>
  );
}
