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
    uid: string; // ✅ Added uid
    number: string;
    invoiceSequence?: number | null;
    invoiceIdPerPeriod?: number | null;
    supplierName?: string;
    customerName?: string;
    total: number;
    createdAt: string;
    invoiceDate?: string;
    address?: string;
    contactNo?: string;
    status: "draft" | "posted"; // ✅ Added status
    periodId?: number;
    periodStatus?: "active" | "closed";
  }
  interface RendererPeriod {
    id: number;
    label: string;
    startDate: string;
    endDate: string;
    status: "active" | "closed";
    closedAt: string | null;
    createdAt: string;
    updatedAt: string;
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
  interface DocumentInfo {
    path: string;
    name: string;
    isDirty: boolean;
  }

  interface Window {
    api: {
      document: {
        new: () => Promise<DocumentInfo | null>;
        open: () => Promise<DocumentInfo | null>;
        openPath: (filePath: string) => Promise<DocumentInfo>;
        save: () => Promise<DocumentInfo>;
        saveAs: () => Promise<DocumentInfo | null>;
        getCurrent: () => Promise<DocumentInfo | null>;
        close: () => Promise<{ success: boolean }>;
      };
      profiles: {
        list: () => Promise<
          Array<{
            id: string;
            name: string;
            createdAt: string;
            lastOpened: string;
            color: string;
          }>
        >;
        create: (
          name: string,
          password?: string,
          color?: string,
        ) => Promise<{
          id: string;
          name: string;
          createdAt: string;
          lastOpened: string;
          color: string;
        }>;
        updateColor: (
          id: string,
          color: string,
        ) => Promise<{ success: boolean }>;
        open: (id: string, pass?: string) => Promise<{ success: boolean }>;
        close: (id: string) => Promise<{ success: boolean }>;
        switch: (id: string) => Promise<{ success: boolean }>;
        delete: (id: string) => Promise<{ success: boolean }>;
        getOpen: () => Promise<string[]>;
        getActive: () => Promise<string | null>;
        getBackups: (
          profileId: string,
        ) => Promise<{ filename: string; date: string; size: number }[]>;
        restoreBackup: (
          profileId: string,
          filename: string,
        ) => Promise<{ success: boolean }>;
        createBackup: (
          profileId: string,
        ) => Promise<{ success: boolean; filename: string }>;
      };
      invoices: {
        // FIX: Added filters argument
        list: (
          profileId: string,
          filters?: { startDate?: string; endDate?: string; periodId?: number },
        ) => Promise<RendererInvoice[]>;
        nextNumber: (
          profileId: string,
          periodId?: number | null,
        ) => Promise<string>;
        delete: (
          profileId: string,
          id: number,
        ) => Promise<{ success: boolean }>;
        get: (
          profileId: string,
          id: number,
        ) => Promise<{
          invoice: RendererInvoice;
          items: RendererInvoiceItem[];
        }>;
        save: (
          profileId: string,
          payload: NewPurchaseInvoice,
        ) => Promise<{
          invoice: RendererInvoice;
          items: RendererInvoiceItem[];
        }>;
        savePdf: (
          profileId: string,
          kind: "purchase" | "sale",
          id: number,
          pageSize?: "A4" | "A5",
        ) => Promise<{ success: boolean; path?: string; canceled?: boolean }>;
      };
      saleInvoices: {
        // FIX: Added filters argument
        list: (
          profileId: string,
          filters?: { startDate?: string; endDate?: string; periodId?: number },
        ) => Promise<RendererInvoice[]>;
        nextNumber: (
          profileId: string,
          periodId?: number | null,
        ) => Promise<string>;
        delete: (
          profileId: string,
          id: number,
        ) => Promise<{ success: boolean }>;
        get: (
          profileId: string,
          id: number,
        ) => Promise<{
          invoice: RendererInvoice;
          items: RendererInvoiceItem[];
        }>;
        save: (
          profileId: string,
          payload: NewSaleInvoice,
        ) => Promise<{
          invoice: RendererInvoice;
          items: RendererInvoiceItem[];
        }>;
      };
      stock: {
        list: (
          profileId: string,
          filters?: { periodId?: number },
        ) => Promise<RendererStockItem[]>;
        create: (
          profileId: string,
          input: RendererNewStockItem,
        ) => Promise<RendererStockItem>;
        update: (
          profileId: string,
          id: number,
          input: RendererNewStockItem,
        ) => Promise<RendererStockItem>;
        delete: (
          profileId: string,
          id: number,
        ) => Promise<{ success: boolean }>;
      };
      ledger: {
        list: (profileId: string) => Promise<any[]>;
        get: (profileId: string, id: number) => Promise<any>;
        save: (profileId: string, payload: any) => Promise<any>;
        delete: (
          profileId: string,
          id: number,
        ) => Promise<{ success: boolean }>;
      };
      periods: {
        list: (profileId: string) => Promise<RendererPeriod[]>;
        getActive: (profileId: string) => Promise<RendererPeriod | undefined>;
        getReopenContext: (
          profileId: string,
        ) => Promise<RendererPeriodReopenContext | null>;
        close: (
          profileId: string,
          payload: {
            periodId: number;
            startDate?: string;
            endDate?: string;
            label?: string;
          },
        ) => Promise<{
          closedPeriod: RendererPeriod;
          activePeriod: RendererPeriod | null;
          snapshotId: number;
        }>;
        closeReopened: (profileId: string) => Promise<{
          closedPeriod: RendererPeriod;
          activePeriod: RendererPeriod;
          snapshotId: number;
        }>;
        reopen: (
          profileId: string,
          periodId: number,
        ) => Promise<RendererPeriod>;
      };
      window: {
        minimize: () => void;
        maximize: () => void;
        close: () => void;
        onFeedback: (
          callback: (type: "success" | "error") => void,
        ) => () => void;
      };
      on: (
        channel:
          | "app:feedback"
          | "app:navigate"
          | "app:restore-session"
          | "profile:switched"
          | "document:opened"
          | "document:state-changed",
        callback: (...args: any[]) => void,
      ) => () => void;
      off: (channel: string, callback?: (...args: any[]) => void) => void;
    };
    electron?: Window["api"];
  }
}

export type NewInvoiceItem = {
  id?: number;
  code: string;
  name: string;
  rate: number;
  qty: number;
  position?: number;
};

export type RendererInvoice = {
  id: number;
  uid: string;
  number: string;
  invoiceSequence?: number | null;
  invoiceIdPerPeriod?: number | null;
  supplierName?: string;
  customerName?: string;
  total: number;
  createdAt: string;
  invoiceDate?: string;
  address?: string;
  contactNo?: string;
  status: "draft" | "posted"; // ✅ Added status
  periodId?: number;
  periodStatus?: "active" | "closed";
};

export type RendererPeriod = {
  id: number;
  label: string;
  startDate: string;
  endDate: string;
  status: "active" | "closed";
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RendererPeriodReopenContext = {
  activePeriodId: number;
  returnPeriodId: number;
};

export type NewPurchaseInvoice = {
  id?: number;
  number: string;
  supplierName: string;
  total: number;
  address?: string;
  invoiceDate: string;
  contactNo?: string;
  items: NewInvoiceItem[];
  status?: "draft" | "posted"; // ✅ Added status
  overrideClosedPeriod?: boolean;
  periodId?: number;
  invoiceIdPerPeriod?: number;
};

export type NewSaleInvoice = {
  id?: number;
  number: string;
  customerName: string;
  total: number;
  address?: string;
  invoiceDate: string;
  contactNo?: string;
  items: NewInvoiceItem[];
  status?: "draft" | "posted"; // ✅ Added status
  overrideClosedPeriod?: boolean;
  periodId?: number;
  invoiceIdPerPeriod?: number;
};

export {};
