'use client';

/**
 * Neutral full-viewport placeholder shown while the session resolves or a
 * redirect is in flight.
 *
 * Deliberately reveals nothing about the app shell — the whole point of the
 * guard is that unauthenticated visitors never see it — and deliberately has no
 * component-library dependency, because it renders from AuthGate and the root
 * page, above anything that could be relied on to be mounted.
 */
export default function FullPageSpinner({
  label = 'Loading…',
}: {
  label?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label}
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f9fafb',
      }}
    >
      <style>{`@keyframes branch-spin { to { transform: rotate(360deg); } }`}</style>
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: '50%',
          border: '4px solid #d7e3d9',
          borderTopColor: '#2E6038',
          animation: 'branch-spin 0.8s linear infinite',
        }}
      />
    </div>
  );
}
