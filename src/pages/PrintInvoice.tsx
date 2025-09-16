import {useEffect, useMemo, useState} from 'react';
import {useParams, useSearchParams} from 'react-router-dom';

type Kind = 'purchase' | 'sale';
type Line = {id: number; code: string; name: string; rate: number; qty: number};
type Header = {
  id: number;
  number: string;
  supplierName: string;
  address?: string;
  invoiceDate?: string;
  contactNo?: string;
};

export default function PrintInvoice() {
  const {kind, id} = useParams<{kind: Kind; id: string}>();
  const [search] = useSearchParams();
  const pageSize = (search.get('size') === 'A4' ? 'A4' : 'A5') as 'A4' | 'A5';
  const pageWidth = pageSize === 'A4' ? '210mm' : '148mm';
  const [header, setHeader] = useState<Header | null>(null);
  const [items, setItems] = useState<Line[]>([]);

  useEffect(() => {
    (async () => {
      if (!kind || !id) return;
      const invId = Number(id);
      const res =
        kind === 'purchase'
          ? await window.api?.invoices.get(invId)
          : await window.api?.sales.get(invId);
      if (!res) return;

      const inv = (res as any).invoice ?? res;
      const lines = ((res as any).items ?? []) as any[];

      setHeader({
        id: inv.id,
        number: inv.number,
        supplierName: inv.supplierName,
        address: inv.address ?? '',
        // pick from several possible fields
        invoiceDate:
          inv.invoiceDate ?? inv.date ?? inv.billDate ?? inv.createdAt ?? '',
        contactNo: inv.contactNo ?? '',
      });

      setItems(
        lines.map((it) => ({
          id: it.id,
          code: it.code ?? '',
          name: it.name ?? it.itemName ?? '',
          rate: Number(it.rate ?? it.price ?? 0),
          qty: Number(it.qty ?? it.quantity ?? 0),
        }))
      );
    })();
  }, [kind, id]);

  useEffect(() => {
    if (header) {
      const t = setTimeout(() => window.api?.print?.ready?.(), 0);
      return () => clearTimeout(t);
    }
  }, [header]);

  const subtotal = useMemo(
    () => items.reduce((s, it) => s + (it.rate || 0) * (it.qty || 0), 0),
    [items]
  );
  const totalQty = useMemo(
    () => items.reduce((s, it) => s + (it.qty || 0), 0),
    [items]
  );

  // Exactly 2 more rows than actual items
  const emptyRows = 2;

  if (!header) return null;

  return (
    <div className="bg-white">
      {/* A5/A4 page frame */}
      <div className="mx-auto border-4 border-black" style={{width: pageWidth}}>
        {/* Title */}
        <div className="border-b-2 border-black p-3 text-center">
          <h1 className="text-2xl font-bold leading-none">BARTAN MARKAZ</h1>
        </div>

        {/* Section header */}
        <div className="border-b-2 border-black bg-gray-200 p-2 text-center">
          <h2 className="text-lg font-bold leading-none">Details</h2>
        </div>

        {/* Info table */}
        <div className="border-b-2 border-black">
          <table className="w-full text-sm">
            <tbody>
              {/* Seller/Customer + Address on the same line */}
              <tr>
                <td className="p-0" colSpan={3}>
                  <div className="grid grid-cols-2">
                    <div className="p-2">
                      <span className="font-bold mr-2">
                        {kind === 'sale' ? 'CUSTOMER:' : 'SELLER:'}
                      </span>
                      <span>{header.supplierName}</span>
                    </div>
                    {/* Thin center divider between seller and address */}
                    <div className="p-2 border-l border-black">
                      <span className="font-bold mr-2">ADDRESS:</span>
                      <span className="whitespace-pre-wrap">
                        {header.address ?? ''}
                      </span>
                    </div>
                  </div>
                </td>
              </tr>
              {/* Contact below */}
              <tr className="border-t border-black">
                <td className="p-0" colSpan={3}>
                  <div className="p-2">
                    <span className="font-bold mr-2">CONTACT:</span>
                    <span>{header.contactNo ?? ''}</span>
                  </div>
                </td>
              </tr>
              {/* Date + Invoice stays combined */}
              <tr className="border-t border-black">
                <td className="p-0" colSpan={3}>
                  <div className="grid grid-cols-2">
                    <div className="p-2">
                      <span className="font-bold mr-2">DATE:</span>
                      <span>{formatDate(header.invoiceDate)}</span>
                    </div>
                    <div className="p-2 border-l border-black">
                      <span className="font-bold mr-2">INVOICE:</span>
                      <span>{header.number}</span>
                    </div>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Items header */}
        <div className="border-b-2 border-black">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-200">
                <th className="border-r border-black p-2 text-center font-bold w-12">
                  S No
                </th>
                <th className="border-r border-black p-2 text-center font-bold w-20">
                  Code
                </th>
                <th className="border-r border-black p-2 text-center font-bold">
                  Item
                </th>
                <th className="border-r border-black p-2 text-center font-bold w-20">
                  Rate
                </th>
                <th className="border-r border-black p-2 text-center font-bold w-16">
                  QTY
                </th>
                <th className="p-2 text-center font-bold w-24">Amount</th>
              </tr>
            </thead>
          </table>
        </div>

        {/* Items body: actual items + 2 empty rows */}
        <div>
          <table className="w-full text-sm">
            <tbody>
              {items.map((item, idx) => (
                <tr
                  key={item.id}
                  className="border-b border-black last:border-b-0">
                  <td className="border-r border-black p-2 text-center w-12">
                    {idx + 1}
                  </td>
                  <td className="border-r border-black p-2 text-center w-20">
                    {item.code}
                  </td>
                  <td className="border-r border-black p-2">{item.name}</td>
                  <td className="border-r border-black p-2 text-right w-20">
                    {toAmount(item.rate)}
                  </td>
                  <td className="border-r border-black p-2 text-center w-16">
                    {toQty(item.qty)}
                  </td>
                  <td className="p-2 text-right w-24">
                    {toAmount(item.rate * item.qty)}
                  </td>
                </tr>
              ))}
              {Array.from({length: emptyRows}, (_, i) => (
                <tr
                  key={`empty-${i}`}
                  className="border-b border-black last:border-b-0 h-8">
                  <td className="border-r border-black p-2 w-12"></td>
                  <td className="border-r border-black p-2 w-20"></td>
                  <td className="border-r border-black p-2"></td>
                  <td className="border-r border-black p-2 w-20"></td>
                  <td className="border-r border-black p-2 w-16"></td>
                  <td className="p-2 w-24"></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="border-t-2 border-b-2 border-black">
          <table className="w-full text-sm">
            <tbody>
              <tr>
                <td className="p-2 pl-3 font-bold text-right">TOTAL</td>
                <td className="border-l border-black p-2 w-16 text-center">
                  {toQty(totalQty)}
                </td>
                <td className="border-l border-black p-2 text-right w-24">
                  {toAmount(subtotal)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Signature */}
        <div className="p-6">
          <div className="flex justify-end">
            <div className="text-center">
              <div className="font-bold mb-6">SIGNATURE</div>
              <div className="border-b-2 border-black w-40"></div>
            </div>
          </div>
        </div>
      </div>
      {/* Print CSS for A4/A5, minimal margins */}
      <style>{`
        @page { size: ${pageSize}; margin: 6mm; }
        html, body, #root { background: #ffffff; }
        * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      `}</style>
    </div>
  );
}

function formatDate(d?: string | number | Date) {
  if (d == null) return '';
  // Date instance
  if (d instanceof Date) {
    if (isNaN(d.getTime())) return '';
    return fmt(d);
  }
  // Epoch number
  if (typeof d === 'number') {
    const dt = new Date(d);
    return isNaN(dt.getTime()) ? '' : fmt(dt);
  }
  // String handling
  const raw = String(d).trim();
  if (!raw) return '';
  // Try native parse first
  let t = Date.parse(raw);
  if (!Number.isFinite(t)) {
    // Handle dd-MM-yyyy or dd/MM/yyyy
    const m = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (m) {
      const [, dd, mm, yyyy] = m;
      const y = yyyy.length === 2 ? Number(`20${yyyy}`) : Number(yyyy);
      t = Date.parse(
        `${y}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}T00:00:00`
      );
    }
  }
  if (!Number.isFinite(t)) {
    // Show the raw value if we still can't parse
    return raw;
  }
  return fmt(new Date(t));

  function fmt(dt: Date) {
    const day = String(dt.getDate()).padStart(2, '0');
    const mon = dt.toLocaleString('en-US', {month: 'short'});
    const year = dt.getFullYear();
    return `${day}/${mon}/${year}`;
  }
}
function toAmount(n: number) {
  return (Number(n) || 0).toFixed(2);
}
function toQty(n: number) {
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
}
