import Link from 'next/link';
import { GUIDES, SECTIONS } from './guides';
import AdminTag from './AdminTag';

export default function HelpIndexPage() {
  return (
    <div>
      <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 24 }}>How do I…</h1>
      {SECTIONS.map((section) => (
        <section key={section} style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#2D6138', marginBottom: 12 }}>{section}</h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
            {GUIDES.filter((g) => g.section === section).map((g) => (
              <li key={g.slug}>
                <Link
                  href={`/help/${g.slug}`}
                  style={{
                    display: 'block',
                    padding: '12px 16px',
                    backgroundColor: '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: 8,
                    color: '#2B2B2B',
                    fontSize: 17,
                    textDecoration: 'none',
                  }}
                >
                  {g.title}
                  {g.adminOnly && <AdminTag />}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
