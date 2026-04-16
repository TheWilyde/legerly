import {useState, useEffect, useMemo, useRef, useCallback} from 'react';
import {useNavigate, useParams} from 'react-router-dom';
import {
  FiSave,
  FiTrash2,
  FiFileText,
  FiCopy,
  FiClipboard,
} from 'react-icons/fi'; // ✅ Added FiCopy and FiClipboard
import type React from 'react';
import InvoiceHeaderForm from '../components/features/invoice/InvoiceHeaderForm';
import ItemsEditor from '../components/features/invoice/ItemsEditor';
import PageHeader from '../components/common/PageHeader';
import {useActiveProfile} from '../hooks/useActiveProfile';
import {useKeyboardShortcuts} from '../hooks/useKeyboardShortcuts';
import {useUndoRedoHistory} from '../hooks/useUndoRedoHistory';
import {useAppStore} from '../stores/appStore';
import {emitAppFeedback} from '../utils/feedback';

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
  type ClipboardItem = {
    code: string;
    qty: number;
  };
  const [items, setItems] = useState<Item[]>([]);
  const [status, setStatus] = useState<'draft' | 'posted'>('posted');
  const [periodStatus, setPeriodStatus] = useState<'active' | 'closed'>(
    'active',
  );
  const [overrideClosedPeriod, setOverrideClosedPeriod] = useState(false);
  const isReadOnly = Boolean(
    editingId && periodStatus === 'closed' && !overrideClosedPeriod,
  );
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
  const [, setErrors] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const hydratedDraftProfileRef = useRef<string | null>(null);

  const applyErrors = useCallback((nextErrors: string[]) => {
    setErrors(nextErrors);
    if (nextErrors.length > 0) {
      emitAppFeedback('error', nextErrors[0]);
    }
  }, []);

  type SaleFormSnapshot = {
    supplierName: string;
    contactNo: string;
    address: string;
    invoiceDate: string;
    number: string;
  };
  type SaleInvoiceHistorySnapshot = {
    form: SaleFormSnapshot;
    items: Item[];
    inputRows: InputRow[];
  };

  const {
    record: recordSaleHistory,
    undo: undoSaleHistory,
    redo: redoSaleHistory,
    clear: clearSaleHistory,
    canUndo: canUndoSaleHistory,
    canRedo: canRedoSaleHistory,
  } = useUndoRedoHistory<SaleInvoiceHistorySnapshot>({limit: 300});

  const makeFormSnapshot = useCallback(
    (): SaleFormSnapshot => ({
      supplierName: form.supplierName ?? '',
      contactNo: form.contactNo ?? '',
      address: form.address ?? '',
      invoiceDate: form.invoiceDate ?? '',
      number: form.number ?? '',
    }),
    [
      form.supplierName,
      form.contactNo,
      form.address,
      form.invoiceDate,
      form.number,
    ],
  );

  const makeHistorySnapshot = useCallback(
    (overrides?: Partial<SaleInvoiceHistorySnapshot>) => ({
      form: overrides?.form ?? makeFormSnapshot(),
      items: overrides?.items ?? items,
      inputRows: overrides?.inputRows ?? inputRows,
    }),
    [makeFormSnapshot, items, inputRows],
  );

  const applyHistorySnapshot = useCallback(
    (snapshot: SaleInvoiceHistorySnapshot) => {
      updateSaleInvoiceForm({...snapshot.form});
      setItems(snapshot.items);
      setInputRows(
        snapshot.inputRows.length > 0
          ? snapshot.inputRows
          : [{id: -Date.now(), code: '', name: '', rate: '', qty: ''}],
      );
      setSelectedIds(new Set());
    },
    [updateSaleInvoiceForm],
  );

  const setItemsWithHistory = useCallback(
    (updater: ((prev: Item[]) => Item[]) | Item[]) => {
      setItems((prev) => {
        const next =
          typeof updater === 'function'
            ? (updater as (prev: Item[]) => Item[])(prev)
            : updater;

        if (next === prev) return prev;

        recordSaleHistory(
          makeHistorySnapshot({
            items: prev,
          }),
        );
        return next;
      });
    },
    [recordSaleHistory, makeHistorySnapshot],
  );

  const setInputRowsWithHistory = useCallback(
    (updater: ((prev: InputRow[]) => InputRow[]) | InputRow[]) => {
      setInputRows((prev) => {
        const next =
          typeof updater === 'function'
            ? (updater as (prev: InputRow[]) => InputRow[])(prev)
            : updater;

        if (next === prev) return prev;

        recordSaleHistory(
          makeHistorySnapshot({
            inputRows: prev,
          }),
        );

        return next;
      });
    },
    [recordSaleHistory, makeHistorySnapshot],
  );

  const updateFormFieldWithHistory = useCallback(
    (field: keyof SaleFormSnapshot, value: string) => {
      const current = (form[field] ?? '') as string;
      if (current === value) return;

      recordSaleHistory(makeHistorySnapshot());
      updateSaleInvoiceForm({[field]: value} as Partial<typeof form>);
    },
    [form, recordSaleHistory, makeHistorySnapshot, updateSaleInvoiceForm],
  );

  const handleUndo = useCallback(() => {
    const previous = undoSaleHistory(makeHistorySnapshot());
    if (!previous) return;
    applyHistorySnapshot(previous);
  }, [undoSaleHistory, makeHistorySnapshot, applyHistorySnapshot]);

  const handleRedo = useCallback(() => {
    const next = redoSaleHistory(makeHistorySnapshot());
    if (!next) return;
    applyHistorySnapshot(next);
  }, [redoSaleHistory, makeHistorySnapshot, applyHistorySnapshot]);

  const computedTotal = useMemo(
    () => items.reduce((sum, it) => sum + it.rate * it.qty, 0),
    [items],
  );

  const [hasClipboardItems, setHasClipboardItems] = useState(
    () => !!localStorage.getItem('legerly_invoice_items_clipboard'),
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
      const code = String(s.code ?? '')
        .trim()
        .toUpperCase();
      if (!code) continue;
      map.set(code, {
        name: s.name,
        purchaseRate: s.purchaseRate ?? 0,
        saleRate: (s as any).saleRate ?? 0,
      });
    }

    setStockByCode(map);
  }, [profileId]);

  useEffect(() => {
    const handleStorage = () =>
      setHasClipboardItems(
        !!localStorage.getItem('legerly_invoice_items_clipboard'),
      );
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  useEffect(() => {
    if (!profileId) return;

    const handleStockChanged = () => {
      void loadStockMap();
    };

    window.addEventListener('stock:changed', handleStockChanged);
    return () =>
      window.removeEventListener('stock:changed', handleStockChanged);
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
            typeof item.code === 'string' ? item.code.trim().toUpperCase() : '';
          const qty = Number(item.qty);

          if (!code || !Number.isFinite(qty) || qty <= 0) return null;

          const stock = stockByCode.get(code);

          return {
            id: now + i + Math.random(),
            code,
            name: stock?.name ?? '',
            rate: Number(stock?.saleRate ?? 0),
            qty,
          };
        })
        .filter((row): row is Item => row !== null);

      if (pasted.length === 0) return;

      setItemsWithHistory((prev) => [...prev, ...pasted]);
    } catch (e) {
      console.error('Failed to paste items', e);
    }
  }

  useEffect(() => {
    if (editingId) {
      hydratedDraftProfileRef.current = null;
      setOverrideClosedPeriod(false);
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
    setInputRows([{id: -Date.now(), code: '', name: '', rate: '', qty: ''}]);
    setSelectedIds(new Set());
    clearSaleHistory();
  }, [editingId, form.items, profileId, clearSaleHistory]);

  useEffect(() => {
    if (editingId || !profileId) return;

    updateSaleInvoiceForm({
      items: items.map((it) => ({
        id: it.id,
        code: it.code,
        name: it.name,
        rate: it.rate,
        qty: it.qty,
      })),
    });
  }, [editingId, items, profileId, updateSaleInvoiceForm]);

  useEffect(() => {
    if (!profileId) return;
    void loadStockMap();
  }, [profileId, loadStockMap]);

  useEffect(() => {
    if (!profileId || !editingId) return;

    (async () => {
      const data = await window.api?.saleInvoices.get(profileId, editingId);
      if (!data) return;

      updateSaleInvoiceForm({
        supplierName:
          (data.invoice as any).customerName || data.invoice.supplierName || '',
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
      setStatus(data.invoice.status || 'posted');
      setPeriodStatus((data.invoice as any).periodStatus || 'active');
      setOverrideClosedPeriod(false);
      setInputRows([{id: -1, code: '', name: '', rate: '', qty: ''}]);
      clearSaleHistory();
    })();
  }, [profileId, editingId, updateSaleInvoiceForm, clearSaleHistory]);

  useEffect(() => {
    if (!profileId || editingId || form.number) return;

    (async () => {
      const nextNumber = await window.api?.saleInvoices.nextNumber(profileId);
      if (!form.number) {
        updateSaleInvoiceForm({number: nextNumber || '1'});
        clearSaleHistory();
      }
    })();
  }, [
    profileId,
    editingId,
    form.number,
    updateSaleInvoiceForm,
    clearSaleHistory,
  ]);

  function handleDeleteSelected() {
    if (isReadOnly) return;
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    recordSaleHistory(makeHistorySnapshot());
    setItems((prev) => prev.filter((i) => !ids.includes(i.id)));
    setInputRows((prev) => {
      const kept = prev.filter((r) => !ids.includes(r.id));
      return kept.length === 0
        ? [{id: -Date.now(), code: '', name: '', rate: '', qty: ''}]
        : kept;
    });
    setSelectedIds(new Set());
  }

  function handleAddRowShortcut() {
    recordSaleHistory(makeHistorySnapshot());
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
    clearSaleHistory();
    resetSaleInvoiceForm();
    navigate('/sale-invoice');
  }

  function preventEnterSubmit(e: React.KeyboardEvent<HTMLFormElement>) {
    if (e.key === 'Enter') e.preventDefault();
  }

  function validate(): string[] {
    const errs: string[] = [];
    if (!form.supplierName?.trim()) errs.push('Customer name is required.');
    if (!form.number?.trim()) errs.push('Invoice number is required.');
    if (!form.invoiceDate?.trim()) errs.push('Invoice date is required.');
    if (form.invoiceDate && isNaN(Date.parse(form.invoiceDate))) {
      errs.push('Invoice date is invalid.');
    }
    if (items.length === 0) errs.push('At least one item is required.');
    items.forEach((it, i) => {
      if (!it.code.trim()) errs.push(`Item ${i + 1}: code required.`);
      if (!it.name.trim()) errs.push(`Item ${i + 1}: name required.`);
      if (!(it.rate > 0)) errs.push(`Item ${i + 1}: rate must be > 0.`);
      if (!(it.qty > 0)) errs.push(`Item ${i + 1}: qty must be > 0.`);
    });
    return errs;
  }

  function isDuplicateInvoiceNumberError(error: unknown): boolean {
    const err = error as {code?: string; message?: string} | undefined;
    const message = String(err?.message ?? '').toLowerCase();
    return (
      String(err?.code ?? '') === 'DUPLICATE_INVOICE_NUMBER' ||
      (message.includes('invoice number') && message.includes('already exists'))
    );
  }

  async function hasDuplicateInvoiceNumber(num: string) {
    if (!profileId) return false;
    const list = (await window.api?.saleInvoices.list(profileId)) ?? [];
    return list.some(
      (inv: RendererInvoice) => inv.number === num && inv.id !== editingId,
    );
  }

  async function handleSubmit(
    e: React.FormEvent,
    targetStatus: 'draft' | 'posted',
  ) {
    e.preventDefault();
    if (isReadOnly) {
      applyErrors([
        'Closed period invoices are read-only. Reopen the period to edit.',
      ]);
      return;
    }
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
      applyErrors(errs);
      return;
    }

    const invoiceDate = form.invoiceDate?.trim() || '';
    const payload = {
      id: editingId,
      number,
      customerName: form.supplierName.trim(),
      total: computedTotal,
      address: form.address.trim(),
      invoiceDate,
      contactNo: form.contactNo.trim() || undefined,
      items: items.map((it, idx) => ({
        code: it.code.trim(),
        name: it.name.trim(),
        rate: it.rate,
        qty: it.qty,
        position: idx,
      })),
      status: targetStatus,
      overrideClosedPeriod,
    };

    setSaving(true);
    try {
      if (!profileId) throw new Error('No active profile');
      await window.api?.saleInvoices.save(profileId, payload);
      window.dispatchEvent(new CustomEvent('invoice:changed'));
      window.dispatchEvent(new CustomEvent('stock:changed'));
      clearSaleHistory();
      resetSaleInvoiceForm();
      navigate('/sale-invoice');
    } catch (err) {
      console.error(err);
      if (isDuplicateInvoiceNumberError(err)) {
        if (!editingId && profileId) {
          const nextNumber =
            await window.api?.saleInvoices.nextNumber(profileId);
          if (nextNumber) {
            updateSaleInvoiceForm({number: nextNumber});
          }
        }
        applyErrors([
          'Invoice number already exists. Please use a unique invoice number.',
        ]);
      } else {
        applyErrors(['Failed to save invoice.']);
      }
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
      key: 'z',
      ctrl: true,
      allowInInput: true,
      enabled: !saving && canUndoSaleHistory,
      handler: () => {
        handleUndo();
      },
    },
    {
      key: 'z',
      meta: true,
      allowInInput: true,
      enabled: !saving && canUndoSaleHistory,
      handler: () => {
        handleUndo();
      },
    },
    {
      key: 'y',
      ctrl: true,
      allowInInput: true,
      enabled: !saving && canRedoSaleHistory,
      handler: () => {
        handleRedo();
      },
    },
    {
      key: 'y',
      meta: true,
      allowInInput: true,
      enabled: !saving && canRedoSaleHistory,
      handler: () => {
        handleRedo();
      },
    },
    {
      key: 'z',
      ctrl: true,
      shift: true,
      allowInInput: true,
      enabled: !saving && canRedoSaleHistory,
      handler: () => {
        handleRedo();
      },
    },
    {
      key: 'z',
      meta: true,
      shift: true,
      allowInInput: true,
      enabled: !saving && canRedoSaleHistory,
      handler: () => {
        handleRedo();
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

  function handleEnableClosedPeriodOverride() {
    if (!editingId || periodStatus !== 'closed') return;

    const confirmed = confirm(
      'Enable closed-period override? This allows direct edits in a closed period.',
    );
    if (!confirmed) return;

    setOverrideClosedPeriod(true);
    setErrors([]);
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
            disabled={isReadOnly}
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
            className="inline-flex items-center gap-2 h-9 px-3 rounded-md bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50 transition-colors text-sm font-medium"
            title="Copy all items (Ctrl+Shift+C)">
            <FiCopy className="size-4" />
            <span>Copy Items</span>
          </button>
        )}

        {/* ✅ Paste Items Button */}
        {hasClipboardItems && (
          <button
            type="button"
            onClick={handlePasteItems}
            className="inline-flex items-center gap-2 h-9 px-3 rounded-md bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50 transition-colors text-sm font-medium"
            title="Paste items (Ctrl+Shift+V)">
            <FiClipboard className="size-4" />
            <span>Paste Items</span>
          </button>
        )}

        {/* ✅ Save Draft Button */}
        <button
          type="button"
          disabled={saving || isReadOnly}
          onClick={(e) => handleSubmit(e as any, 'draft')}
          title="Save draft (Ctrl+S)"
          className="inline-flex items-center gap-2 h-9 px-3 rounded-md bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 transition-colors text-sm font-medium">
          <FiFileText className="size-4" />
          <span>{status === 'draft' ? 'Update Draft' : 'Save Draft'}</span>
        </button>

        <button
          type="button"
          onClick={(e) => handleSubmit(e as any, 'posted')}
          disabled={saving || isReadOnly}
          title="Post invoice (Ctrl+Shift+S)"
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
          onClick={handleCancel}
          disabled={saving}
          title="Cancel (Esc)"
          className="inline-flex items-center gap-2 h-9 px-3 rounded-md border border-neutral-200 hover:bg-neutral-100 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium">
          Cancel
        </button>
      </PageHeader>

      {isReadOnly && (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          This invoice belongs to a closed period. Editing is disabled until the
          period is reopened.
          <div className="mt-3">
            <button
              type="button"
              onClick={handleEnableClosedPeriodOverride}
              className="inline-flex items-center gap-2 h-8 px-3 rounded-md border border-amber-300 bg-white text-amber-800 hover:bg-amber-100"
              title="Explicit override required for closed period edits">
              Enable Override
            </button>
          </div>
        </div>
      )}

      {editingId && periodStatus === 'closed' && overrideClosedPeriod && (
        <div className="mt-4 rounded-md border border-amber-300 bg-amber-100 p-3 text-sm text-amber-900">
          Closed-period override enabled for this edit session.
        </div>
      )}

      <form
        id="sale-invoice-form"
        onSubmit={(e) => handleSubmit(e, 'posted')}
        onKeyDown={preventEnterSubmit}
        className="mt-4 space-y-4">
        <fieldset
          disabled={isReadOnly}
          className={isReadOnly ? 'opacity-75' : ''}>
          <InvoiceHeaderForm
            partyLabel="Customer Name"
            supplierName={form.supplierName}
            setSupplierName={(value) =>
              updateFormFieldWithHistory('supplierName', value)
            }
            address={form.address}
            setAddress={(value) => updateFormFieldWithHistory('address', value)}
            invoiceDate={form.invoiceDate}
            setInvoiceDate={(value) =>
              updateFormFieldWithHistory('invoiceDate', value)
            }
            invoiceNumber={form.number}
            setInvoiceNumber={(value) =>
              updateFormFieldWithHistory('number', value)
            }
            showContact
            contactNo={form.contactNo}
            setContactNo={(value) =>
              updateFormFieldWithHistory('contactNo', value)
            }
            kind="sale"
            editingId={editingId}
          />

          <ItemsEditor
            items={items}
            setItems={setItemsWithHistory}
            inputRows={inputRows}
            setInputRows={setInputRowsWithHistory}
            stockByCode={stockByCode}
            allCodes={allCodes}
            selectedIds={selectedIds}
            setSelectedIds={setSelectedIds}
            codeHeader="Code"
            rateHeader="Rate"
            qtyHeader="Qty"
            rateSource="sale"
          />
        </fieldset>

        {/* Totals now rendered inside ItemsEditor */}
      </form>
    </div>
  );
}
