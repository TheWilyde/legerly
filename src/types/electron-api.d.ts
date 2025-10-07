/// <reference types="vite-plugin-electron/electron-env" />

declare global {
  type RendererInvoice = {
    id: number;
    number: string;
    supplierName: string;
    total: number;
    createdAt: string;
    address?: string;
    invoiceDate?: string;
    totalQty?: number;
  };

  type RendererInvoiceItem = {
    id: number;
    invoiceId: number;
    code: string;
    name: string;
    rate: number;
    qty: number;
    position: number;
  };

  type RendererStockItem = {
    id: number;
    code: string;
    name: string;
    purchaseRate: number;
    purchaseQty: number;
    saleRate: number;
    saleQty: number;
    createdAt: string;
  };

  type RendererNewStockItem = {
    code: string;
    name: string;
    purchaseRate: number;
    purchaseQty: number;
    saleRate: number;
    saleQty: number;
  };

  interface Window {
    ipcRenderer?: import('electron').IpcRenderer;
    api?: {
      invoices: {
        list: () => Promise<(RendererInvoice & {totalQty: number})[]>;
        create: (input: {
          supplierName: string;
          total: number;
          number: string;
          address?: string;
          invoiceDate?: string;
        }) => Promise<RendererInvoice>;
        delete: (id: number) => Promise<boolean>;
        get: (
          id: number
        ) => Promise<
          {invoice: RendererInvoice; items: RendererInvoiceItem[]} | undefined
        >;
        save: (input: {
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
        }) => Promise<{invoice: RendererInvoice; items: RendererInvoiceItem[]}>;
      };
      stock: {
        list: () => Promise<RendererStockItem[]>;
        create: (input: RendererNewStockItem) => Promise<RendererStockItem>;
        update: (
          id: number,
          input: RendererNewStockItem
        ) => Promise<RendererStockItem>;
        delete: (id: number) => Promise<boolean>;
      };
      sales: {
        list: () => Promise<(RendererInvoice & {totalQty: number})[]>;
        create: (input: {
          supplierName: string;
          total: number;
          number: string;
          address?: string;
          invoiceDate?: string;
        }) => Promise<RendererInvoice>;
        delete: (id: number) => Promise<boolean>;
        get: (
          id: number
        ) => Promise<
          {invoice: RendererInvoice; items: RendererInvoiceItem[]} | undefined
        >;
        save: (input: {
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
        }) => Promise<{invoice: RendererInvoice; items: RendererInvoiceItem[]}>;
      };
      print: {
        saveInvoicePdf(
          kind: 'purchase' | 'sale',
          id: number,
          pageSize?: 'A4' | 'A5'
        ): Promise<string | null>;
        ready: () => Promise<boolean>;
      };
      ledger?: {
        save: (payload: {
          id?: number;
          customerName: string;
          contactNo?: string;
          totals: {debit: number; credit: number; net: number};
          rows: {
            id?: number;
            date: string;
            particulars: string;
            debit: number;
            credit: number;
            crDr: 'CR' | 'DR';
            position: number;
          }[];
        }) => Promise<{id?: number; error?: string}>;
        get: (id: number) => Promise<{
          id: number;
          customerName: string;
          contactNo?: string;
          totals: {debit: number; credit: number; net: number};
          rows: Array<{
            id?: number;
            date: string;
            particulars: string;
            debit: number;
            credit: number;
            crDr: 'CR' | 'DR';
          }>;
        }>;
        list: () => Promise<
          Array<{
            id: number;
            customerName: string;
            totals: {debit: number; credit: number; net: number};
          }>
        >;
        delete: (id: number) => Promise<boolean>;
      };
    };
  }
}

export {};
