import {Link} from 'react-router-dom';
import {FiDownload} from 'react-icons/fi';

type InvoiceActionsProps = {
  invoiceId: number;
  invoiceType: 'purchase' | 'sale';
  editUrl: string;
};

export default function InvoiceActions({
  invoiceId,
  invoiceType,
  editUrl,
}: InvoiceActionsProps) {
  return (
    <div className="flex items-center justify-between mb-2">
      <div className="font-semibold text-neutral-700">Items summary</div>
      <div className="flex gap-2">
        <Link
          to={editUrl}
          className="inline-flex items-center gap-2 h-8 px-3 rounded-md border border-neutral-200 hover:bg-neutral-100"
          title="Edit invoice">
          Edit
        </Link>

        {/* Export PDF with hover menu */}
        <div className="relative group inline-block pb-1">
          <button
            type="button"
            className="inline-flex items-center gap-2 h-8 px-3 rounded-md border border-neutral-200 bg-white hover:bg-neutral-100"
            title="Export PDF">
            <FiDownload className="size-4" />
            PDF
            <span className="ml-1 text-neutral-500">▾</span>
          </button>
          <div className="absolute left-0 top-full hidden group-hover:block z-10 bg-white border border-neutral-200 rounded-md shadow-md min-w-28">
            <button
              type="button"
              onClick={() =>
                window.api?.print.saveInvoicePdf(invoiceType, invoiceId, 'A4')
              }
              className="block w-full text-left px-3 py-1.5 hover:bg-neutral-50">
              A4
            </button>
            <button
              type="button"
              onClick={() =>
                window.api?.print.saveInvoicePdf(invoiceType, invoiceId, 'A5')
              }
              className="block w-full text-left px-3 py-1.5 hover:bg-neutral-50">
              A5
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
