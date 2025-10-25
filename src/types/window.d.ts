import type {Profile} from '../../electron/types';

declare global {
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
        list: (profileId: string) => Promise<any[]>;
        create: (profileId: string, data: any) => Promise<any>;
        delete: (profileId: string, id: number) => Promise<{success: boolean}>;
        get: (profileId: string, id: number) => Promise<any>;
        save: (profileId: string, payload: any) => Promise<any>;
      };
      stock: {
        list: (profileId: string) => Promise<any[]>;
        create: (profileId: string, data: any) => Promise<any>;
        update: (profileId: string, id: number, data: any) => Promise<any>;
        delete: (profileId: string, id: number) => Promise<{success: boolean}>;
      };
      saleInvoices: {
        list: (profileId: string) => Promise<any[]>;
        create: (profileId: string, data: any) => Promise<any>;
        delete: (profileId: string, id: number) => Promise<{success: boolean}>;
        get: (profileId: string, id: number) => Promise<any>;
        save: (profileId: string, payload: any) => Promise<any>;
      };
      ledger: {
        save: (profileId: string, payload: any) => Promise<{id?: number; error?: string}>;
        get: (profileId: string, id: number) => Promise<any>;
        list: (profileId: string) => Promise<any[]>;
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