'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [{ label: 'Sales', href: '/sales' }];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="w-56 shrink-0 border-r border-slate-200 bg-white">
      <div className="px-6 py-5">
        <h1 className="text-base font-semibold tracking-tight text-slate-900">
          Jen Ruff Books
        </h1>
        <p className="text-xs text-slate-500">Finance</p>
      </div>
      <nav className="space-y-1 px-3">
        {navItems.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={
                active
                  ? 'block rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white'
                  : 'block rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100'
              }
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
