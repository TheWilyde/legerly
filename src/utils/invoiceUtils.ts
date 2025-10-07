/**
 * Extract numeric value from invoice number for sorting
 */
export function invoiceNumberValue(invoiceNumber: string): number {
  const digits = invoiceNumber.replace(/\D+/g, '');
  return digits ? parseInt(digits, 10) : NaN;
}

/**
 * Sort invoices by invoice number (numeric then alphabetic)
 */
export function sortByInvoiceNumber<T extends {number: string}>(
  a: T,
  b: T
): number {
  const an = invoiceNumberValue(a.number);
  const bn = invoiceNumberValue(b.number);

  if (Number.isFinite(an) && Number.isFinite(bn)) {
    if (an !== bn) return an - bn;
    return a.number.localeCompare(b.number);
  }
  return a.number.localeCompare(b.number);
}

/**
 * Format date as DD/MMM/YYYY
 */
export function formatInvoiceDate(dateString?: string): string {
  if (!dateString) return '';

  const dt = new Date(dateString);
  const day = String(dt.getDate()).padStart(2, '0');
  const month = dt.toLocaleString('en-US', {month: 'short'});
  const year = dt.getFullYear();

  return `${day}/${month}/${year}`;
}

/**
 * Format number as PKR currency
 */
export function formatPKR(amount: number): string {
  return new Intl.NumberFormat('en-PK', {
    style: 'currency',
    currency: 'PKR',
    minimumFractionDigits: 2,
  }).format(Number(amount) || 0);
}
