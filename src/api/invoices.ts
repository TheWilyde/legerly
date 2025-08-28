export type SaveInvoicePayload = {
  id?: number;
  number: string;
  supplierName: string;
  total: number;
  address?: string;
  invoiceDate?: string;
  items: {
    code: string;
    name: string;
    rate: number;
    qty: number;
    position: number;
  }[];
};

export async function listInvoices() {
  return window.api?.invoices.list();
}
export async function getInvoice(id: number) {
  return window.api?.invoices.get(id);
}
export async function saveInvoice(payload: SaveInvoicePayload) {
  return window.api?.invoices.save(payload);
}
export async function deleteInvoice(id: number) {
  return window.api?.invoices.delete(id);
}
