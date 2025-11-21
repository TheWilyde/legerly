import {useState} from 'react';
import {FiDownload, FiEdit2} from 'react-icons/fi';
import {Link} from 'react-router-dom';
import {useActiveProfile} from '../../../hooks/useActiveProfile';

interface InvoiceActionsProps {
  invoiceId: number;
  invoiceType: 'purchase' | 'sale';
  editUrl: string;
  profileId?: string;
}

export default function InvoiceActions({
  invoiceId,
  invoiceType,
  editUrl,
  profileId,
}: InvoiceActionsProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const activeProfileId = useActiveProfile();
  const effectiveProfileId = profileId || activeProfileId;

  async function handleDownloadPdf(pageSize: 'A4' | 'A5') {
    if (isDownloading) return;

    if (!effectiveProfileId) {
      console.error('No profile ID available for PDF generation');
      return;
    }

    setIsDownloading(true);

    try {
      const api = (window as any).api;
      const saveFn = api?.invoice?.savePdf || api?.print?.saveInvoicePdf;

      if (!saveFn) {
        console.error('Save PDF API not found');
        return;
      }

      await saveFn(effectiveProfileId, invoiceType, invoiceId, pageSize);
    } catch (err) {
      console.error('Failed to save PDF:', err);
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Link
        to={editUrl}
        className="p-1.5 text-neutral-600 hover:bg-neutral-100 rounded-md transition-colors"
        title="Edit">
        <FiEdit2 className="size-4" />
      </Link>

      {/* FIX: Added group/pdf to isolate hover state */}
      <div className="relative group/pdf inline-flex">
        <button
          type="button"
          disabled={isDownloading}
          // FIX: Click defaults to A5
          onClick={() => handleDownloadPdf('A5')}
          className={`inline-flex items-center gap-2 h-8 px-3 rounded-md border transition-colors ${
            isDownloading
              ? 'bg-neutral-50 text-neutral-400 border-neutral-200 cursor-wait'
              : 'border-neutral-200 hover:bg-neutral-100 text-neutral-700'
          }`}
          title="Export PDF">
          {isDownloading ? (
            <span className="size-4 border-2 border-neutral-400 border-t-transparent rounded-full animate-spin" />
          ) : (
            <FiDownload className="size-4" />
          )}
          <span className="text-sm font-medium">PDF</span>
        </button>

        {!isDownloading && (
          // FIX: Use group-hover/pdf to only show when hovering this specific container
          <div className="absolute right-0 top-full mt-1 z-20 hidden group-hover/pdf:block w-24 bg-white border border-neutral-200 rounded-md shadow-lg py-1">
            <button
              type="button"
              onClick={() => handleDownloadPdf('A4')}
              className="block w-full text-left px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50 hover:text-neutral-900">
              A4
            </button>
            <button
              type="button"
              onClick={() => handleDownloadPdf('A5')}
              className="block w-full text-left px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50 hover:text-neutral-900">
              A5
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
