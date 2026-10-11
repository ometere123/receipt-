import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'RECEIPT! — Big promises. Real proof.',
  description: 'Pin source-code promises to an immutable commit. Investigate contradictions, get GenLayer verdicts and claim bounties.',
  icons: { icon: '/favicon.svg' },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
