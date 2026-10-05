import { describe, expect, it } from 'vitest';
import {
  formatDuration,
  isYouTubeUrl,
  parseUrl,
  progressBar,
  truncate,
} from '../src/music/format.js';
import { nextRepeatMode } from '../src/music/panel.js';

describe('formatDuration', () => {
  it.each([
    [0, '0:00'],
    [5_000, '0:05'],
    [65_000, '1:05'],
    [3_725_000, '1:02:05'],
    [-1, '0:00'],
  ])('%i ms → %s', (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected);
  });
});

describe('progressBar', () => {
  it('ubica el indicador según el avance', () => {
    expect(progressBar(0, 100, 5)).toBe('🔘▬▬▬▬');
    expect(progressBar(50, 100, 5)).toBe('▬▬🔘▬▬');
    expect(progressBar(100, 100, 5)).toBe('▬▬▬▬🔘');
  });

  it('no se rompe con duraciones inválidas', () => {
    expect(progressBar(10, 0, 5)).toBe('▬▬▬▬▬');
    expect(progressBar(500, 100, 5)).toBe('▬▬▬▬🔘');
  });
});

describe('truncate', () => {
  it('recorta con puntos suspensivos', () => {
    expect(truncate('hola', 10)).toBe('hola');
    expect(truncate('hola mundo', 5)).toBe('hola…');
  });
});

describe('parseUrl / isYouTubeUrl', () => {
  it('distingue búsquedas de enlaces', () => {
    expect(parseUrl('daft punk one more time')).toBeNull();
    expect(parseUrl('javascript:alert(1)')).toBeNull();
    expect(parseUrl('https://soundcloud.com/artista/tema')?.hostname).toBe('soundcloud.com');
  });

  it.each([
    'https://www.youtube.com/watch?v=abc',
    'https://youtu.be/abc',
    'https://music.youtube.com/watch?v=abc',
    'https://m.youtube.com/watch?v=abc',
  ])('detecta YouTube: %s', (link) => {
    const url = parseUrl(link);
    expect(url && isYouTubeUrl(url)).toBe(true);
  });

  it('no confunde otros dominios con YouTube', () => {
    const url = parseUrl('https://notyoutube.com/x');
    expect(url && isYouTubeUrl(url)).toBe(false);
  });
});

describe('nextRepeatMode', () => {
  it('rota off → cola → tema → off', () => {
    expect(nextRepeatMode('off')).toBe('queue');
    expect(nextRepeatMode('queue')).toBe('track');
    expect(nextRepeatMode('track')).toBe('off');
  });
});
