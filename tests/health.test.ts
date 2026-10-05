import { describe, expect, it } from 'vitest';
import { HEARTBEAT_MAX_AGE_MS, isHeartbeatFresh } from '../src/health.js';

describe('isHeartbeatFresh', () => {
  const now = 1_000_000_000;

  it('acepta un latido reciente', () => {
    expect(isHeartbeatFresh(String(now - 5_000), now)).toBe(true);
  });

  it('rechaza un latido viejo', () => {
    expect(isHeartbeatFresh(String(now - HEARTBEAT_MAX_AGE_MS), now)).toBe(false);
  });

  it('rechaza contenido corrupto', () => {
    expect(isHeartbeatFresh('', now)).toBe(false);
    expect(isHeartbeatFresh('hola', now)).toBe(false);
  });
});
