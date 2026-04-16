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
