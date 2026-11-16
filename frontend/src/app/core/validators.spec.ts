import {
  formatBudgetRange,
  formatIstDateTime,
  handleNumericKeydown,
  handlePhoneKeydown,
  isBudgetRangeValid,
  isValidIstDateTimeValue,
  parseDdMmYyyy,
  parseEmailList,
  parseOptionalNonNegativeNumber,
} from './validators';

describe('Validators', () => {
  it('parses optional non-negative numbers cleanly', () => {
    expect(parseOptionalNonNegativeNumber('')).toBeNull();
    expect(parseOptionalNonNegativeNumber('4500000')).toBe(4500000);
    expect(Number.isNaN(parseOptionalNonNegativeNumber('-100'))).toBe(true);
    expect(Number.isNaN(parseOptionalNonNegativeNumber('abc'))).toBe(true);
  });

  it('allows valid budget range when max >= min', () => {
    expect(isBudgetRangeValid('3000000', '5000000')).toBe(true);
    expect(isBudgetRangeValid('3000000', '')).toBe(true);
    expect(isBudgetRangeValid('', '5000000')).toBe(true);
  });

  it('rejects budget range when budget_max < budget_min', () => {
    expect(isBudgetRangeValid('6000000', '4000000')).toBe(false);
  });

  it('formats budget range cleanly', () => {
    expect(formatBudgetRange(null, null)).toBe('Not specified');
    expect(formatBudgetRange(500000, 1000000)).toContain('–');
  });

  it('formats date and time in DD/MM/YYYY, HH:mm 24-hour format', () => {
    expect(formatIstDateTime('2026-11-25 14:05:00')).toBe('25/11/2026, 14:05');
    expect(formatIstDateTime('2026-03-09T00:08')).toBe('09/03/2026, 00:08');
    expect(formatIstDateTime(null)).toBe('—');
  });

  it('parses DD/MM/YYYY dates and rejects invalid calendar dates', () => {
    expect(parseDdMmYyyy('25/11/2026')).toBe('2026-11-25');
    expect(parseDdMmYyyy('31/02/2026')).toBeNull();
    expect(parseDdMmYyyy('11/13/2026')).toBeNull();
    expect(isValidIstDateTimeValue('2026-11-25T14:30')).toBe(true);
    expect(isValidIstDateTimeValue('INVALID:31/02/2026')).toBe(false);
  });

  it('parses and deduplicates multiple recipient emails', () => {
    const res = parseEmailList('a@example.com, b@example.com; A@example.com\nc@test.in');
    expect(res.emails).toEqual(['a@example.com', 'b@example.com', 'c@test.in']);
    expect(res.invalid).toEqual([]);

    const bad = parseEmailList('valid@test.com, not-an-email');
    expect(bad.emails).toEqual(['valid@test.com']);
    expect(bad.invalid).toEqual(['not-an-email']);
  });

  it('prevents non-numeric key inputs in numeric fields', () => {
    let prevented = false;
    const mockEventChar = {
      key: 'a',
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      target: document.createElement('input'),
      preventDefault: () => {
        prevented = true;
      },
    } as unknown as KeyboardEvent;
    handleNumericKeydown(mockEventChar, true);
    expect(prevented).toBe(true);

    let allowedDigit = true;
    const mockEventDigit = {
      key: '5',
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      target: document.createElement('input'),
      preventDefault: () => {
        allowedDigit = false;
      },
    } as unknown as KeyboardEvent;
    handleNumericKeydown(mockEventDigit, true);
    expect(allowedDigit).toBe(true);
  });

  it('allows phone characters and prevents invalid letters in phone fields', () => {
    let prevented = false;
    const mockEventLetter = {
      key: 'x',
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      preventDefault: () => {
        prevented = true;
      },
    } as unknown as KeyboardEvent;
    handlePhoneKeydown(mockEventLetter);
    expect(prevented).toBe(true);

    let allowedPlus = true;
    const mockEventPlus = {
      key: '+',
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      preventDefault: () => {
        allowedPlus = false;
      },
    } as unknown as KeyboardEvent;
    handlePhoneKeydown(mockEventPlus);
    expect(allowedPlus).toBe(true);
  });
});
