import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  FiSave,
  FiTrash2,
  FiFileText,
  FiCopy,
  FiClipboard,
} from "react-icons/fi"; // ✅ Added FiCopy and FiClipboard
import type React from "react";
import InvoiceHeaderForm from "../components/features/invoice/InvoiceHeaderForm";
import ItemsEditor from "../components/features/invoice/ItemsEditor";
import PageHeader from "../components/common/PageHeader";
import { useActiveProfile } from "../hooks/useActiveProfile";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { useUndoRedoHistory } from "../hooks/useUndoRedoHistory";
import { useAppStore } from "../stores/appStore";
import { emitAppFeedback } from "../utils/feedback";
import { usePeriod } from "../contexts/PeriodContext";

export default function PurchaseInvoiceCreate() {
  const navigate = useNavigate();
  const params = useParams<{ id?: string }>();
  const editingId = params.id ? Number(params.id) : undefined;

  const profileId = useActiveProfile();
  const { invoiceForms, updatePurchaseInvoiceForm, resetPurchaseInvoiceForm } =
    useAppStore();

  const form = invoiceForms.purchase;
  const { editingPeriod, setEditingPeriod } = usePeriod();

  // Redirect if no profile
  useEffect(() => {
    if (!profileId) navigate("/welcome");
  }, [profileId, navigate]);

  const [saving, setSaving] = useState(false);
  const [, setErrors] = useState<string[]>([]);
  const [status, setStatus] = useState<"draft" | "posted">("posted"); // ✅ Added status state
  const [periodStatus, setPeriodStatus] = useState<"active" | "closed">(
    "active",
  );
  const [invoiceNumberReadOnly, setInvoiceNumberReadOnly] =
    useState(!editingId);
  const [overrideClosedPeriod, setOverrideClosedPeriod] = useState(false);
  const isReadOnly = Boolean(
    editingId && periodStatus === "closed" && !overrideClosedPeriod,
  );

  const [stockByCode, setStockByCode] = useState<
    Map<string, { name: string; purchaseRate: number; saleRate: number }>
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
    { id: -1, code: "", name: "", rate: "", qty: "" }, // ✅ Include name field
  ]);

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const hydratedDraftProfileRef = useRef<string | null>(null);

  const applyErrors = useCallback((nextErrors: string[]) => {
    setErrors(nextErrors);
    if (nextErrors.length > 0) {
      emitAppFeedback("error", nextErrors[0]);
    }
  }, []);

  type PurchaseFormSnapshot = {
    supplierName: string;
    contactNo: string;
    address: string;
    invoiceDate: string;
    number: string;
  };
  type PurchaseInvoiceHistorySnapshot = {
    form: PurchaseFormSnapshot;
    items: Item[];
    inputRows: InputRow[];
  };

  const {
    record: recordPurchaseHistory,
    undo: undoPurchaseHistory,
    redo: redoPurchaseHistory,
    clear: clearPurchaseHistory,
    canUndo: canUndoPurchaseHistory,
    canRedo: canRedoPurchaseHistory,
  } = useUndoRedoHistory<PurchaseInvoiceHistorySnapshot>({ limit: 300 });

  const makeFormSnapshot = useCallback(
    (): PurchaseFormSnapshot => ({
      supplierName: form.supplierName ?? "",
      contactNo: form.contactNo ?? "",
      address: form.address ?? "",
      invoiceDate: form.invoiceDate ?? "",
      number: form.number ?? "",
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
    (overrides?: Partial<PurchaseInvoiceHistorySnapshot>) => ({
      form: overrides?.form ?? makeFormSnapshot(),
      items: overrides?.items ?? items,
      inputRows: overrides?.inputRows ?? inputRows,
    }),
    [makeFormSnapshot, items, inputRows],
  );

  const applyHistorySnapshot = useCallback(
    (snapshot: PurchaseInvoiceHistorySnapshot) => {
      updatePurchaseInvoiceForm({ ...snapshot.form });
      setItems(snapshot.items);
      setInputRows(
        snapshot.inputRows.length > 0
          ? snapshot.inputRows
          : [{ id: -Date.now(), code: "", name: "", rate: "", qty: "" }],
      );
      setSelectedIds(new Set());
    },
    [updatePurchaseInvoiceForm],
  );

  const setItemsWithHistory = useCallback(
    (updater: ((prev: Item[]) => Item[]) | Item[]) => {
      setItems((prev) => {
        const next =
          typeof updater === "function"
            ? (updater as (prev: Item[]) => Item[])(prev)
            : updater;

        if (next === prev) return prev;

        recordPurchaseHistory(
          makeHistorySnapshot({
            items: prev,
          }),
        );

        return next;
      });
    },
    [recordPurchaseHistory, makeHistorySnapshot],
  );

  const setInputRowsWithHistory = useCallback(
    (updater: ((prev: InputRow[]) => InputRow[]) | InputRow[]) => {
      setInputRows((prev) => {
        const next =
          typeof updater === "function"
            ? (updater as (prev: InputRow[]) => InputRow[])(prev)
            : updater;

        if (next === prev) return prev;

        recordPurchaseHistory(
          makeHistorySnapshot({
            inputRows: prev,
          }),
        );

        return next;
      });
    },
    [recordPurchaseHistory, makeHistorySnapshot],
  );

  const updateFormFieldWithHistory = useCallback(
    (field: keyof PurchaseFormSnapshot, value: string) => {
      const current = (form[field] ?? "") as string;
      if (current === value) return;

      recordPurchaseHistory(makeHistorySnapshot());
      updatePurchaseInvoiceForm({ [field]: value } as Partial<typeof form>);
    },
    [
      form,
      recordPurchaseHistory,
      makeHistorySnapshot,
      updatePurchaseInvoiceForm,
    ],
  );

  const handleUndo = useCallback(() => {
    const previous = undoPurchaseHistory(makeHistorySnapshot());
    if (!previous) return;
    applyHistorySnapshot(previous);
  }, [undoPurchaseHistory, makeHistorySnapshot, applyHistorySnapshot]);

  const handleRedo = useCallback(() => {
    const next = redoPurchaseHistory(makeHistorySnapshot());
    if (!next) return;
    applyHistorySnapshot(next);
  }, [redoPurchaseHistory, makeHistorySnapshot, applyHistorySnapshot]);

  const computedTotal = useMemo(
    () => items.reduce((sum, it) => sum + it.rate * it.qty, 0),
    [items],
  );

  const [hasClipboardItems, setHasClipboardItems] = useState(
    () => !!localStorage.getItem("legerly_invoice_items_clipboard"),
  );

  const loadStockMap = useCallback(async () => {
    if (!profileId) return;

    const stock = await window.api?.stock.list(profileId);
    if (!stock) return;

    const map = new Map<
      string,
      { name: string; purchaseRate: number; saleRate: number }
    >();
    for (const s of stock) {
      const code = String(s.code ?? "")
        .trim()
        .toUpperCase();
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
    const handleStorage = () =>
      setHasClipboardItems(
        !!localStorage.getItem("legerly_invoice_items_clipboard"),
      );
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  useEffect(() => {
    if (!profileId) return;

    const handleStockChanged = () => {
      void loadStockMap();
    };

    window.addEventListener("stock:changed", handleStockChanged);
    return () =>
      window.removeEventListener("stock:changed", handleStockChanged);
  }, [loadStockMap, profileId]);

  function handleCopyItems() {
    const payload: ClipboardItem[] = items
      .map((it) => ({
        code: it.code.trim().toUpperCase(),
        qty: Number(it.qty),
      }))
      .filter((it) => Boolean(it.code) && Number.isFinite(it.qty));

    localStorage.setItem(
      "legerly_invoice_items_clipboard",
      JSON.stringify(payload),
    );
    window.dispatchEvent(new Event("storage"));
    setHasClipboardItems(true);
  }

  function handlePasteItems() {
    try {
      const txt = localStorage.getItem("legerly_invoice_items_clipboard");
      if (!txt) return;

      const parsed: unknown = JSON.parse(txt);
      if (!Array.isArray(parsed)) return;

      const now = Date.now();
      const pasted = parsed
        .map((raw, i): Item | null => {
          if (!raw || typeof raw !== "object") return null;

          const item = raw as { code?: unknown; qty?: unknown };
          const code =
            typeof item.code === "string" ? item.code.trim().toUpperCase() : "";
          const qty = Number(item.qty);

          if (!code || !Number.isFinite(qty) || qty <= 0) return null;

          const stock = stockByCode.get(code);

          return {
            id: now + i + Math.random(),
            code,
            name: stock?.name ?? "",
            rate: Number(stock?.purchaseRate ?? 0),
            qty,
          };
        })
        .filter((row): row is Item => row !== null);

      if (pasted.length === 0) return;

      setItemsWithHistory((prev) => [...prev, ...pasted]);
    } catch (e) {
      console.error("Failed to paste items", e);
    }
  }

  useEffect(() => {
    if (editingId) {
      hydratedDraftProfileRef.current = null;
      setOverrideClosedPeriod(false);
      setInvoiceNumberReadOnly(false);
      setEditingPeriod(null);
      return;
    }

    setInvoiceNumberReadOnly(true);
  }, [editingId, setEditingPeriod]);

  useEffect(() => {
    if (editingId || !profileId) return;
    if (hydratedDraftProfileRef.current === profileId) return;

    hydratedDraftProfileRef.current = profileId;

    const restored = (form.items ?? []).map((it, idx) => ({
      id:
        typeof (it as { id?: unknown }).id === "number" &&
        Number.isFinite((it as { id?: number }).id)
          ? ((it as { id?: number }).id as number)
          : Date.now() + idx + Math.random(),
      code: String(it.code ?? ""),
      name: String(it.name ?? ""),
      rate: Number(it.rate ?? 0),
      qty: Number(it.qty ?? 0),
    }));

    setItems(restored);
    setInputRows([{ id: -Date.now(), code: "", name: "", rate: "", qty: "" }]);
    setSelectedIds(new Set());
    clearPurchaseHistory();
  }, [editingId, form.items, profileId, clearPurchaseHistory]);

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
    if (!profileId) return;
    void loadStockMap();
  }, [profileId, loadStockMap]);

  useEffect(() => {
    if (!profileId || !editingId) return;

    (async () => {
      const data = await window.api?.invoices.get(profileId, editingId);
      if (!data) return;

      updatePurchaseInvoiceForm({
        supplierName: data.invoice.supplierName ?? "",
        contactNo: data.invoice.contactNo ?? "",
        address: data.invoice.address ?? "",
        invoiceDate: data.invoice.invoiceDate ?? "",
        number: data.invoice.number ?? "",
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
      setStatus(data.invoice.status || "posted");
      setPeriodStatus((data.invoice as any).periodStatus || "active");
      setOverrideClosedPeriod(false);
      setInvoiceNumberReadOnly(
        typeof data.invoice.invoiceSequence === "number" &&
          Number.isFinite(data.invoice.invoiceSequence),
      );
      setEditingPeriod(data.invoice.periodId ?? null);
      clearPurchaseHistory();
    })();
  }, [
    profileId,
    editingId,
    updatePurchaseInvoiceForm,
    clearPurchaseHistory,
    setEditingPeriod,
  ]);

  useEffect(() => {
    if (!profileId || editingId || form.number) return;

    (async () => {
      const periodId = editingPeriod?.id ?? null;
      const nextNumber = await window.api?.invoices.nextNumber(
        profileId,
        periodId,
      );
      if (!form.number) {
        updatePurchaseInvoiceForm({ number: nextNumber || "1" });
        clearPurchaseHistory();
      }
    })();
  }, [
    profileId,
    editingId,
    form.number,
    editingPeriod?.id,
    updatePurchaseInvoiceForm,
    clearPurchaseHistory,
  ]);

  function handleDeleteSelected() {
    if (isReadOnly) return;
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    recordPurchaseHistory(makeHistorySnapshot());
    setItems((prev) => prev.filter((i) => !ids.includes(i.id)));
    setInputRows((prev) => {
      const kept = prev.filter((r) => !ids.includes(r.id));
      return kept.length === 0
        ? [{ id: -Date.now(), code: "", name: "", rate: "", qty: "" }]
        : kept;
    });
    setSelectedIds(new Set());
  }

  function handleAddRowShortcut() {
    recordPurchaseHistory(makeHistorySnapshot());
    setInputRows((prev) => [
      ...prev,
      {
        id: -(Date.now() + prev.length + 1),
        code: "",
        name: "",
        rate: "",
        qty: "",
      },
    ]);
  }

  function handleCancel() {
    clearPurchaseHistory();
    resetPurchaseInvoiceForm();
    navigate("/purchase-invoice");
  }

  function preventEnterSubmit(e: React.KeyboardEvent<HTMLFormElement>) {
    if (e.key === "Enter") e.preventDefault();
  }

  function validate(): string[] {
    const errs: string[] = [];
    if (!form.supplierName?.trim()) errs.push("Supplier name is required.");
    if (!invoiceNumberReadOnly && !form.number?.trim()) {
      errs.push("Invoice number is required.");
    }
    if (!form.invoiceDate?.trim()) errs.push("Invoice date is required.");
    if (form.invoiceDate && isNaN(Date.parse(form.invoiceDate))) {
      errs.push("Invoice date is invalid.");
    }
    if (items.length === 0) errs.push("At least one item is required.");
    items.forEach((it, i) => {
      if (!it.code.trim()) errs.push(`Item ${i + 1}: code required.`);
      if (!it.name.trim()) errs.push(`Item ${i + 1}: name required.`);
      if (!(it.rate > 0)) errs.push(`Item ${i + 1}: rate must be > 0.`);
      if (!(it.qty > 0)) errs.push(`Item ${i + 1}: qty must be > 0.`);
    });
    return errs;
  }

  function isDuplicateInvoiceNumberError(error: unknown): boolean {
    const err = error as { code?: string; message?: string } | undefined;
    const message = String(err?.message ?? "").toLowerCase();
    return (
      String(err?.code ?? "") === "DUPLICATE_INVOICE_NUMBER" ||
      (message.includes("invoice number") && message.includes("already exists"))
    );
  }

  async function handleSubmit(
    e: React.FormEvent,
    targetStatus: "draft" | "posted",
  ) {
    e.preventDefault();
    if (isReadOnly) {
      applyErrors([
        "Closed period invoices are read-only. Reopen the period to edit.",
      ]);
      return;
    }
    if (saving || !profileId) return;

    const number = (form.number || "").trim();
    const invoiceDate = form.invoiceDate?.trim() || "";
    const errs = validate();
    if (errs.length) {
      applyErrors(errs);
      return;
    }

    setSaving(true);
    setErrors([]);

    try {
      const payload = {
        id: editingId,
        number,
        supplierName: form.supplierName.trim(),
        contactNo: form.contactNo.trim() || undefined,
        address: form.address.trim(),
        invoiceDate,
        total: computedTotal,
        items: items.map((it, idx) => ({
          code: it.code.trim(),
          name: it.name.trim(),
          rate: it.rate,
          qty: it.qty,
          position: idx,
        })),
        periodId: editingPeriod?.id,
        status: targetStatus,
        overrideClosedPeriod,
      };

      await window.api?.invoices.save(profileId, payload);
      window.dispatchEvent(new CustomEvent("invoice:changed"));
      window.dispatchEvent(new CustomEvent("stock:changed"));
      clearPurchaseHistory();
      resetPurchaseInvoiceForm();
      navigate("/purchase-invoice");
    } catch (err) {
      console.error(err);
      if (isDuplicateInvoiceNumberError(err)) {
        if (!editingId) {
          const periodId = editingPeriod?.id ?? null;
          const nextNumber = await window.api?.invoices.nextNumber(
            profileId,
            periodId,
          );
          if (nextNumber) {
            updatePurchaseInvoiceForm({ number: nextNumber });
          }
        }
        applyErrors([
          "Invoice number already exists. Please use a unique invoice number.",
        ]);
      } else {
        applyErrors(["Failed to save invoice"]);
      }
    } finally {
      setSaving(false);
    }
  }

  useKeyboardShortcuts([
    {
      key: "s",
      ctrl: true,
      allowInInput: true,
      enabled: !saving,
      handler: (event) => {
        void handleSubmit(event as unknown as React.FormEvent, "draft");
      },
    },
    {
      key: "s",
      ctrl: true,
      shift: true,
      allowInInput: true,
      enabled: !saving,
      handler: (event) => {
        void handleSubmit(event as unknown as React.FormEvent, "posted");
      },
    },
    {
      key: "Enter",
      ctrl: true,
      allowInInput: true,
      enabled: !saving,
      handler: (event) => {
        void handleSubmit(event as unknown as React.FormEvent, "posted");
      },
    },
    {
      key: "z",
      ctrl: true,
      allowInInput: true,
      enabled: !saving && canUndoPurchaseHistory,
      handler: () => {
        handleUndo();
      },
    },
    {
      key: "z",
      meta: true,
      allowInInput: true,
      enabled: !saving && canUndoPurchaseHistory,
      handler: () => {
        handleUndo();
      },
    },
    {
      key: "y",
      ctrl: true,
      allowInInput: true,
      enabled: !saving && canRedoPurchaseHistory,
      handler: () => {
        handleRedo();
      },
    },
    {
      key: "y",
      meta: true,
      allowInInput: true,
      enabled: !saving && canRedoPurchaseHistory,
      handler: () => {
        handleRedo();
      },
    },
    {
      key: "z",
      ctrl: true,
      shift: true,
      allowInInput: true,
      enabled: !saving && canRedoPurchaseHistory,
      handler: () => {
        handleRedo();
      },
    },
    {
      key: "z",
      meta: true,
      shift: true,
      allowInInput: true,
      enabled: !saving && canRedoPurchaseHistory,
      handler: () => {
        handleRedo();
      },
    },
    {
      key: "Escape",
      allowInInput: true,
      enabled: !saving,
      handler: () => {
        handleCancel();
      },
    },
    {
      key: "c",
      ctrl: true,
      shift: true,
      allowInInput: true,
      enabled: items.length > 0,
      handler: () => {
        handleCopyItems();
      },
    },
    {
      key: "v",
      ctrl: true,
      shift: true,
      allowInInput: true,
      enabled: hasClipboardItems,
      handler: () => {
        handlePasteItems();
      },
    },
    {
      key: "n",
      alt: true,
      allowInInput: true,
      enabled: !saving,
      handler: () => {
        handleAddRowShortcut();
      },
    },
    {
      key: "Delete",
      alt: true,
      enabled: selectedIds.size > 0,
      handler: () => {
        handleDeleteSelected();
      },
    },
  ]);

  function handleEnableClosedPeriodOverride() {
    if (!editingId || periodStatus !== "closed") return;

    const confirmed = confirm(
      "Enable closed-period override? This allows direct edits in a closed period.",
    );
    if (!confirmed) return;

    setOverrideClosedPeriod(true);
    setErrors([]);
  }

  return (
    <div className="h-full flex flex-col bg-neutral-50">
      <form
        onSubmit={(e) => handleSubmit(e, "posted")}
        onKeyDown={preventEnterSubmit}
      >
        <PageHeader
          title={
            editingId
              ? status === "draft"
                ? "Edit Draft Invoice"
                : "Edit Purchase Invoice"
              : "New Purchase Invoice"
          }
        >
          <div className="flex items-center gap-2">
            {/* ✅ Replace IconButton with inline button */}
            {selectedIds.size > 0 && (
              <button
                type="button"
                onClick={handleDeleteSelected}
                disabled={isReadOnly}
                className="inline-flex items-center gap-2 h-9 px-3 rounded-md border border-red-200 text-red-700 hover:bg-red-50"
                title="Delete selected items (Alt+Delete)"
              >
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
                title="Copy all items (Ctrl+Shift+C)"
              >
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
                title="Paste items (Ctrl+Shift+V)"
              >
                <FiClipboard className="size-4" />
                Paste Items
              </button>
            )}

            {/* ✅ Save Draft Button */}
            <button
              type="button"
              disabled={saving || isReadOnly}
              onClick={(e) => handleSubmit(e as any, "draft")}
              title="Save draft (Ctrl+S)"
              className="px-4 py-2 rounded-md bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50 flex items-center gap-2 text-sm font-medium transition-colors"
            >
              <FiFileText className="size-4" />
              {status === "draft" ? "Update Draft" : "Save Draft"}
            </button>

            <button
              type="submit"
              disabled={saving || isReadOnly}
              title="Post invoice (Ctrl+Shift+S)"
              className="px-4 py-2 rounded-md bg-neutral-900 text-white hover:bg-neutral-800 flex items-center gap-2 text-sm font-medium transition-colors shadow-sm"
            >
              <FiSave className="size-4" />
              {saving
                ? "Saving..."
                : status === "draft"
                  ? "Post Invoice"
                  : "Save Invoice"}
            </button>

            <button
              type="button"
              onClick={handleCancel}
              title="Cancel (Esc)"
              className="px-3 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100 rounded-md"
            >
              Cancel
            </button>
          </div>
        </PageHeader>

        {isReadOnly && (
          <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            This invoice belongs to a closed period. Editing is disabled until
            the period is reopened.
            <div className="mt-3">
              <button
                type="button"
                onClick={handleEnableClosedPeriodOverride}
                className="inline-flex items-center gap-2 h-8 px-3 rounded-md border border-amber-300 bg-white text-amber-800 hover:bg-amber-100"
                title="Explicit override required for closed period edits"
              >
                Enable Override
              </button>
            </div>
          </div>
        )}

        {editingId && periodStatus === "closed" && overrideClosedPeriod && (
          <div className="mt-4 rounded-md border border-amber-300 bg-amber-100 p-3 text-sm text-amber-900">
            Closed-period override enabled for this edit session.
          </div>
        )}

        <fieldset
          disabled={isReadOnly}
          className={isReadOnly ? "opacity-75" : ""}
        >
          <InvoiceHeaderForm
            partyLabel="Seller Name"
            supplierName={form.supplierName}
            setSupplierName={(value) =>
              updateFormFieldWithHistory("supplierName", value)
            }
            address={form.address}
            setAddress={(value) => updateFormFieldWithHistory("address", value)}
            invoiceDate={form.invoiceDate}
            setInvoiceDate={(value) =>
              updateFormFieldWithHistory("invoiceDate", value)
            }
            invoiceNumber={form.number}
            setInvoiceNumber={(value) =>
              updateFormFieldWithHistory("number", value)
            }
            kind="purchase"
            editingId={editingId}
            invoiceNumberReadOnly={invoiceNumberReadOnly}
            showContact
            contactNo={form.contactNo}
            setContactNo={(value) =>
              updateFormFieldWithHistory("contactNo", value)
            }
          />

          <ItemsEditor
            items={items}
            setItems={setItemsWithHistory}
            inputRows={inputRows}
            setInputRows={setInputRowsWithHistory}
            stockByCode={stockByCode}
            allCodes={Array.from(stockByCode.keys()).sort()}
            selectedIds={selectedIds}
            setSelectedIds={setSelectedIds}
            codeHeader="Code"
            rateHeader="Rate"
            qtyHeader="Qty"
            rateSource="purchase"
          />
        </fieldset>
      </form>
    </div>
  );
}
