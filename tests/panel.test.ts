import { ComponentType } from 'discord.js';
import type { Player, Track } from 'lavalink-client';
import { describe, expect, it } from 'vitest';
import { ButtonIds, nowPlayingPanel } from '../src/music/panel.js';

const track = (title: string, artworkUrl: string | null = 'https://img/cover.jpg'): Track => ({
  info: {
    identifier: title,
    title,
    author: 'Fito Páez',
    duration: 245_000,
    artworkUrl,
    uri: 'https://open.spotify.com/track/x',
    sourceName: 'spotify',
    isSeekable: true,
    isStream: false,
    isrc: null,
  },
  pluginInfo: {},
  requester: { id: '123456789012345678', username: 'matias' },
});

function fakePlayer(overrides: Partial<Player> = {}, queued: Track[] = []): Player {
  return {
    paused: false,
    playing: true,
    position: 84_000,
    volume: 80,
    repeatMode: 'off',
    queue: { tracks: queued, current: null },
    ...overrides,
  } as unknown as Player;
}

/** Recorre el JSON de la tarjeta y junta textos y botones. */
function inspect(player: Player, current: Track, controls = true) {
  const payload = nowPlayingPanel(player, current, { controls });
  const json = JSON.stringify(payload.components.map((c) => c.toJSON()));
  const buttons = new Map<string, { disabled?: boolean; style: number }>();
  JSON.parse(json, (key, value) => {
    if (value?.type === ComponentType.Button) buttons.set(value.custom_id, value);
    return value;
  });
  return { payload, json, buttons };
}

describe('nowPlayingPanel', () => {
  it('arma la tarjeta con carátula, progreso, estado y controles', () => {
    const { payload, json, buttons } = inspect(
      fakePlayer({}, [track('El amor después del amor')]),
      track('Mariposa Tecknicolor'),
    );

    expect(payload.allowedMentions).toEqual({ parse: [] }); // no notifica a quien pidió el tema
    expect(json).toContain('SONANDO AHORA');
    expect(json).toContain('Mariposa Tecknicolor');
    expect(json).toContain('`1:24`');
    expect(json).toContain('`4:05`');
    expect(json).toContain('A continuación: El amor después del amor');
    expect(json).toContain('https://img/cover.jpg');
    expect(buttons.size).toBe(9);
    expect(buttons.get(ButtonIds.shuffle)?.disabled).toBe(true); // 1 tema en cola: no se mezcla
  });

  it('refleja la pausa y los límites de volumen', () => {
    const { json, buttons } = inspect(fakePlayer({ paused: true, volume: 150 }), track('Tema'));
    expect(json).toContain('EN PAUSA');
    expect(buttons.get(ButtonIds.volumeUp)?.disabled).toBe(true);
    expect(buttons.get(ButtonIds.volumeDown)?.disabled).toBeFalsy();
  });

  it('funciona sin carátula y sin controles', () => {
    const { json, buttons } = inspect(fakePlayer(), track('Tema', null), false);
    expect(json).toContain('Tema');
    expect(buttons.size).toBe(0);
  });
});
