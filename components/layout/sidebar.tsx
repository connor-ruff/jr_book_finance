'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  {
    label: 'Sales',
    href: '/sales',
    children: [
      { label: 'Total Royalty', href: '/sales/total-royalty' },
      { label: 'Book+Language Royalty', href: '/sales/book-language' },
    ],
  },
  {
    label: 'Config',
    href: '/config',
    children: [{ label: 'Summary', href: '/config/summary' }],
  },
];

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
          const parentActive = pathname.startsWith(item.href);
          return (
            <div key={item.href}>
              <div
                className={
                  parentActive
                    ? 'rounded-md px-3 py-2 text-sm font-medium text-slate-900'
                    : 'rounded-md px-3 py-2 text-sm font-medium text-slate-500'
                }
              >
                {item.label}
              </div>
              {item.children && (
                <div className="ml-3 mt-0.5 space-y-0.5">
                  {item.children.map((child) => {
                    const active = pathname === child.href || pathname.startsWith(child.href + '/');
                    return (
                      <Link
                        key={child.href}
                        href={child.href}
                        className={
                          active
                            ? 'block rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white'
                            : 'block rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100'
                        }
                      >
                        {child.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
