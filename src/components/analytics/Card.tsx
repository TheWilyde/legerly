import type {ReactNode} from 'react';

type Props = {
  title: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
};

export default function Card({title, children, action, className = ''}: Props) {
  return (
    <div
      className={`bg-white rounded-lg border border-neutral-200 p-6 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-neutral-900">{title}</h3>
        {action && <div>{action}</div>}
      </div>
      <div>{children}</div>
    </div>
  );
}
