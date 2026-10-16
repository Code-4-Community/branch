import Image from 'next/image';
import Link from 'next/link';
import { assetPath } from '@/lib/asset';

export const metadata = {
  title: 'BRANCH Help',
  description: 'Step-by-step guides for the BRANCH accounting platform',
};

const GREEN = '#2D6138';

export default function HelpLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb' }}>
      <header style={{ backgroundColor: GREEN, color: '#fff' }}>
        <div
          style={{
            maxWidth: 880,
            margin: '0 auto',
            padding: '14px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <Link
            href="/help"
            style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#fff', textDecoration: 'none' }}
          >
            <Image src={assetPath('/branch-logo.png')} alt="" width={36} height={36} style={{ height: 'auto' }} />
            <span style={{ fontSize: 20, fontWeight: 700 }}>BRANCH Help</span>
          </Link>
          <Link href="/" style={{ color: '#fff', fontSize: 15, textDecoration: 'underline' }}>
            Open BRANCH
          </Link>
        </div>
      </header>
      <main style={{ maxWidth: 880, margin: '0 auto', padding: '32px 20px 64px' }}>{children}</main>
    </div>
  );
}
