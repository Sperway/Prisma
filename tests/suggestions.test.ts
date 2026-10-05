import type { Track } from 'lavalink-client';
import { describe, expect, it } from 'vitest';
import { toChoice } from '../src/music/suggestions.js';

function track(info: Partial<Track['info']>): Track {
  return {
    info: {
      identifier: 'x',
      title: 'Mariposa Tecknicolor',
      author: 'Fito Páez',
      duration: 245_000,
      artworkUrl: null,
      uri: 'https://soundcloud.com/fito/mariposa',
      sourceName: 'soundcloud',
      isSeekable: true,
      isStream: false,
      isrc: null,
      ...info,
    },
    pluginInfo: {},
  };
}

describe('toChoice', () => {
  it('muestra título, autor y duración, y envía el enlace', () => {
    expect(toChoice(track({}))).toEqual({
      name: 'Mariposa Tecknicolor — Fito Páez (4:05)',
      value: 'https://soundcloud.com/fito/mariposa',
    });
  });

  it('respeta el límite de 100 caracteres de Discord', () => {
    const choice = toChoice(
      track({ title: 'a'.repeat(150), uri: `https://x.com/${'b'.repeat(120)}` }),
    );
    expect(choice.name.length).toBeLessThanOrEqual(100);
    expect(choice.name.endsWith('(4:05)')).toBe(true);
    expect(choice.value.length).toBeLessThanOrEqual(100);
    expect(choice.value.startsWith('http')).toBe(false); // enlace largo: se envía el texto
  });

  it('marca las transmisiones en vivo', () => {
    expect(toChoice(track({ isStream: true })).name).toContain('(en vivo)');
  });
});
