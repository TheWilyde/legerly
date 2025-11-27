import {useState, useEffect, useMemo} from 'react';
import {useNavigate, useParams} from 'react-router-dom';
import {FiSave, FiTrash2, FiFileText} from 'react-icons/fi'; // ✅ Added FiFileText
import type React from 'react';
import InvoiceHeaderForm from '../components/features/invoice/InvoiceHeaderForm';
import ItemsEditor from '../components/features/invoice/ItemsEditor';
import PageHeader from '../components/common/PageHeader';
import {useActiveProfile} from '../hooks/useActiveProfile';

export default function PurchaseInvoiceCreate() {
  const navigate = useNavigate();
  const params = useParams<{id?: string}>();
  const editingId = params.id ? Number(params.id) : undefined;

  const profileId = useActiveProfile();
  // Redirect if no profile
  useEffect(() => {
    if (!profileId) navigate('/welcome');
  }, [profileId, navigate]);

  const [supplierName, setSupplierName] = useState('');
  const [contactNo, setContactNo] = useState('');
  const [address, setAddress] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [status, setStatus] = useState<'draft' | 'posted'>('posted'); // ✅ Added status state

  const [stockByCode, setStockByCode] = useState<
    Map<string, {name: string; purchaseRate: number; saleRate: number}>
  >(new Map());

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

  const computedTotal = useMemo(
    () => items.reduce((sum, it) => sum + it.rate * it.qty, 0),
    [items]
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
            purchaseRate: s.purchaseRate,
            saleRate: (s as any).saleRate ?? 0,
          });
        setStockByCode(map);
      }
      if (editingId) {
        const data = await window.api?.invoices.get(profileId!, editingId);
        if (data) {
          setSupplierName(data.invoice.supplierName ?? '');
          setInvoiceNumber(data.invoice.number ?? '');
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
          setStatus(data.invoice.status || 'posted'); // ✅ Load status
        }
      } else {
        const list = await window.api?.invoices.list(profileId);
        if (!invoiceNumber) setInvoiceNumber(String((list?.length ?? 0) + 1));
      }
    })();
  }, [profileId, editingId]);

  function handleDeleteSelected() {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    setItems((prev) => prev.filter((i) => !ids.includes(i.id)));
    setInputRows((prev) => {
      const kept = prev.filter((r) => !ids.includes(r.id));
      return kept.length === 0
        ? [{id: -Date.now(), code: '', name: '', rate: '', qty: ''}] // ✅ Include name field
        : kept;
    });
    setSelectedIds(new Set());
  }

  function preventEnterSubmit(e: React.KeyboardEvent<HTMLFormElement>) {
    if (e.key === 'Enter') e.preventDefault();
  }

  function validate(): string[] {
    const errs: string[] = [];
    if (!supplierName?.trim()) errs.push('Supplier name is required.');
    if (!invoiceNumber?.trim()) errs.push('Invoice number is required.');
    if (invoiceDate && isNaN(Date.parse(invoiceDate))) errs.push('Invoice date is invalid.');
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
    const list = await window.api?.invoices.list(profileId);
    if (!list) return false;
    return list.some((inv) => inv.number === num && inv.id !== editingId);
  }

  // ✅ Updated handleSubmit
  async function handleSubmit(e: React.FormEvent, targetStatus: 'draft' | 'posted') {
    e.preventDefault();
    if (!profileId) return;
    
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

    setSaving(true);
    setErrors([]);

    try {
      const payload = {
        id: editingId,
        number: invoiceNumber,
        supplierName,
        contactNo,
        address,
        invoiceDate,
        total: computedTotal, // ✅ Make sure this is using computedTotal, not inline calculation
        items: items.map((it, idx) => ({
          code: it.code,
          name: it.name,
          rate: it.rate,
          qty: it.qty,
          position: idx,
        })),
        status: targetStatus,
      };

      await window.api?.invoices.save(profileId, payload);
      navigate('/purchase-invoice');
    } catch (err) {
      console.error(err);
      setErrors(['Failed to save invoice']);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="h-full flex flex-col bg-neutral-50">
      <form onSubmit={(e) => handleSubmit(e, 'posted')} onKeyDown={preventEnterSubmit}>
        <PageHeader
          title={editingId ? (status === 'draft' ? 'Edit Draft Invoice' : 'Edit Purchase Invoice') : 'New Purchase Invoice'}
        >
          <div className="flex items-center gap-2">
            {/* ✅ Replace IconButton with inline button */}
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
              className="px-4 py-2 rounded-md bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50 flex items-center gap-2 text-sm font-medium transition-colors">
              <FiFileText className="size-4" />
              {status === 'draft' ? 'Update Draft' : 'Save Draft'}
            </button>

            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-md bg-neutral-900 text-white hover:bg-neutral-800 flex items-center gap-2 text-sm font-medium transition-colors shadow-sm">
              <FiSave className="size-4" />
              {saving ? 'Saving...' : (status === 'draft' ? 'Post Invoice' : 'Save Invoice')}
            </button>
            
            <button
              type="button"
              onClick={() => navigate('/purchase-invoice')}
              className="px-3 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100 rounded-md"
            >
              Cancel
            </button>
          </div>
        </PageHeader>
        
        {errors.length > 0 && (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 space-y-1">
            {errors.map((er, i) => (
              <div key={i}>{er}</div>
            ))}
          </div>
        )}

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
          kind="purchase"
          editingId={editingId}
          showContact
          contactNo={contactNo}
          setContactNo={setContactNo}
        />

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
