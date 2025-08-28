import {useState, useEffect, useMemo} from 'react';
import {useNavigate, useSearchParams} from 'react-router-dom';
import {FiSave, FiTrash2} from 'react-icons/fi';
import type React from 'react';
import InvoiceHeaderForm from '../components/invoice/InvoiceHeaderForm';
import ItemsEditor from '../components/invoice/ItemsEditor';
import PageHeader from '../components/common/PageHeader';
import IconButton from '../components/common/IconButton';
import Button from '../components/common/Button';
import AddRowButton from '../components/common/AddRowButton';

export default function SaleInvoiceCreate() {
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const editingId = search.get('id') ? Number(search.get('id')) : undefined;

  const [supplierName, setSupplierName] = useState('');
  const [address, setAddress] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');

  const [stockByCode, setStockByCode] = useState<
    Map<string, {name: string; purchaseRate: number}>
  >(new Map());
  const allCodes = useMemo(
    () => Array.from(stockByCode.keys()).sort(),
    [stockByCode]
  );

  type Item = {
    id: number;
    code: string;
    name: string;
    rate: number;
    qty: number;
  };
  const [items, setItems] = useState<Item[]>([]);
  type InputRow = {id: number; code: string; rate: string; qty: string};
  const [inputRows, setInputRows] = useState<InputRow[]>([
    {id: -1, code: '', rate: '', qty: ''},
  ]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const computedTotal = useMemo(
    () => items.reduce((sum, it) => sum + it.rate * it.qty, 0),
    [items]
  );

  useEffect(() => {
    (async () => {
      const stock = await window.api?.stock.list();
      if (stock) {
        const map = new Map<string, {name: string; purchaseRate: number}>();
        for (const s of stock)
          map.set(s.code, {name: s.name, purchaseRate: s.purchaseRate});
        setStockByCode(map);
      }
      if (editingId) {
        const data = await window.api?.sales.get(editingId);
        if (data) {
          setSupplierName(data.invoice.supplierName);
          setInvoiceNumber(data.invoice.number);
          setAddress(data.invoice.address ?? '');
          setInvoiceDate(data.invoice.invoiceDate ?? '');
          setItems(
            data.items.map((it) => ({
              id: it.id,
              code: it.code,
              name: it.name,
              rate: it.rate,
              qty: it.qty,
            }))
          );
        }
      } else {
        const list = await window.api?.sales.list();
        if (!invoiceNumber) setInvoiceNumber(String((list?.length ?? 0) + 1));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId]);

  function handleDeleteSelected() {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    setItems((prev) => prev.filter((i) => !ids.includes(i.id)));
    setInputRows((prev) =>
      prev.filter((r) => !ids.includes(r.id)).length === 0
        ? [{id: -Date.now(), code: '', rate: '', qty: ''}]
        : prev.filter((r) => !ids.includes(r.id))
    );
    setSelectedIds(new Set());
  }

  function preventEnterSubmit(e: React.KeyboardEvent<HTMLFormElement>) {
    if (e.key === 'Enter') e.preventDefault();
  }
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const number = (invoiceNumber || '').trim() || '0';
    const payload = {
      id: editingId,
      number,
      supplierName,
      total: computedTotal,
      address,
      invoiceDate,
      items: items.map((it, idx) => ({
        code: it.code,
        name: it.name,
        rate: it.rate,
        qty: it.qty,
        position: idx,
      })),
    };
    await window.api?.sales.save(payload);
    navigate('/sale-invoice');
  }

  function handleAddRow() {
    setInputRows((rows) => [
      ...rows,
      {id: Date.now(), code: '', name: '', rate: '', qty: ''} as any,
    ]);
  }

  return (
    <div>
      <PageHeader title={editingId ? 'Edit Sale Invoice' : 'New Sale Invoice'}>
        {selectedIds.size > 0 && (
          <IconButton
            type="button"
            onClick={handleDeleteSelected}
            variant="danger"
            startIcon={<FiTrash2 className="size-4" />}
            title="Delete selected">
            Delete
          </IconButton>
        )}
      </PageHeader>

      <form
        onSubmit={handleSubmit}
        onKeyDown={preventEnterSubmit}
        className="mt-4 space-y-4">
        <InvoiceHeaderForm
          partyLabel="Customer Name"
          supplierName={supplierName}
          setSupplierName={setSupplierName}
          address={address}
          setAddress={setAddress}
          invoiceDate={invoiceDate}
          setInvoiceDate={setInvoiceDate}
          invoiceNumber={invoiceNumber}
          setInvoiceNumber={setInvoiceNumber}
        />

        <ItemsEditor
          items={items}
          setItems={setItems}
          inputRows={inputRows}
          setInputRows={setInputRows}
          stockByCode={stockByCode}
          allCodes={allCodes}
          selectedIds={selectedIds}
          setSelectedIds={setSelectedIds}
          codeHeader="Code"
          rateHeader="Rate"
          qtyHeader="Qty"
        />
        <div>
          <AddRowButton onClick={handleAddRow} />
        </div>

        <div className="flex gap-2">
          <Button type="submit" variant="primary" className="gap-2">
            <FiSave className="size-4" />
            <span>Save Invoice</span>
          </Button>
          <Button type="button" onClick={() => navigate('/sale-invoice')}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
