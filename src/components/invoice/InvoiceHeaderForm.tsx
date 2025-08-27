type Props = {
  partyLabel: string; // "Seller Name" | "Customer Name"
  supplierName: string;
  setSupplierName: (v: string) => void;
  address: string;
  setAddress: (v: string) => void;
  invoiceDate: string;
  setInvoiceDate: (v: string) => void;
  invoiceNumber: string;
  setInvoiceNumber: (v: string) => void;
  showContact?: boolean;
  contactNo?: string;
  setContactNo?: (v: string) => void;
};

function formatDateToDDMMMYYYY(value: string) {
  if (!value) return '';
  const [y, m, d] = value.split('-');
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  return `${d}-${months[Number(m) - 1]}-${y}`;
}

export default function InvoiceHeaderForm({
  partyLabel,
  supplierName,
  setSupplierName,
  address,
  setAddress,
  invoiceDate,
  setInvoiceDate,
  invoiceNumber,
  setInvoiceNumber,
  showContact,
  contactNo,
  setContactNo,
}: Props) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white p-4 rounded-md">
      <label className="flex flex-col gap-1">
        <span className="text-base text-neutral-800">{partyLabel}</span>
        <input
          className="h-9 rounded-md border border-neutral-300 px-2"
          value={supplierName}
          onChange={(e) => setSupplierName(e.target.value)}
          required
        />
      </label>

      {showContact && (
        <label className="flex flex-col gap-1">
          <span className="text-base text-neutral-800">Contact No</span>
          <input
            type="tel"
            className="h-9 rounded-md border border-neutral-300 px-2"
            value={contactNo ?? ''}
            onChange={(e) => setContactNo?.(e.target.value)}
          />
        </label>
      )}

      <label className="flex flex-col gap-1 md:col-span-2">
        <span className="text-base text-neutral-800">Address</span>
        <input
          type="text"
          className="h-9 rounded-md border border-neutral-300 px-2 py-2 resize-none"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-base text-neutral-800">Invoice Date</span>
        <input
          type="date"
          className="h-9 rounded-md border border-neutral-300 px-2"
          value={invoiceDate}
          onChange={(e) => setInvoiceDate(e.target.value)}
        />
        {invoiceDate && (
          <span className="text-xs text-neutral-500">
            {formatDateToDDMMMYYYY(invoiceDate)}
          </span>
        )}
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-base text-neutral-800">Invoice #</span>
        <input
          className="h-9 rounded-md border border-neutral-300 px-2"
          value={invoiceNumber}
          onChange={(e) => setInvoiceNumber(e.target.value)}
        />
      </label>
    </div>
  );
}
