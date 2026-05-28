import {useState} from 'react';
import type {ReactElement} from 'react';
import {NavLink} from 'react-router-dom';
import {
  FiHome,
  FiFileText,
  FiSettings,
  FiMenu,
  FiBox,
  FiBook,
} from 'react-icons/fi';

type NavItem = {key: string; name: string; to: string; icon: ReactElement};

const NAV_ITEMS: NavItem[] = [
  {key: 'home', name: 'Home', to: '/', icon: <FiHome className="size-5" />},
  {
    key: 'purchaseInvoice',
    name: 'Purchase Invoice',
    to: '/purchase-invoice',
    icon: <FiFileText className="size-5" />,
  },
  {
    key: 'saleInvoice',
    name: 'Sale Invoice',
    to: '/sale-invoice',
    icon: <FiFileText className="size-5" />,
  },
  {
    key: 'stock',
    name: 'Stock',
    to: '/stock',
    icon: <FiBox className="size-5" />,
  },
  {
    key: 'ledger',
    name: 'Ledger',
    to: '/ledger',
    icon: <FiBook className="size-5" />,
  },
  {
    key: 'settings',
    name: 'Settings',
    to: '/settings',
    icon: <FiSettings className="size-5" />,
  },
];

function Navbar() {
  const [collapsed, setCollapsed] = useState(true);

  return (
    <aside
      className={[
        'h-full border-r border-neutral-200 bg-white flex flex-col transition-all duration-200 ease-in-out overflow-hidden font-sans font-semibold text-lg',
        collapsed ? 'w-14' : 'w-52',
      ].join(' ')}>
      {/* Header + toggle */}
      <div className="px-2 py-2 border-b border-neutral-200">
        <button
          className={[
            'w-full flex items-center rounded-md hover:bg-neutral-100 text-sm text-black h-9 px-2 justify-start transition-all',
            collapsed ? 'gap-0' : 'gap-3',
          ].join(' ')}
          onClick={() => setCollapsed((v) => !v)}>
          <FiMenu className="size-5" />
          <span
            className={[
              'truncate transition-[opacity,width] duration-200',
              collapsed
                ? 'opacity-0 w-0 pointer-events-none'
                : 'opacity-100 w-auto',
            ].join(' ')}>
            Ledgerly
          </span>
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        <ul className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <li key={item.key}>
              <NavLink
                to={item.to}
                title={collapsed ? item.name : undefined}
                className={({isActive}) =>
                  [
                    'flex items-center rounded-md h-9 transition-all justify-start px-2',
                    collapsed ? 'gap-0' : 'gap-3',
                    isActive
                      ? 'bg-neutral-100 text-neutral-900'
                      : 'hover:bg-neutral-100 text-neutral-700',
                  ].join(' ')
                }>
                <span className="flex items-center justify-center size-6 shrink-0">
                  {item.icon}
                </span>
                <span
                  className={[
                    'truncate transition-[opacity,width] duration-200',
                    collapsed
                      ? 'opacity-0 w-0 pointer-events-none'
                      : 'opacity-100 w-auto',
                  ].join(' ')}>
                  {item.name}
                </span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}

export default Navbar;
