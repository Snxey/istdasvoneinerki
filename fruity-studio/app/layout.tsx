import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import { Toaster } from '@/components/ui/toaster';
import { AppNav } from '@/components/app-nav';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Fruity Studio',
  description: 'Lokales KI-Bildgenerierungs-Tool für TikTok Cartoon Content',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className="dark">
      <body className={inter.className}>
        <Providers>
          <div className="min-h-screen flex flex-col">
            <AppNav />
            <main className="flex-1 container mx-auto px-4 py-8 max-w-7xl">
              {children}
            </main>
          </div>
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
