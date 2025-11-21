/// <reference types="vite-plugin-electron/electron-env" />

declare global {
  interface RendererInvoiceItem {
    id: number;
    invoiceId: number;
    code: string;
    name: string;
    rate: number;
    qty: number;
    position: number;
  }
  interface RendererInvoice {
    id: number;
    number: string;
    supplierName?: string;
    customerName?: string;
    total: number;
    createdAt: string;
    address?: string;
    invoiceDate?: string;
    contactNo?: string;
    totalQty?: number;
  }
  interface RendererStockItem {
    id: number;
    code: string;
    name: string;
    purchaseRate: number;
    saleRate: number;
    qty: number;
    purchaseQty?: number;
    saleQty?: number;
    createdAt?: string;
  }
  interface RendererNewStockItem {
    code: string;
    name: string;
    purchaseRate: number;
    saleRate: number;
    qty?: number;
    purchaseQty?: number;
    saleQty?: number;
  }
  interface Window {
    api: {
      profiles: {
        list: () => Promise<Array<{ id: string; name: string; createdAt: string; lastOpened: string }>>;
        create: (name: string) => Promise<{ id: string; name: string; createdAt: string; lastOpened: string }>;
        open: (id: string) => Promise<void>;
        close: (id: string) => Promise<void>;
        switch: (id: string) => Promise<void>;
        delete: (id: string) => Promise<void>;
        getOpen: () => Promise<string[]>;
        getActive: () => Promise<string | null>;
      };
      invoices: {
        // FIX: Added filters argument
        list: (
          profileId: string,
          filters?: {startDate?: string; endDate?: string}
        ) => Promise<RendererInvoice[]>;
        create: (
          profileId: string,
          data: NewPurchaseInvoice
        ) => Promise<RendererInvoice>;
        delete: (profileId: string, id: number) => Promise<{success: boolean}>;
        get: (
          profileId: string,
          id: number
        ) => Promise<{invoice: RendererInvoice; items: RendererInvoiceItem[]}>;
        save: (
          profileId: string,
          payload: any
        ) => Promise<{invoice: RendererInvoice; items: RendererInvoiceItem[]}>;
      };
      saleInvoices: {
        // FIX: Added filters argument
        list: (
          profileId: string,
          filters?: {startDate?: string; endDate?: string}
        ) => Promise<RendererInvoice[]>;
        create: (
          profileId: string,
          data: NewSaleInvoice
        ) => Promise<RendererInvoice>;
        delete: (profileId: string, id: number) => Promise<{success: boolean}>;
        get: (
          profileId: string,
          id: number
        ) => Promise<{invoice: RendererInvoice; items: RendererInvoiceItem[]}>;
        save: (
          profileId: string,
          payload: any
        ) => Promise<{invoice: RendererInvoice; items: RendererInvoiceItem[]}>;
      };
      stock: {
        list: (profileId: string) => Promise<RendererStockItem[]>;
        create: (profileId: string, input: RendererNewStockItem) => Promise<RendererStockItem>;
        update: (profileId: string, id: number, input: RendererNewStockItem) => Promise<RendererStockItem>;
        delete: (profileId: string, id: number) => Promise<{ success: boolean }>;
      };
      ledger: {
        list: (profileId: string) => Promise<any[]>;
        get: (profileId: string, id: number) => Promise<any>;
        save: (profileId: string, payload: any) => Promise<any>;
        delete: (profileId: string, id: number) => Promise<{ success: boolean }>;
      };
      invoice: {
        get: (
          profileId: string,
          kind: 'purchase' | 'sale',
          id: number
        ) => Promise<RendererInvoice>;
        savePdf: (
          profileId: string,
          kind: 'purchase' | 'sale',
          id: number,
          pageSize?: 'A4' | 'A5'
        ) => Promise<{success: boolean; path?: string; canceled?: boolean}>;

        // FIX: Add type definition
        getPrintData: (
          profileId: string,
          kind: 'purchase' | 'sale',
          id: number
        ) => Promise<{invoice: RendererInvoice; items: RendererInvoiceItem[]}>;

        save: (
          profileId: string,
          payload: {
            id?: number;
            number: string;
            supplierName: string;
            total: number;
            address?: string;
            invoiceDate?: string;
            contactNo?: string;
            items: Array<{ id?: number; code: string; name: string; rate: number; qty: number; position: number }>;
          }
        ) => Promise<{ invoice: RendererInvoice; items: RendererInvoiceItem[] }>;
        delete: (profileId: string, id: number) => Promise<{ success: boolean }>;
      };
      // FIX: Allow generic string channels for navigation events
      on: (channel: string, callback: (...args: any[]) => void) => void;
      off: (channel: string, callback: (...args: any[]) => void) => void;
    };
    electron: Window['api'];
    window: {
      minimize: () => void;
      maximize: () => void;
      close: () => void;
      onFeedback: (callback: (type: 'success' | 'error') => void) => () => void;
    };
  }
}

export {};
