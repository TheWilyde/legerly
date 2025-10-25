/// <reference types="vite-plugin-electron/electron-env" />

import type {Profile} from '../../electron/types';

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
    electron: {
      profiles: {
        list: () => Promise<Profile[]>;
        create: (name: string) => Promise<Profile>;
        open: (profileId: string) => Promise<{success: boolean}>;
        close: (profileId: string) => Promise<{success: boolean}>;
        switch: (profileId: string) => Promise<{success: boolean}>;
        getOpen: () => Promise<string[]>;
        getActive: () => Promise<string | null>;
        delete: (profileId: string) => Promise<{success: boolean}>;
        rename: (profileId: string, newName: string) => Promise<{success: boolean}>;
      };
      on: (channel: string, callback: (...args: any[]) => void) => void;
      removeListener: (channel: string, callback: (...args: any[]) => void) => void;
    };
    api: {
      invoices: {
        list: (profileId: string) => Promise<RendererInvoice[]>;
        create: (profileId: string, input: {
          supplierName: string;
          total: number;
          number: string;
          address?: string;
          invoiceDate?: string;
          contactNo?: string; // ✅ Add this field
          items?: Array<{
            code: string;
            name: string;
            rate: number;
            qty: number;
            position: number;
          }>;
        }) => Promise<RendererInvoice>;
        delete: (profileId: string, id: number) => Promise<{success: boolean}>;
        get: (profileId: string, id: number) => Promise<{
          invoice: RendererInvoice;
          items: RendererInvoiceItem[];
        } | undefined>;
        save: (profileId: string, input: {
          id?: number;
          number: string;
          supplierName: string;
          total: number;
          address?: string;
          invoiceDate?: string;
          items: Array<{
            id?: number;
            code: string;
            name: string;
            rate: number;
            qty: number;
            position: number;
          }>;
        }) => Promise<{invoice: RendererInvoice; items: RendererInvoiceItem[]}>;
      };
      saleInvoices: {
        list: (profileId: string) => Promise<RendererInvoice[]>;
        create: (profileId: string, input: {
          customerName: string;
          total: number;
          number: string;
          address?: string;
          invoiceDate?: string;
          contactNo?: string; // ✅ Already has this
          items?: Array<{
            code: string;
            name: string;
            rate: number;
            qty: number;
            position: number;
          }>;
        }) => Promise<RendererInvoice>;
        delete: (profileId: string, id: number) => Promise<{success: boolean}>;
        get: (profileId: string, id: number) => Promise<{
          invoice: RendererInvoice;
          items: RendererInvoiceItem[];
        } | undefined>;
        save: (profileId: string, input: {
          id?: number;
          number: string;
          supplierName: string;
          total: number;
          address?: string;
          invoiceDate?: string;
          items: Array<{
            id?: number;
            code: string;
            name: string;
            rate: number;
            qty: number;
            position: number;
          }>;
        }) => Promise<{invoice: RendererInvoice; items: RendererInvoiceItem[]}>;
      };
      stock: {
        list: (profileId: string) => Promise<RendererStockItem[]>;
        create: (profileId: string, input: RendererNewStockItem) => Promise<RendererStockItem>;
        update: (profileId: string, id: number, input: RendererNewStockItem) => Promise<RendererStockItem>;
        delete: (profileId: string, id: number) => Promise<{success: boolean}>;
      };
      ledger: {
        list: (profileId: string) => Promise<any[]>;
        get: (profileId: string, id: number) => Promise<any>;
        save: (profileId: string, payload: any) => Promise<{id?: number; error?: string}>;
        delete: (profileId: string, id: number) => Promise<{success: boolean}>;
      };
      invoice: {
        savePdf: (
          profileId: string,
          kind: 'purchase' | 'sale',
          id: number,
          pageSize?: 'A4' | 'A5'
        ) => Promise<{success: boolean; path?: string; canceled?: boolean}>;
      };
    };
  }
}

export {};
