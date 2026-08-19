import { describe, it, expect, beforeEach } from 'vitest';
import { countPresence, getPresenceKey } from './useRealtimeChat';

// Stub localStorage (tests node, pas de DOM)
const store = new Map<string, string>();
globalThis.localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: () => null,
  get length() { return store.size; },
} as Storage;

describe('countPresence', () => {
  it('compte 0 partout sur un état vide', () => {
    expect(countPresence({})).toEqual({ online: 0, onSite: 0 });
  });

  it('compte une personne par clé, pas par onglet', () => {
    const state = {
      'user-a': [{ is_present: false }, { is_present: false }],
      'user-b': [{ is_present: false }],
    };
    expect(countPresence(state)).toEqual({ online: 2, onSite: 0 });
  });

  it('une personne est sur place si au moins un de ses onglets est vérifié GPS', () => {
    const state = {
      'user-a': [{ is_present: false }, { is_present: true }],
      'user-b': [{ is_present: false }],
      'anon-x': [{ is_present: true }],
    };
    expect(countPresence(state)).toEqual({ online: 3, onSite: 2 });
  });

  it('onSite ne dépasse jamais online', () => {
    const state = {
      'user-a': [{ is_present: true }, { is_present: true }],
    };
    expect(countPresence(state)).toEqual({ online: 1, onSite: 1 });
  });

  it('ignore les métadonnées sans is_present', () => {
    const state = {
      'user-a': [{}],
    };
    expect(countPresence(state)).toEqual({ online: 1, onSite: 0 });
  });
});

describe('getPresenceKey', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("retourne l'id utilisateur quand connecté", () => {
    expect(getPresenceKey('user-123')).toBe('user-123');
  });

  it('génère une clé anonyme stable entre deux appels (multi-onglets, remounts)', () => {
    const first = getPresenceKey(undefined);
    const second = getPresenceKey(undefined);
    expect(first).toMatch(/^anon-/);
    expect(second).toBe(first);
  });

  it("ne réutilise pas la clé anonyme une fois l'utilisateur connecté", () => {
    const anon = getPresenceKey(undefined);
    expect(getPresenceKey('user-123')).not.toBe(anon);
  });
});
