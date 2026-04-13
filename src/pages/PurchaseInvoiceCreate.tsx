import {useState, useEffect, useMemo, useRef, useCallback} from 'react';
import {useNavigate, useParams} from 'react-router-dom';
import {FiSave, FiTrash2, FiFileText, FiCopy, FiClipboard} from 'react-icons/fi'; // ✅ Added FiCopy and FiClipboard
import type React from 'react';
import InvoiceHeaderForm from '../components/features/invoice/InvoiceHeaderForm';
import ItemsEditor from '../components/features/invoice/ItemsEditor';
import PageHeader from '../components/common/PageHeader';
import {useActiveProfile} from '../hooks/useActiveProfile';
import {useKeyboardShortcuts} from '../hooks/useKeyboardShortcuts';
import {useAppStore} from '../stores/appStore';

export default function PurchaseInvoiceCreate() {
  const navigate = useNavigate();
  const params = useParams<{id?: string}>();
  const editingId = params.id ? Number(params.id) : undefined;

  const profileId = useActiveProfile();
  const {invoiceForms, updatePurchaseInvoiceForm, resetPurchaseInvoiceForm} =
    useAppStore();

  const form = invoiceForms.purchase;

  // Redirect if no profile
  useEffect(() => {
    if (!profileId) navigate('/welcome');
  }, [profileId, navigate]);

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
  type ClipboardItem = {
    code: string;
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
  const hydratedDraftProfileRef = useRef<string | null>(null);

  const computedTotal = useMemo(
    () => items.reduce((sum, it) => sum + it.rate * it.qty, 0),
    [items],
  );

  const [hasClipboardItems, setHasClipboardItems] = useState(
    () => !!localStorage.getItem('legerly_invoice_items_clipboard')
  );

  const loadStockMap = useCallback(async () => {
    if (!profileId) return;

    const stock = await window.api?.stock.list(profileId);
    if (!stock) return;

    const map = new Map<
      string,
      {name: string; purchaseRate: number; saleRate: number}
    >();
    for (const s of stock) {
      const code = String(s.code ?? '').trim().toUpperCase();
      if (!code) continue;
      map.set(code, {
        name: s.name,
        purchaseRate: s.purchaseRate,
        saleRate: (s as any).saleRate ?? 0,
      });
    }

    setStockByCode(map);
  }, [profileId]);

  useEffect(() => {
    const handleStorage = () => setHasClipboardItems(!!localStorage.getItem('legerly_invoice_items_clipboard'));
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  useEffect(() => {
    if (!profileId) return;

    const handleStockChanged = () => {
      void loadStockMap();
    };

    window.addEventListener('stock:changed', handleStockChanged);
    return () => window.removeEventListener('stock:changed', handleStockChanged);
  }, [loadStockMap, profileId]);

  function handleCopyItems() {
    const payload: ClipboardItem[] = items
      .map((it) => ({
        code: it.code.trim().toUpperCase(),
        qty: Number(it.qty),
      }))
      .filter((it) => Boolean(it.code) && Number.isFinite(it.qty));

    localStorage.setItem(
      'legerly_invoice_items_clipboard',
      JSON.stringify(payload),
    );
    window.dispatchEvent(new Event('storage'));
    setHasClipboardItems(true);
  }

  function handlePasteItems() {
    try {
      const txt = localStorage.getItem('legerly_invoice_items_clipboard');
      if (!txt) return;

      const parsed: unknown = JSON.parse(txt);
      if (!Array.isArray(parsed)) return;

      const now = Date.now();
      const pasted = parsed
        .map((raw, i): Item | null => {
          if (!raw || typeof raw !== 'object') return null;

          const item = raw as {code?: unknown; qty?: unknown};
          const code =
            typeof item.code === 'string'
              ? item.code.trim().toUpperCase()
              : '';
          const qty = Number(item.qty);

          if (!code || !Number.isFinite(qty) || qty <= 0) return null;

          const stock = stockByCode.get(code);

          return {
            id: now + i + Math.random(),
            code,
            name: stock?.name ?? '',
            rate: Number(stock?.purchaseRate ?? 0),
            qty,
          };
        })
        .filter((row): row is Item => row !== null);

      if (pasted.length === 0) return;

      setItems((prev) => [...prev, ...pasted]);
    } catch (e) {
      console.error('Failed to paste items', e);
    }
  }

  useEffect(() => {
    if (editingId) {
      hydratedDraftProfileRef.current = null;
    }
  }, [editingId]);

  useEffect(() => {
    if (editingId || !profileId) return;
    if (hydratedDraftProfileRef.current === profileId) return;

    hydratedDraftProfileRef.current = profileId;

    const restored = (form.items ?? []).map((it, idx) => ({
      id:
        typeof (it as {id?: unknown}).id === 'number' &&
        Number.isFinite((it as {id?: number}).id)
          ? ((it as {id?: number}).id as number)
          : Date.now() + idx + Math.random(),
      code: String(it.code ?? ''),
      name: String(it.name ?? ''),
      rate: Number(it.rate ?? 0),
      qty: Number(it.qty ?? 0),
    }));

    setItems(restored);
    setInputRows([
      {id: -Date.now(), code: '', name: '', rate: '', qty: ''},
    ]);
    setSelectedIds(new Set());
  }, [editingId, form.items, profileId]);

  useEffect(() => {
    if (editingId || !profileId) return;

    updatePurchaseInvoiceForm({
      items: items.map((it) => ({
        id: it.id,
        code: it.code,
        name: it.name,
        rate: it.rate,
        qty: it.qty,
      })),
    });
  }, [editingId, items, profileId, updatePurchaseInvoiceForm]);

  useEffect(() => {
    (async () => {
      if (!profileId) return;
      await loadStockMap();
      if (editingId) {
        const data = await window.api?.invoices.get(profileId!, editingId);
        if (data) {
          updatePurchaseInvoiceForm({
            supplierName: data.invoice.supplierName ?? '',
            contactNo: data.invoice.contactNo ?? '',
            address: data.invoice.address ?? '',
            invoiceDate: data.invoice.invoiceDate ?? '',
            number: data.invoice.number ?? '',
          });
          setItems(
            data.items.map((it) => ({
              id: it.id,
              code: it.code,
              name: it.name,
              rate: it.rate,
              qty: it.qty,
            })),
          );
          setStatus(data.invoice.status || 'posted'); // ✅ Load status
        }
      } else {
        const list = await window.api?.invoices.list(profileId);
        if (!form.number) {
          const nextNumber = String((list?.length ?? 0) + 1);
          updatePurchaseInvoiceForm({number: nextNumber});
        }
      }
    })();
  }, [profileId, editingId, updatePurchaseInvoiceForm, form.number, loadStockMap]);

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

  function handleAddRowShortcut() {
    setInputRows((prev) => [
      ...prev,
      {
        id: -(Date.now() + prev.length + 1),
        code: '',
        name: '',
        rate: '',
        qty: '',
      },
    ]);
  }

  function handleCancel() {
    resetPurchaseInvoiceForm();
    navigate('/purchase-invoice');
  }

  function preventEnterSubmit(e: React.KeyboardEvent<HTMLFormElement>) {
    if (e.key === 'Enter') e.preventDefault();
  }

  function validate(): string[] {
    const errs: string[] = [];
    if (!form.supplierName?.trim()) errs.push('Supplier name is required.');
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
    const list = await window.api?.invoices.list(profileId);
    if (!list) return false;
    return list.some((inv) => inv.number === num && inv.id !== editingId);
  }

  // ✅ Updated handleSubmit
  async function handleSubmit(
    e: React.FormEvent,
    targetStatus: 'draft' | 'posted',
  ) {
    e.preventDefault();
    if (saving) return;
    if (!profileId) return;

    const number = (form.number || '').trim();
    const invoiceDate = form.invoiceDate?.trim() || new Date().toISOString().split('T')[0];
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
        number: form.number,
        supplierName: form.supplierName,
        contactNo: form.contactNo,
        address: form.address,
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
      window.dispatchEvent(new CustomEvent('invoice:changed'));
      window.dispatchEvent(new CustomEvent('stock:changed'));
      resetPurchaseInvoiceForm(); // Reset form after successful save
      navigate('/purchase-invoice');
    } catch (err) {
      console.error(err);
      setErrors(['Failed to save invoice']);
    } finally {
      setSaving(false);
    }
  }

  useKeyboardShortcuts([
    {
      key: 's',
      ctrl: true,
      allowInInput: true,
      enabled: !saving,
      handler: (event) => {
        void handleSubmit(event as unknown as React.FormEvent, 'draft');
      },
    },
    {
      key: 's',
      ctrl: true,
      shift: true,
      allowInInput: true,
      enabled: !saving,
      handler: (event) => {
        void handleSubmit(event as unknown as React.FormEvent, 'posted');
      },
    },
    {
      key: 'Enter',
      ctrl: true,
      allowInInput: true,
      enabled: !saving,
      handler: (event) => {
        void handleSubmit(event as unknown as React.FormEvent, 'posted');
      },
    },
    {
      key: 'Escape',
      allowInInput: true,
      enabled: !saving,
      handler: () => {
        handleCancel();
      },
    },
    {
      key: 'c',
      ctrl: true,
      shift: true,
      allowInInput: true,
      enabled: items.length > 0,
      handler: () => {
        handleCopyItems();
      },
    },
    {
      key: 'v',
      ctrl: true,
      shift: true,
      allowInInput: true,
      enabled: hasClipboardItems,
      handler: () => {
        handlePasteItems();
      },
    },
    {
      key: 'n',
      alt: true,
      allowInInput: true,
      enabled: !saving,
      handler: () => {
        handleAddRowShortcut();
      },
    },
    {
      key: 'Delete',
      alt: true,
      enabled: selectedIds.size > 0,
      handler: () => {
        handleDeleteSelected();
      },
    },
  ]);

  return (
    <div className="h-full flex flex-col bg-neutral-50">
      <form
        onSubmit={(e) => handleSubmit(e, 'posted')}
        onKeyDown={preventEnterSubmit}>
        <PageHeader
          title={
            editingId
              ? status === 'draft'
                ? 'Edit Draft Invoice'
                : 'Edit Purchase Invoice'
              : 'New Purchase Invoice'
          }>
          <div className="flex items-center gap-2">
            {/* ✅ Replace IconButton with inline button */}
            {selectedIds.size > 0 && (
              <button
                type="button"
                onClick={handleDeleteSelected}
                className="inline-flex items-center gap-2 h-9 px-3 rounded-md border border-red-200 text-red-700 hover:bg-red-50"
                title="Delete selected items (Alt+Delete)">
                <FiTrash2 className="size-4" />
                <span>Delete</span>
              </button>
            )}

            {/* ✅ Copy Items Button */}
            {items.length > 0 && (
              <button
                type="button"
                onClick={handleCopyItems}
                className="px-4 py-2 rounded-md bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50 flex items-center gap-2 text-sm font-medium transition-colors"
                title="Copy all items (Ctrl+Shift+C)">
                <FiCopy className="size-4" />
                Copy Items
              </button>
            )}

            {/* ✅ Paste Items Button */}
            {hasClipboardItems && (
              <button
                type="button"
                onClick={handlePasteItems}
                className="px-4 py-2 rounded-md bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50 flex items-center gap-2 text-sm font-medium transition-colors"
                title="Paste items (Ctrl+Shift+V)">
                <FiClipboard className="size-4" />
                Paste Items
              </button>
            )}

            {/* ✅ Save Draft Button */}
            <button
              type="button"
              disabled={saving}
              onClick={(e) => handleSubmit(e as any, 'draft')}
              title="Save draft (Ctrl+S)"
              className="px-4 py-2 rounded-md bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50 flex items-center gap-2 text-sm font-medium transition-colors">
              <FiFileText className="size-4" />
              {status === 'draft' ? 'Update Draft' : 'Save Draft'}
            </button>

            <button
              type="submit"
              disabled={saving}
              title="Post invoice (Ctrl+Shift+S)"
              className="px-4 py-2 rounded-md bg-neutral-900 text-white hover:bg-neutral-800 flex items-center gap-2 text-sm font-medium transition-colors shadow-sm">
              <FiSave className="size-4" />
              {saving
                ? 'Saving...'
                : status === 'draft'
                  ? 'Post Invoice'
                  : 'Save Invoice'}
            </button>

            <button
              type="button"
              onClick={handleCancel}
              title="Cancel (Esc)"
              className="px-3 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100 rounded-md">
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
          supplierName={form.supplierName}
          setSupplierName={(value) =>
            updatePurchaseInvoiceForm({supplierName: value})
          }
          address={form.address}
          setAddress={(value) => updatePurchaseInvoiceForm({address: value})}
          invoiceDate={form.invoiceDate}
          setInvoiceDate={(value) =>
            updatePurchaseInvoiceForm({invoiceDate: value})
          }
          invoiceNumber={form.number}
          setInvoiceNumber={(value) =>
            updatePurchaseInvoiceForm({number: value})
          }
          kind="purchase"
          editingId={editingId}
          showContact
          contactNo={form.contactNo}
          setContactNo={(value) =>
            updatePurchaseInvoiceForm({contactNo: value})
          }
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
