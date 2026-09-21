import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'スキルシート管理システム',
  description: 'IIT採用者のスキルシートを作成・編集・出力するシステム',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="min-h-full antialiased">{children}</body>
    </html>
  );
}
