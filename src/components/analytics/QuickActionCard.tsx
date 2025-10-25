import React from 'react';
import {Link} from 'react-router-dom';

type Props = {
  title: string;
  to: string;
  icon: React.ReactNode;
  bgColor?: string;
  textColor?: string;
};

export default function QuickActionCard({
  title,
  to,
  icon,
  bgColor = 'bg-blue-50',
  textColor = 'text-blue-600',
}: Props) {
  return (
    <Link
      to={to}
      className={`${bgColor} ${textColor} rounded-lg p-6 hover:shadow-md transition-all flex flex-col items-center gap-3 text-center group`}>
      <div className="group-hover:scale-110 transition-transform">{icon}</div>
      <span className="font-medium">{title}</span>
    </Link>
  );
}
