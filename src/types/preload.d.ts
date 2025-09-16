// Global typings for window.api used in the renderer
export {};

declare global {
  interface Window {
    api: {
      // ...other namespaces you expose...
      print: {
        saveInvoicePdf: (
          kind: 'purchase' | 'sale',
          id: number,
          pageSize?: 'A4' | 'A5'
        ) => Promise<string | null>;
        ready: () => void;
      };
    };
  }
}
