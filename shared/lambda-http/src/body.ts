/** Parse a JSON request body. Returns `{}` for an empty body, `null` when malformed. */
export function parseBody(event: any): Record<string, unknown> | null {
  try {
    return event.body ? (JSON.parse(event.body) as Record<string, unknown>) : {};
  } catch {
    return null;
  }
}
