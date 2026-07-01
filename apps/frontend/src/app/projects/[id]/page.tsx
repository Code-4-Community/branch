// Server wrapper for the dynamic project route. `output: 'export'` requires a
// dynamic segment to declare its params here (a Server Component export), so
// the actual UI lives in ProjectDetailClient. We pre-render no ids — every
// /projects/:id is client-rendered (ProjectDetailClient reads the id via
// useParams and fetches it). Hard loads/deep links resolve through the
// CloudFront SPA fallback (404 -> /index.html).
import ProjectDetailClient from './ProjectDetailClient';

// Export needs >=1 param to emit the route. We only emit a throwaway shell;
// real ids are client-rendered and resolve via the CloudFront SPA fallback.
export function generateStaticParams() {
  return [{ id: 'placeholder' }];
}

export default function Page() {
  return <ProjectDetailClient />;
}
