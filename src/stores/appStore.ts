import {create} from 'zustand';
import {persist, createJSONStorage} from 'zustand/middleware';
import {immer} from 'zustand/middleware/immer';

interface InvoiceFormState {
  supplierName: string;
  contactNo: string;
  address: string;
  invoiceDate: string;
  number: string;
  items: Array<{
    code: string;
    name: string;
    rate: number;
    qty: number;
  }>;
}

interface AppState {
  // Per-profile state
  invoiceForms: {
    purchase: InvoiceFormState;
    sale: InvoiceFormState;
  };
  // Add more form states as needed
  ledgerForm: {
    customerName: string;
    contactNo: string;
    rows: Array<{
      date: string;
      particulars: string;
      debit: number;
      credit: number;
    }>;
  };
  stockForm: {
    items: Array<{
      code: string;
      name: string;
      purchaseRate: number;
      purchaseQty: number;
      saleRate: number;
      saleQty: number;
    }>;
  };
}

interface AppActions {
  updatePurchaseInvoiceForm: (updates: Partial<InvoiceFormState>) => void;
  updateSaleInvoiceForm: (updates: Partial<InvoiceFormState>) => void;
  updateLedgerForm: (updates: Partial<AppState['ledgerForm']>) => void;
  updateStockForm: (updates: Partial<AppState['stockForm']>) => void;
  resetPurchaseInvoiceForm: () => void;
  resetSaleInvoiceForm: () => void;
  resetLedgerForm: () => void;
  resetStockForm: () => void;
}

const defaultInvoiceForm: InvoiceFormState = {
  supplierName: '',
  contactNo: '',
  address: '',
  invoiceDate: '',
  number: '',
  items: [],
};

const defaultLedgerForm: AppState['ledgerForm'] = {
  customerName: '',
  contactNo: '',
  rows: [],
};

const defaultStockForm: AppState['stockForm'] = {
  items: [],
};

export const useAppStore = create<AppState & AppActions>()(
  persist(
    immer((set) => ({
      // Initial state
      invoiceForms: {
        purchase: {...defaultInvoiceForm},
        sale: {...defaultInvoiceForm},
      },
      ledgerForm: {...defaultLedgerForm},
      stockForm: {...defaultStockForm},

      // Actions
      updatePurchaseInvoiceForm: (updates) =>
        set((state) => {
          Object.assign(state.invoiceForms.purchase, updates);
        }),

      updateSaleInvoiceForm: (updates) =>
        set((state) => {
          Object.assign(state.invoiceForms.sale, updates);
        }),

      updateLedgerForm: (updates) =>
        set((state) => {
          Object.assign(state.ledgerForm, updates);
        }),

      updateStockForm: (updates) =>
        set((state) => {
          Object.assign(state.stockForm, updates);
        }),

      resetPurchaseInvoiceForm: () =>
        set((state) => {
          state.invoiceForms.purchase = {...defaultInvoiceForm};
        }),

      resetSaleInvoiceForm: () =>
        set((state) => {
          state.invoiceForms.sale = {...defaultInvoiceForm};
        }),

      resetLedgerForm: () =>
        set((state) => {
          state.ledgerForm = {...defaultLedgerForm};
        }),

      resetStockForm: () =>
        set((state) => {
          state.stockForm = {...defaultStockForm};
        }),
    })),
    {
      name: 'app-state', // base name
      storage: createJSONStorage(() => ({
        getItem: (name) => {
          // Get current profile ID
          const activeProfileId = (window as any)?.api?.profiles?.getActive?.();
          if (!activeProfileId) return null;
          return localStorage.getItem(`${name}:${activeProfileId}`);
        },
        setItem: (name, value) => {
          const activeProfileId = (window as any)?.api?.profiles?.getActive?.();
          if (!activeProfileId) return;
          localStorage.setItem(`${name}:${activeProfileId}`, value);
        },
        removeItem: (name) => {
          const activeProfileId = (window as any)?.api?.profiles?.getActive?.();
          if (!activeProfileId) return;
          localStorage.removeItem(`${name}:${activeProfileId}`);
        },
      })),
    },
  ),
);
