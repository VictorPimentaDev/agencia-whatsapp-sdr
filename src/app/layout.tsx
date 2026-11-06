import type { Metadata } from 'next';
import './globals.css';
import localFont from 'next/font/local';
const body = localFont({ src: './fonts/dmsans.ttf', variable: '--font-body', display: 'swap' });
const display = localFont({
  src: './fonts/manrope.ttf',
  variable: '--font-display',
  display: 'swap',
});
export const metadata: Metadata = {
  title: 'Agência SDR — Conversas que avançam',
  description: 'A human-led WhatsApp qualification desk for creative agencies. Open source.',
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body className={`${body.variable} ${display.variable}`}>{children}</body>
    </html>
  );
}
