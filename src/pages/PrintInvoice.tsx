import {useEffect, useState} from 'react';
import {useParams} from 'react-router-dom';
import {formatInvoiceDate} from '../utils/invoiceUtils';

export default function PrintInvoice() {
  const {kind, id} = useParams();
  const [invoiceData, setInvoiceData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const api = (window as any).api;
        const params = new URLSearchParams(window.location.hash.split('?')[1]);
        const profileId = params.get('profileId');

        if (!kind || !id) {
          throw new Error('Missing parameters');
        }

        const data = await api.invoice.getPrintData(
          profileId,
          kind,
          Number(id)
        );
        setInvoiceData(data);
      } catch (err: any) {
        console.error('Failed to load invoice print data:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [kind, id]);

  if (loading) return <div className="p-8">Loading invoice...</div>;
  if (error) {
    const params = new URLSearchParams(window.location.hash.split('?')[1]);
    const profileId = params.get('profileId');
    return (
      <div className="p-8 text-red-600">
        <h1 className="text-xl font-bold mb-2">Error Generating PDF</h1>
        <p className="font-mono text-sm">{error}</p>
        <div className="mt-4 text-xs text-gray-500">
          Debug Info: Kind={kind}, ID={id}, Profile={profileId}
        </div>
      </div>
    );
  }

  if (!invoiceData || !invoiceData.invoice) {
    return (
      <div className="p-8 font-sans text-red-600">
        Invoice data is incomplete.
      </div>
    );
  }

  const {invoice, items} = invoiceData;

  // Calculate totals
  const totalQty = items.reduce(
    (sum: number, item: any) => sum + (Number(item.qty) || 0),
    0
  );
  const totalRate = items.reduce(
    (sum: number, item: any) => sum + (Number(item.rate) || 0),
    0
  );

  const name =
    invoice.supplierName || (invoice as any).customerName || 'Walk-in Customer';

  // Handle optional fields gracefully
  const address = invoice.address;
  const phone = (invoice as any).contactNo;

  // Determine Title
  const invoiceTitle =
    kind === 'purchase' ? 'PURCHASE INVOICE' : 'SALE INVOICE';

  return (
    <div className="p-8 max-w-[210mm] mx-auto bg-white min-h-screen text-black font-sans">
      {/* Header Section */}
      <div className="flex justify-between items-start mb-6 border-b-2 border-black pb-4">
        <div className="max-w-[60%]">
          {/* FIX: Dynamic Title based on kind */}
          <h1 className="text-3xl font-bold uppercase tracking-wider mb-3">
            {invoiceTitle}
          </h1>

          <div className="text-sm leading-snug space-y-1">
            <p className="font-bold text-lg">{name}</p>

            {/* FIX: Explicitly render Address and Phone with labels if they exist */}
            {address && address !== 'NA' && (
              <p className="text-black/90">
                <span className="font-semibold mr-1">Address:</span>
                {address}
              </p>
            )}

            {phone && phone !== 'NA' && (
              <p className="text-black/90">
                <span className="font-semibold mr-1">Phone:</span>
                {phone}
              </p>
            )}
          </div>
        </div>

        <div className="text-right">
          <div className="mb-1">
            <span className="font-bold uppercase text-xs mr-3 tracking-wide">
              Invoice #
            </span>
            <span className="font-mono text-lg font-bold">
              {invoice.number}
            </span>
          </div>
          <div>
            <span className="font-bold uppercase text-xs mr-3 tracking-wide">
              Date
            </span>
            <span className="font-medium">
              {formatInvoiceDate(invoice.invoiceDate) || 'N/A'}
            </span>
          </div>
        </div>
      </div>

      {/* Table Section */}
      <table className="w-full mb-8 text-sm border-collapse">
        <thead>
          <tr className="border-b-2 border-black">
            <th className="text-left py-2 font-bold uppercase tracking-wider text-xs">
              Item Description
            </th>
            <th className="text-right py-2 font-bold uppercase tracking-wider text-xs w-16">
              Qty
            </th>
            <th className="text-right py-2 font-bold uppercase tracking-wider text-xs w-24">
              Rate
            </th>
            <th className="text-right py-2 font-bold uppercase tracking-wider text-xs w-28">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item: any, i: number) => (
            <tr key={i} className="border-b border-gray-300">
              <td className="py-1.5 align-top">
                <div className="font-medium text-black">{item.name}</div>
              </td>
              <td className="text-right py-1.5 align-top text-black">
                {item.qty}
              </td>
              <td className="text-right py-1.5 align-top text-black">
                {Number(item.rate).toLocaleString()}
              </td>
              <td className="text-right py-1.5 align-top font-bold text-black">
                {(Number(item.qty) * Number(item.rate)).toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          {/* Totals Row */}
          <tr className="border-t-2 border-black font-bold text-black">
            <td className="text-right py-3 pr-4 uppercase text-xs tracking-wider">
              Totals:
            </td>
            <td className="text-right py-3">{totalQty}</td>
            <td className="text-right py-3">{totalRate.toLocaleString()}</td>
            <td className="text-right py-3 text-base">
              {Number(invoice.total).toLocaleString()}
            </td>
          </tr>
        </tfoot>
      </table>

      {/* Footer Section */}
      <div className="mt-8 pt-4 border-t border-black">
        <div className="flex justify-between items-center">
          <div className="text-xs text-black/70">
            {/* FIX: Updated Brand Name */}
            <p>Generated by Legerly</p>
            <p>{new Date().toLocaleString()}</p>
          </div>
          <div className="text-sm font-bold uppercase tracking-wide">
            Thank you for your business!
          </div>
        </div>
      </div>
    </div>
  );
}
