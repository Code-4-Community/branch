// Resolve a public/ asset path so it works under a preview basePath.
//
// Next.js prefixes /_next/* build assets with `basePath`, but NOT public/
// assets referenced by string src (e.g. <Image src="/branch-logo.png" />).
// Under an ephemeral PR preview served at /pr-<N>/ those would 404 (the file
// actually lives at /pr-<N>/branch-logo.png). NEXT_PUBLIC_BASE_PATH is set to
// "/pr-<N>" only for preview builds (see next.config.ts); it's empty in prod,
// so this is a no-op there.
export function assetPath(path: string): string {
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
  return `${base}${path}`;
}
