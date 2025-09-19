import PageHeader from '../components/common/PageHeader';
import SummaryCard from '../components/common/SummaryCard';

export default function Ledger() {
  let totalDebit = 0.0,
    totalCredit = 0.0,
    netBalance = 0.0;
  return (
    <>
      <PageHeader title="Ledger" />
      {/* Summary cards */}
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <SummaryCard cardTitle="Total Debit" cardValue={totalDebit} />
        <SummaryCard cardTitle="Total Credit" cardValue={totalCredit} />
        <SummaryCard
          cardTitle="Net Balance"
          cardValue={netBalance}
          profitLossIndicator={true}
        />
      </div>
    </>
  );
}
