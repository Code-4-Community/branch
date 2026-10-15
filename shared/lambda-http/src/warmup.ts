/**
 * Start `warm` during Lambda init, so a cold container's network setup overlaps
 * with the rest of init instead of queueing behind the first request.
 *
 * Returns the in-flight promise for `dispatch`'s `warmup` option, which `/health`
 * awaits so a ping leaves the container fully warm before Lambda freezes it.
 * Outside Lambda (tests, dev-server) it does nothing. A failure is logged, not
 * retried: the first real request does the same work anyway.
 */
export function prewarm(warm: () => Promise<unknown>): () => Promise<void> {
  if (!process.env.AWS_LAMBDA_FUNCTION_NAME) return async () => {};
  const pending = warm().then(
    () => undefined,
    (err) => console.warn('Warm-up failed:', err),
  );
  return () => pending;
}
