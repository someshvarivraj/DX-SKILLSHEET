import type { Metadata } from 'next';
import './globals.css';
import { getLang } from '@/lib/i18n/server';
import { I18nProvider } from '@/lib/i18n/client';

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  return {
    title: lang === 'en' ? 'Skill Sheet Manager' : 'スキルシート管理システム',
    description: 'IIT採用者のスキルシートを作成・編集・出力するシステム',
    robots: { index: false, follow: false },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = await getLang();
  return (
    <html lang={lang}>
      <body className="min-h-full antialiased">
        <I18nProvider lang={lang}>{children}</I18nProvider>
      </body>
    </html>
  );
}
