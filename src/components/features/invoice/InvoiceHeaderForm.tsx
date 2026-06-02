import { useEffect, useRef } from "react";
import { useActiveProfile } from "../../../hooks/useActiveProfile";

type Props = {
  partyLabel: string; // "Seller Name" | "Customer Name"
  supplierName: string;
  setSupplierName: (v: string) => void;

  address: string;
  setAddress: (v: string) => void;

  invoiceDate: string;
  setInvoiceDate: (v: string) => void;

  invoiceIdPerPeriod?: number | null;
  setInvoiceIdPerPeriod?: (v: number | null) => void;

  showContact?: boolean;
  contactNo?: string;
  setContactNo?: (v: string) => void;

  // Optional: used to apply defaults safely
  kind?: "purchase" | "sale";
  editingId?: number;
};

export default function InvoiceHeaderForm({
  partyLabel,
  supplierName,
  setSupplierName,
  address,
  setAddress,
  invoiceDate,
  setInvoiceDate,
  invoiceIdPerPeriod,
  setInvoiceIdPerPeriod,
  showContact,
  contactNo,
  setContactNo,
  kind,
  editingId,
}: Props) {
  const profileId = useActiveProfile();
  const appliedDefaultsRef = useRef(false);

  useEffect(() => {
    // Apply per-profile defaults once on mount if creating new invoice
    if (appliedDefaultsRef.current) return;
    if (!profileId) return;
    if (editingId != null) return; // do not override when editing existing invoice
    try {
      const raw = localStorage.getItem(`settings:${profileId}`);
      if (!raw) return;
      const s = JSON.parse(raw);
      const inferredKind =
        kind ??
        (partyLabel.toLowerCase().includes("seller") ? "purchase" : "sale");
      const isPurchase = inferredKind === "purchase";
      const defaults = isPurchase
        ? s?.purchaseInvoiceDefaults
        : s?.saleInvoiceDefaults;
      if (!defaults) return;

      // Only fill empty fields using provided setters
      if (!supplierName && defaults.supplierName) {
        setSupplierName(defaults.supplierName);
      }
      if (showContact && !contactNo && defaults.contactNo && setContactNo) {
        setContactNo(defaults.contactNo);
      }
      appliedDefaultsRef.current = true;
    } catch (err) {
      console.warn("Failed to apply invoice defaults:", err);
    }
  }, [
    profileId,
    editingId,
    kind,
    partyLabel,
    showContact,
    supplierName,
    contactNo,
    setSupplierName,
    setContactNo,
  ]);

  return (
    <div className="bg-white rounded-md border border-neutral-200 p-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="block text-xs font-semibold mb-1">
            {partyLabel}
          </label>
          <input
            type="text"
            value={supplierName}
            onChange={(e) => setSupplierName(e.target.value)}
            placeholder={partyLabel}
            className="w-full h-9 px-3 rounded border border-neutral-300 text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold mb-1">
            Invoice ID
          </label>
          <input
            aria-label="Invoice ID"
            type="number"
            value={invoiceIdPerPeriod ?? ""}
            onChange={(e) => {
              const raw = e.target.value.trim();
              if (!raw) {
                setInvoiceIdPerPeriod?.(null);
                return;
              }

              const parsed = Number(raw);
              if (Number.isFinite(parsed)) {
                setInvoiceIdPerPeriod?.(Math.max(1, Math.floor(parsed)));
              }
            }}
            placeholder="e.g. 1"
            className="w-full h-9 px-3 rounded border border-neutral-300 text-sm"
            min="1"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold mb-1">
            Invoice Date
          </label>
          <input
            type="date"
            value={invoiceDate}
            onChange={(e) => setInvoiceDate(e.target.value)}
            className="w-full h-9 px-3 rounded border border-neutral-300 text-sm"
          />
        </div>

        {showContact && (
          <div>
            <label className="block text-xs font-semibold mb-1">
              Contact No
            </label>
            <input
              type="text"
              value={contactNo || ""}
              onChange={(e) => setContactNo?.(e.target.value)}
              placeholder="e.g. 0300-1234567"
              className="w-full h-9 px-3 rounded border border-neutral-300 text-sm"
            />
          </div>
        )}

        <div className="md:col-span-2">
          <label className="block text-xs font-semibold mb-1">Address</label>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Address"
            className="w-full h-9 px-3 rounded border border-neutral-300 text-sm"
          />
        </div>
      </div>
    </div>
  );
}
