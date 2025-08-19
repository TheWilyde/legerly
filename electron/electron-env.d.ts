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

interface Window {
  ipcRenderer?: import('electron').IpcRenderer;
  api?: {
    invoices: {
      list: () => Promise<RendererInvoice[]>;
      create: (input: RendererNewInvoice) => Promise<RendererInvoice>;
      delete: (id: number) => Promise<boolean>;
    };
  };
}
