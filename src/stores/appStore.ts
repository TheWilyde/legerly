import {create} from 'zustand';
import {persist, createJSONStorage} from 'zustand/middleware';
import {immer} from 'zustand/middleware/immer';

// ─── Synchronous profile ID cache ────────────────────────────────────────────
// getActive() is async IPC — we can never await inside Zustand's storage
// adapter. Instead we keep a module-level variable that is updated
// synchronously whenever the active profile changes.
let _currentProfileId: string | null = null;

export function setCurrentProfileId(id: string | null) {
  _currentProfileId = id;
}

interface InvoiceFormState {
  supplierName: string;
  contactNo: string;
  address: string;
  invoiceDate: string;
  number: string;
  invoiceIdPerPeriod?: number | null;
  items: Array<{
    id?: number;
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
  invoiceIdPerPeriod: null,
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
          if (!_currentProfileId) return null;
          return localStorage.getItem(`${name}:${_currentProfileId}`);
        },
        setItem: (name, value) => {
          if (!_currentProfileId) return;
          localStorage.setItem(`${name}:${_currentProfileId}`, value);
        },
        removeItem: (name) => {
          if (!_currentProfileId) return;
          localStorage.removeItem(`${name}:${_currentProfileId}`);
        },
      })),
    },
  ),
);
