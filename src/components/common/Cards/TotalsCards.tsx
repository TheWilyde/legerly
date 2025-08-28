type Card = {label: string; value: React.ReactNode};

type Props = {items: Card[]};

export default function TotalsCards({items}: Props) {
  return (
    <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
      {items.map((c, i) => (
        <div
          key={i}
          className="bg-white rounded-md border border-neutral-200 p-3">
          <div className="text-sm text-neutral-500">{c.label}</div>
          <div className="text-xl font-semibold tabular-nums">{c.value}</div>
        </div>
      ))}
    </div>
  );
}
