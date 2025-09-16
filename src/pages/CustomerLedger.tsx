import React, {useMemo, useState} from 'react';
import PageHeader from '../components/common/PageHeader';

type Tx = {
  date: string;
  particulars: string;
  debitAmount: string;
  creditAmount: string;
  crDr: 'CR' | 'DR';
};

export default function CustomerLedger() {
  const [customer, setCustomer] = useState({
    accountOf: '',
    address: '',
    contactNo: '',
    emailId: '',
  });
  const [rows, setRows] = useState<Tx[]>([
    {date: '', particulars: '', debitAmount: '', creditAmount: '', crDr: 'CR'},
  ]);

  function addRow() {
    setRows((r) => [
      ...r,
      {
        date: '',
        particulars: '',
        debitAmount: '',
        creditAmount: '',
        crDr: 'CR',
      },
    ]);
  }
  function updateRow(idx: number, patch: Partial<Tx>) {
    setRows((r) => r.map((row, i) => (i === idx ? {...row, ...patch} : row)));
  }
  function removeRow(idx: number) {
    setRows((r) => r.filter((_, i) => i !== idx));
  }

  const totals = useMemo(() => {
    let debit = 0;
    let credit = 0;
    rows.forEach((r) => {
      debit += Number(r.debitAmount) || 0;
      credit += Number(r.creditAmount) || 0;
    });
    return {debit, credit, net: credit - debit};
  }, [rows]);

  // Running balance (credit - debit) cumulative
  const running = useMemo(() => {
    let balance = 0;
    return rows.map((r) => {
      balance += (Number(r.creditAmount) || 0) - (Number(r.debitAmount) || 0);
      return balance;
    });
  }, [rows]);

  return (
    <>
      <PageHeader title="Customer Ledger">
        <button
          type="button"
          onClick={addRow}
          className="inline-flex items-center gap-2 h-9 px-3 rounded-md border border-neutral-300 bg-white hover:bg-neutral-100 text-sm">
          Add Row
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 h-9 px-3 rounded-md bg-neutral-900 text-white hover:bg-neutral-800 text-sm">
          Print
        </button>
      </PageHeader>

      {/* Summary cards */}
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white rounded-md border border-neutral-200 p-3">
          <div className="text-xs text-neutral-500 uppercase tracking-wide">
            Total Debit
          </div>
          <div className="text-xl font-semibold tabular-nums">
            {totals.debit.toFixed(2)}
          </div>
        </div>
        <div className="bg-white rounded-md border border-neutral-200 p-3">
          <div className="text-xs text-neutral-500 uppercase tracking-wide">
            Total Credit
          </div>
          <div className="text-xl font-semibold tabular-nums">
            {totals.credit.toFixed(2)}
          </div>
        </div>
        <div className="bg-white rounded-md border border-neutral-200 p-3">
          <div className="text-xs text-neutral-500 uppercase tracking-wide">
            Net Balance (CR - DR)
          </div>
          <div
            className={`text-xl font-semibold tabular-nums ${
              totals.net >= 0 ? 'text-emerald-600' : 'text-red-600'
            }`}>
            {totals.net.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Customer meta form */}
      <div className="mt-4 bg-white rounded-md border border-neutral-200 p-4 space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <InputField
            label="Account Of"
            value={customer.accountOf}
            onChange={(v) => setCustomer((c) => ({...c, accountOf: v}))}
          />
          <InputField
            label="Contact No"
            value={customer.contactNo}
            onChange={(v) => setCustomer((c) => ({...c, contactNo: v}))}
          />
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <InputField
            label="Address"
            value={customer.address}
            onChange={(v) => setCustomer((c) => ({...c, address: v}))}
          />
          <InputField
            label="Email ID"
            value={customer.emailId}
            onChange={(v) => setCustomer((c) => ({...c, emailId: v}))}
          />
        </div>
      </div>

      {/* Ledger table */}
      <div className="mt-4 bg-white rounded-md border border-neutral-200 overflow-auto max-h-[65vh] no-scrollbar">
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 bg-neutral-50 border-b border-neutral-200">
            <tr className="text-neutral-600">
              <Th className="w-32">Date</Th>
              <Th className="text-left">Particulars</Th>
              <Th className="w-32 text-right">Debit</Th>
              <Th className="w-32 text-right">Credit</Th>
              <Th className="w-20 text-center">CR/DR</Th>
              <Th className="w-40 text-right">Running Balance</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={i}
                className="border-b border-neutral-100 hover:bg-neutral-50">
                <Td>
                  <input
                    type="date"
                    className="w-full bg-transparent outline-none text-xs"
                    value={r.date}
                    onChange={(e) => updateRow(i, {date: e.target.value})}
                  />
                </Td>
                <Td className="text-left">
                  <input
                    type="text"
                    className="w-full bg-transparent outline-none"
                    value={r.particulars}
                    placeholder="Details"
                    onChange={(e) =>
                      updateRow(i, {particulars: e.target.value})
                    }
                  />
                </Td>
                <Td className="text-right">
                  <input
                    type="number"
                    className="w-full bg-transparent outline-none text-right"
                    value={r.debitAmount}
                    placeholder="0.00"
                    onChange={(e) =>
                      updateRow(i, {debitAmount: e.target.value})
                    }
                  />
                </Td>
                <Td className="text-right">
                  <input
                    type="number"
                    className="w-full bg-transparent outline-none text-right"
                    value={r.creditAmount}
                    placeholder="0.00"
                    onChange={(e) =>
                      updateRow(i, {creditAmount: e.target.value})
                    }
                  />
                </Td>
                <Td className="text-center">
                  <select
                    className="bg-transparent outline-none"
                    value={r.crDr}
                    onChange={(e) =>
                      updateRow(i, {crDr: e.target.value as 'CR' | 'DR'})
                    }>
                    <option value="CR">CR</option>
                    <option value="DR">DR</option>
                  </select>
                </Td>
                <Td className="text-right tabular-nums">
                  {Number.isFinite(running[i]) ? running[i].toFixed(2) : ''}
                </Td>
                <Td className="text-center">
                  {rows.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeRow(i)}
                      className="text-neutral-400 hover:text-red-600 text-xs">
                      ✕
                    </button>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-neutral-50 border-t border-neutral-200">
            <tr className="font-semibold">
              <Td colSpan={2} className="text-right">
                Totals
              </Td>
              <Td className="text-right tabular-nums">
                {totals.debit.toFixed(2)}
              </Td>
              <Td className="text-right tabular-nums">
                {totals.credit.toFixed(2)}
              </Td>
              <Td />
              <Td className="text-right tabular-nums">
                {totals.net.toFixed(2)}
              </Td>
              <Td />
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}

function InputField(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-neutral-600">
        {props.label}
      </span>
      <input
        className="h-9 rounded-md border border-neutral-300 bg-white px-2 text-sm outline-none focus:ring-2 focus:ring-neutral-400/40 focus:border-neutral-400"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.label}
      />
    </label>
  );
}

function Th({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={`px-3 py-2 font-medium text-xs tracking-wide uppercase ${className}`}>
      {children}
    </th>
  );
}

function Td({
  children,
  className = '',
  colSpan,
}: {
  children?: React.ReactNode;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      className={`px-3 py-1.5 align-middle text-sm ${className}`}>
      {children}
    </td>
  );
}
