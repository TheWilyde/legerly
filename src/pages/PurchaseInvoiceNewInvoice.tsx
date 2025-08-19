import {useState, useEffect} from 'react';
import {useNavigate} from 'react-router-dom';
import {FiSave} from 'react-icons/fi';

export default function PurchaseInvoiceCreate() {
  const navigate = useNavigate();
  const [supplierName, setSupplierName] = useState(''); // Seller name
  const [contactNo, setContactNo] = useState('');
  const [address, setAddress] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(''); // yyyy-MM-dd for input type=date
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [total, setTotal] = useState<number>(0);

  useEffect(() => {
    (async () => {
      try {
        const list = await window.api?.invoices.list();
        if (!invoiceNumber) {
          setInvoiceNumber(String((list?.length ?? 0) + 1));
        }
      } catch {}
    })();
  }, []);

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // For now, backend expects supplierName + total + number.
    await window.api?.invoices.create({
      supplierName,
      total,
      number: invoiceNumber,
    });
    navigate('/purchase-invoice');
  }

  return (
    <div>
      <header className="bg-white shadow px-4 py-3 rounded-md">
        <h1 className="text-xl font-semibold">New Purchase Invoice</h1>
      </header>

      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white p-4 rounded-md">
          <label className="flex flex-col gap-1">
            <span className="text-base text-neutral-800">Seller Name</span>
            <input
              className="h-9 rounded-md border border-neutral-300 px-2"
              value={supplierName}
              onChange={(e) => setSupplierName(e.target.value)}
              required
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-base text-neutral-800">Contact No</span>
            <input
              type="tel"
              className="h-9 rounded-md border border-neutral-300 px-2"
              value={contactNo}
              onChange={(e) => setContactNo(e.target.value)}
            />
          </label>

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

          <label className="flex flex-col gap-1">
            <span className="text-base text-neutral-800">Total</span>
            <input
              type="number"
              min={0}
              step="0.01"
              className="h-9 rounded-md border border-neutral-300 px-2"
              value={total}
              onChange={(e) => setTotal(Number(e.target.value))}
              required
            />
          </label>
        </div>

        <div className="flex gap-2">
          <button
            type="submit"
            className="inline-flex items-center gap-2 h-9 px-3 rounded-md bg-neutral-900 text-white hover:bg-neutral-800">
            <FiSave className="size-4" />
            <span>Save Invoice</span>
          </button>
          <button
            type="button"
            className="h-9 px-3 rounded-md border border-neutral-200 hover:bg-neutral-100"
            onClick={() => navigate('/purchase-invoice')}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
