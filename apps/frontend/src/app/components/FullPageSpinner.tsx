'use client';

import Spinner from './Spinner';

/**
 * Neutral full-viewport placeholder shown while the session resolves or a
 * redirect is in flight.
 *
 * Deliberately reveals nothing about the app shell — the whole point of the
 * guard is that unauthenticated visitors never see it — and deliberately has no
 * component-library dependency, because it renders from AuthGate and the root
 * page, above anything that could be relied on to be mounted. `Spinner` is
 * plain markup over `globals.css`, which the root layout always loads.
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
        color: '#2E6038',
      }}
    >
      <Spinner size="lg" />
    </div>
  );
}
