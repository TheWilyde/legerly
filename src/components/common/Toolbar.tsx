import React from 'react';

type Props = React.HTMLAttributes<HTMLDivElement> & {
  children: React.ReactNode;
};

export default function Toolbar({children, className = '', ...rest}: Props) {
  return (
    <div className={`flex items-center gap-2 ${className}`} {...rest}>
      {children}
    </div>
  );
}
