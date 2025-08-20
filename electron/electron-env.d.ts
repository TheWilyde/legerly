/// <reference types="vite-plugin-electron/electron-env" />

declare namespace NodeJS {
  interface ProcessEnv {
    APP_ROOT: string;
    VITE_PUBLIC: string;
  }
}

type RendererInvoice = {
  id: number;
  number: string;
  supplierName: string;
  total: number;
  createdAt: string;
};

type RendererNewInvoice = {
  supplierName: string;
  total: number;
};

// Extend renderer Window typing to include high-level APIs
interface Window {
  ipcRenderer?: import('electron').IpcRenderer;
  api?: {
    invoices: {
      list: () => Promise<
        {
          id: number;
          number: string;
          supplierName: string;
          total: number;
          createdAt: string;
        }[]
      >;
      create: (input: {
        supplierName: string;
        total: number;
        number: string;
      }) => Promise<{
        id: number;
        number: string;
        supplierName: string;
        total: number;
        createdAt: string;
      }>;
      delete: (id: number) => Promise<boolean>;
    };
    stock: {
      list: () => Promise<
        {
          id: number;
          code: string;
          name: string;
          purchaseRate: number;
          purchaseQty: number;
          saleRate: number;
          saleQty: number;
          createdAt: string;
        }[]
      >;
      create: (input: {
        code: string;
        name: string;
        purchaseRate: number;
        purchaseQty: number;
        saleRate: number;
        saleQty: number;
      }) => Promise<{
        id: number;
        code: string;
        name: string;
        purchaseRate: number;
        purchaseQty: number;
        saleRate: number;
        saleQty: number;
        createdAt: string;
      }>;
      update: (
        id: number,
        input: {
          code: string;
          name: string;
          purchaseRate: number;
          purchaseQty: number;
          saleRate: number;
          saleQty: number;
        }
      ) => Promise<{
        id: number;
        code: string;
        name: string;
        purchaseRate: number;
        purchaseQty: number;
        saleRate: number;
        saleQty: number;
        createdAt: string;
      }>;
      delete: (id: number) => Promise<boolean>;
    };
  };
}
