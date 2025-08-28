export type Invoice = {
  id: number;
  number: string;
  supplierName: string;
  total: number;
  createdAt: string;
  address?: string;
  invoiceDate?: string;
};

export type InvoiceListProps = {
  title: string;
  fetchList: () => Promise<Invoice[]>;
  deleteMany: (ids: number[]) => Promise<void> | void;
  editUrl: (id: number) => string;
  renderExpanded?: (inv: Invoice) => React.ReactNode;
};
