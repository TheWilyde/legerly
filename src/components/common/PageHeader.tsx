import React from 'react';

type Props = {
  title: React.ReactNode;
  children?: React.ReactNode; // actions on the right
};

export default function PageHeader({title, children}: Props) {
  return (
    <header className="bg-white shadow flex items-center justify-between px-4 py-3 rounded-md h-[60px] w-full">
      <h1 className="text-2xl font-semibold text-center ">{title}</h1>
      <div className="flex items-center gap-2">{children}</div>
    </header>
  );
}
