/**
 * Shared display formatters.
 *
 * Currency and dates were previously formatted inline at each call site with
 * slightly different options, so the same amount could render as `$30,000` on
 * a card and `$30,000.00` in a table.
 */

/** `$30,000` — whole dollars, for headline figures and card summaries. */
export function formatCurrency(
  amount: number | string | null | undefined,
): string {
  const value = typeof amount === 'string' ? Number(amount) : amount ?? 0;
  if (!Number.isFinite(value)) return '$0';
  return `$${Math.round(value).toLocaleString('en-US')}`;
}

/** `$30,000.00` — cents included, for tabular amounts that must line up. */
export function formatCurrencyPrecise(
  amount: number | string | null | undefined,
): string {
  const value = typeof amount === 'string' ? Number(amount) : amount ?? 0;
  if (!Number.isFinite(value)) return '$0.00';
  return `$${value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Parses a `YYYY-MM-DD` API date as local time.
 *
 * `new Date('2026-01-01')` is parsed as UTC midnight, which renders as
 * Dec 31 for anyone west of Greenwich — the off-by-one-day bug this avoids.
 */
export function parseApiDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const iso = value.slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) {
    const fallback = new Date(value);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }
  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day));
}

/** `Jan 1, 2026` — the archived card's date treatment. */
export function formatDateLong(value: string | null | undefined): string {
  const date = parseApiDate(value);
  if (!date) return '—';
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** `May 15th, 2025` — the date picker input's display value. */
export function formatDateOrdinal(value: string | null | undefined): string {
  const date = parseApiDate(value);
  if (!date) return '';
  const day = date.getDate();
  const suffix =
    day % 10 === 1 && day !== 11
      ? 'st'
      : day % 10 === 2 && day !== 12
      ? 'nd'
      : day % 10 === 3 && day !== 13
      ? 'rd'
      : 'th';
  return `${date.toLocaleDateString('en-US', {
    month: 'long',
  })} ${day}${suffix}, ${date.getFullYear()}`;
}

/** `MM/DD/YYYY` — the expenses table's date column. */
export function formatDateNumeric(value: string | null | undefined): string {
  const date = parseApiDate(value);
  if (!date) return '—';
  return date.toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  });
}

/** Serialises a `Date` back to the `YYYY-MM-DD` the API expects, in local time. */
export function toApiDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}
