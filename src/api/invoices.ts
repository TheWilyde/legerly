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

export async function listInvoices(profileId: string) {
  return window.api?.invoices.list(profileId);
}
export async function getInvoice(profileId: string, id: number) {
  return window.api?.invoices.get(profileId, id);
}
export async function saveInvoice(profileId: string, payload: SaveInvoicePayload) {
  return window.api?.invoices.save(profileId, payload);
}
export async function deleteInvoice(profileId: string, id: number) {
  return window.api?.invoices.delete(profileId, id);
}
