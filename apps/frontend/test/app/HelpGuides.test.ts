import fs from 'fs';
import path from 'path';
import { GUIDES, SECTIONS, guideBySlug } from '@/app/help/guides';

const PUBLIC_DIR = path.join(__dirname, '../../public');

describe('help guides', () => {
  it('have unique slugs', () => {
    const slugs = GUIDES.map((g) => g.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('each belong to a listed section', () => {
    for (const g of GUIDES) expect(SECTIONS).toContain(g.section);
  });

  const images: [string, string, string | undefined][] = GUIDES.flatMap((g) =>
    g.steps.flatMap((s) => (s.image ? [[g.slug, s.image, s.alt] as [string, string, string | undefined]] : [])),
  );

  it.each(images)(
    '%s: %s exists and has alt text',
    (_slug, image, alt) => {
      expect(fs.existsSync(path.join(PUBLIC_DIR, image))).toBe(true);
      expect(alt).toBeTruthy();
    },
  );

  const links = GUIDES.flatMap((g) =>
    g.steps.flatMap((s) => [...s.text.matchAll(/\]\(([^)]+)\)/g)].map((m) => [g.slug, m[1]])),
  );

  it.each(links)('%s links to %s, a real page', (_slug, href) => {
    expect(fs.existsSync(path.join(__dirname, '../../src/app', href, 'page.tsx'))).toBe(true);
  });

  it('looks guides up by slug', () => {
    expect(guideBySlug('sign-in')?.title).toBe('Sign in');
    expect(guideBySlug('nope')).toBeUndefined();
  });
});
