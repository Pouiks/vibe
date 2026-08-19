import { describe, it, expect } from 'vitest';
import { parseScanResult } from './parseScanResult';

describe('parseScanResult', () => {
  it('accepts a production venue QR and keeps only the token', () => {
    expect(parseScanResult('https://atoute.app/l/paris/bastille/skatepark?t=abc123&utm_source=x'))
      .toBe('/l/paris/bastille/skatepark?t=abc123');
  });

  it('accepts a legacy QR printed with the old vercel domain', () => {
    expect(parseScanResult('https://vibe-ten-pi.vercel.app/l/paris/bastille/skatepark?t=abc123'))
      .toBe('/l/paris/bastille/skatepark?t=abc123');
  });

  it('accepts a venue URL from any host (path is what matters, routing stays in-app)', () => {
    expect(parseScanResult('https://example.com/l/bordeaux/montcalm/basket-court?t=deadbeef'))
      .toBe('/l/bordeaux/montcalm/basket-court?t=deadbeef');
  });

  it('accepts a relative venue path', () => {
    expect(parseScanResult('/l/paris/marais/le-bureau?t=ff00'))
      .toBe('/l/paris/marais/le-bureau?t=ff00');
  });

  it('keeps a tokenless venue URL as spectator entry', () => {
    expect(parseScanResult('https://vibe-ten-pi.vercel.app/l/paris/marais/le-bureau'))
      .toBe('/l/paris/marais/le-bureau');
  });

  it('rejects non-venue paths', () => {
    expect(parseScanResult('https://vibe-ten-pi.vercel.app/profile')).toBeNull();
    expect(parseScanResult('https://evil.com/phishing')).toBeNull();
  });

  it('rejects path traversal and malformed venue paths', () => {
    expect(parseScanResult('https://x.com/l/a/b')).toBeNull();
    expect(parseScanResult('https://x.com/l/a/b/c/d')).toBeNull();
  });

  it('rejects dangerous protocols', () => {
    expect(parseScanResult('javascript:alert(1)')).toBeNull();
  });

  it('rejects arbitrary text', () => {
    expect(parseScanResult('hello world, wifi: azerty123')).toBeNull();
  });
});
