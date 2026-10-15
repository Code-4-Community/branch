// /health awaits this so Lambda does not freeze the container mid-warm-up.
export function prewarm(warm: () => Promise<unknown>): () => Promise<void> {
  if (!process.env.AWS_LAMBDA_FUNCTION_NAME) return async () => {};
  const pending = warm().then(
    () => undefined,
    (err) => console.warn('Warm-up failed:', err),
  );
  return () => pending;
}
