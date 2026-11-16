/**
 * Parses an optional numeric string ('', '4500000') into a non-negative number or null.
 * Returns NaN if the string is non-empty and not a valid non-negative number.
 */
export function parseOptionalNonNegativeNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return null;
  }
  const num = Number(trimmed);
  if (Number.isNaN(num) || !Number.isFinite(num) || num < 0) {
    return Number.NaN;
  }
  return num;
}

export function isBudgetRangeValid(minRaw: string, maxRaw: string): boolean {
  const min = parseOptionalNonNegativeNumber(minRaw);
  const max = parseOptionalNonNegativeNumber(maxRaw);
  if (min === null || max === null || Number.isNaN(min) || Number.isNaN(max)) {
    return true;
  }
  return max >= min;
}

/**
 * Parses 'DD/MM/YYYY' into 'YYYY-MM-DD', validating real calendar dates (e.g. rejects 31/02/2026).
 */
export function parseDdMmYyyy(input: string): string | null {
  const m = input.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (
    dt.getUTCFullYear() !== year ||
    dt.getUTCMonth() !== month - 1 ||
    dt.getUTCDate() !== day
  ) {
    return null;
  }
  return `${m[3]}-${m[2]}-${m[1]}`;
}

export function formatIsoDateToDdMmYyyy(isoDate: string): string {
  const m = isoDate.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export function isValidIstDateTimeValue(val: string): boolean {
  if (val.trim() === '') return true;
  return /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(val.trim());
}

/**
 * Formats MySQL DATETIME ('YYYY-MM-DD HH:MM:SS') or datetime-local ('YYYY-MM-DDTHH:MM')
 * into DD/MM/YYYY, HH:mm (24-hour format, Asia/Kolkata).
 */
export function formatIstDateTime(mysqlDt: string | null | undefined): string {
  if (!mysqlDt) return '—';
  const match = mysqlDt
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::\d{2})?$/);
  if (match) {
    const [, year, month, day, hour, minute] = match;
    return `${day}/${month}/${year}, ${hour}:${minute}`;
  }

  const normalized = mysqlDt.replace(' ', 'T');
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) {
    return mysqlDt;
  }
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return `${get('day')}/${get('month')}/${get('year')}, ${get('hour')}:${get('minute')}`;
}

/**
 * Converts MySQL DATETIME ('YYYY-MM-DD HH:MM:SS') to HTML <input type="datetime-local"> value ('YYYY-MM-DDTHH:MM').
 */
export function toDateTimeLocalValue(mysqlDt: string | null | undefined): string {
  if (!mysqlDt) return '';
  return mysqlDt.replace(' ', 'T').slice(0, 16);
}

/**
 * Returns current date/time in Asia/Kolkata formatted for <input type="datetime-local"> (24-hour).
 */
export function nowIstDateTimeLocal(): string {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());

  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

export function parseEmailList(raw: string): { emails: string[]; invalid: string[] } {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const parts = raw
    .split(/[\s,;]+/)
    .map((p) => p.trim())
    .filter((p) => p !== '');
  const emails: string[] = [];
  const seen = new Set<string>();
  const invalid: string[] = [];

  for (const part of parts) {
    if (!emailRegex.test(part)) {
      invalid.push(part);
      continue;
    }
    const lower = part.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      emails.push(part);
    }
  }
  return { emails, invalid };
}

export function formatBudgetRange(min: number | null | undefined, max: number | null | undefined): string {
  if ((min === null || min === undefined) && (max === null || max === undefined)) {
    return 'Not specified';
  }
  const fmt = (val: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val);

  if (min !== null && min !== undefined && max !== null && max !== undefined) {
    return `${fmt(min)} – ${fmt(max)}`;
  }
  if (min !== null && min !== undefined) {
    return `From ${fmt(min)}`;
  }
  return `Up to ${fmt(max!)}`;
}

/**
 * KeyboardEvent handler that prevents typing non-numeric characters.
 * When allowDecimal is true, a single '.' is also permitted.
 */
export function handleNumericKeydown(event: KeyboardEvent, allowDecimal: boolean = false): void {
  const allowedControlKeys = [
    'Backspace',
    'Delete',
    'Tab',
    'Escape',
    'Enter',
    'ArrowLeft',
    'ArrowRight',
    'ArrowUp',
    'ArrowDown',
    'Home',
    'End',
  ];

  if (
    allowedControlKeys.includes(event.key) ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey
  ) {
    return;
  }

  if (allowDecimal && event.key === '.') {
    const target = event.target as HTMLInputElement | null;
    if (target && !target.value.includes('.')) {
      return;
    }
    event.preventDefault();
    return;
  }

  if (!/^[0-9]$/.test(event.key)) {
    event.preventDefault();
  }
}

/**
 * KeyboardEvent handler that allows only phone characters: digits, +, -, spaces, (, ).
 */
export function handlePhoneKeydown(event: KeyboardEvent): void {
  const allowedControlKeys = [
    'Backspace',
    'Delete',
    'Tab',
    'Escape',
    'Enter',
    'ArrowLeft',
    'ArrowRight',
    'ArrowUp',
    'ArrowDown',
    'Home',
    'End',
  ];

  if (
    allowedControlKeys.includes(event.key) ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey
  ) {
    return;
  }

  if (!/^[0-9+\-\s()]$/.test(event.key)) {
    event.preventDefault();
  }
}

