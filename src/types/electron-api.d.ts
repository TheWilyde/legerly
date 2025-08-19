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
      };
    };
  }
}
