/// <reference types="vite-plugin-electron/electron-env" />

export {}; // ensure this file is a module

declare global {
  type RendererInvoice = {
    id: number;
    number: string;
    supplierName: string;
    total: number;
    createdAt: string;
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
        list: () => Promise<RendererInvoice[]>;
        create: (input: {
          supplierName: string;
          total: number;
          number: string;
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
    };
  }
}
