import { describe, it, expect } from 'vitest';
import { formatCountdown, formatEventTiming, formatEventDate, formatDuration } from './datetime';

const NOW = new Date('2026-08-18T10:00:00Z').getTime();
const at = (offsetMin: number) => new Date(NOW + offsetMin * 60_000).toISOString();

describe('formatCountdown', () => {
  it('says "Maintenant !" for past or current start', () => {
    expect(formatCountdown(at(0), NOW)).toBe('Maintenant !');
    expect(formatCountdown(at(-5), NOW)).toBe('Maintenant !');
  });

  it('formats minutes under an hour', () => {
    expect(formatCountdown(at(25), NOW)).toBe('Dans 25 min');
  });

  it('formats hours with padded minutes', () => {
    expect(formatCountdown(at(90), NOW)).toBe('Dans 1h30');
    expect(formatCountdown(at(120), NOW)).toBe('Dans 2h');
  });

  it('formats days beyond 24 h', () => {
    expect(formatCountdown(at(3 * 24 * 60), NOW)).toBe('Dans 3 j');
  });
});

describe('formatEventTiming', () => {
  it('uses the countdown under 24 h', () => {
    expect(formatEventTiming(at(23 * 60), NOW)).toBe('Dans 23h');
  });

  it('uses the date beyond 24 h', () => {
    expect(formatEventTiming(at(25 * 60), NOW)).toMatch(/\d{2}\/\d{2} · \d{2}:\d{2}/);
  });
});

describe('formatEventDate', () => {
  it('renders day, date and time', () => {
    expect(formatEventDate('2026-08-22T14:00:00')).toMatch(/^\S+ 22\/08 · 14:00$/);
  });
});

describe('formatDuration', () => {
  it('formats minutes, whole hours and mixed durations', () => {
    expect(formatDuration(45)).toBe('45 min');
    expect(formatDuration(60)).toBe('1h');
    expect(formatDuration(90)).toBe('1h30');
  });
});
