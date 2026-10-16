import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { assetPath } from '@/lib/asset';
import { GUIDES, guideBySlug } from '../guides';
import AdminTag from '../AdminTag';

// Static export: every guide is known at build time, so each gets its own document.
export function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }));
}

export const dynamicParams = false;

// Steps mark app pages as [label](/path).
function withLinks(text: string) {
  return text.split(/(\[[^\]]+\]\([^)]+\))/).map((part, i) => {
    const m = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
    if (!m) return part;
    return (
      <Link key={i} href={m[2]} style={{ color: '#2D6138', fontWeight: 700, textDecoration: 'underline' }}>
        {m[1]}
      </Link>
    );
  });
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const guide = guideBySlug((await params).slug);
  return { title: guide ? `${guide.title} | BRANCH Help` : 'BRANCH Help' };
}

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const guide = guideBySlug((await params).slug);
  if (!guide) notFound();

  return (
    <article>
      <Link href="/help" style={{ color: '#2D6138', fontSize: 15 }}>
        ← All guides
      </Link>
      <h1 style={{ fontSize: 32, fontWeight: 700, margin: '12px 0 24px' }}>
        {guide.title}
        {guide.adminOnly && <AdminTag />}
      </h1>
      <ol style={{ listStyle: 'decimal', paddingLeft: 24, margin: 0, display: 'grid', gap: 28 }}>
        {guide.steps.map((step) => (
          <li key={step.text} style={{ fontSize: 18, lineHeight: 1.5 }}>
            <p style={{ margin: 0 }}>{withLinks(step.text)}</p>
            {step.image && (
              <Image
                src={assetPath(step.image)}
                alt={step.alt ?? ''}
                width={1440}
                height={904}
                style={{
                  width: '100%',
                  height: 'auto',
                  marginTop: 12,
                  borderRadius: 8,
                  border: '1px solid #e5e7eb',
                }}
              />
            )}
          </li>
        ))}
      </ol>
    </article>
  );
}
