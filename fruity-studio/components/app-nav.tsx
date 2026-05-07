'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Users, Settings, Home } from 'lucide-react';

const navItems = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/characters', label: 'Charaktere', icon: Users },
  { href: '/settings', label: 'Einstellungen', icon: Settings },
];

export function AppNav() {
  const pathname = usePathname();

  return (
    <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-40">
      <div className="container mx-auto px-4 max-w-7xl flex items-center justify-between h-16">
        <Link href="/" className="flex items-center gap-2 font-bold text-xl">
          <span className="text-2xl">🍊</span>
          <span className="fruit-gradient bg-clip-text text-transparent">Fruity Studio</span>
        </Link>
        <nav className="flex items-center gap-1">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                pathname === href
                  ? 'bg-primary/20 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent',
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{label}</span>
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
