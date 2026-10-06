import { describe, expect, it, vi } from 'vitest';
import {
  pickLavaplayerFormat,
  scoreCandidate,
  SoundCloudResolver,
  type SoundCloudCandidate,
} from '../src/music/soundcloud.js';

const hls = (mime: string, url: string) => ({ url, format: { protocol: 'hls', mime_type: mime } });
const progressive = (url: string) => ({
  url,
  format: { protocol: 'progressive', mime_type: 'audio/mpeg' },
});

function candidate(overrides: Partial<SoundCloudCandidate>): SoundCloudCandidate {
  return {
    title: 'Mi Chain de Roque',
    permalink_url: 'https://soundcloud.com/x/y',
    duration: 180_000,
    policy: 'MONETIZE',
    user: { username: 'Duki' },
    media: { transcodings: [] },
    ...overrides,
  };
}

describe('pickLavaplayerFormat', () => {
  it('elige como lavaplayer: HLS Opus, HLS MP3 y después MP3 progresivo (nunca AAC)', () => {
    const aac = hls('audio/mp4; codecs="mp4a.40.2"', 'aac');
    const abr = hls('audio/mpegurl', 'abr');
    const formats = [aac, abr, progressive('prog'), hls('audio/mpeg', 'mp3')];
    expect(pickLavaplayerFormat(formats)?.url).toBe('mp3');
    expect(pickLavaplayerFormat([aac, progressive('prog')])?.url).toBe('prog');
    expect(pickLavaplayerFormat([aac, abr])).toBeUndefined();
  });
});

describe('scoreCandidate', () => {
  const query = { title: 'Mi Chain de Roque', author: 'Duki, 0800 Don Rouch', durationMs: 180_000 };

  it('prefiere la versión con el mismo título, artista y duración', () => {
    const exact = scoreCandidate(query, candidate({}));
    const other = scoreCandidate(query, candidate({ title: 'Otro tema', user: { username: 'X' } }));
    expect(exact).toBeGreaterThan(0.9);
    expect(other).toBeLessThan(0.35);
  });

  it('penaliza remixes y versiones en vivo que no se pidieron', () => {
    const remix = scoreCandidate(query, candidate({ title: 'Mi Chain de Roque (Remix)' }));
    expect(remix).toBeLessThan(scoreCandidate(query, candidate({})));
    const askedRemix = scoreCandidate(
      { title: 'Tema (Remix)' },
      candidate({ title: 'Tema (Remix)' }),
    );
    expect(askedRemix).toBeGreaterThan(0.6);
  });

  it('ignora acentos, mayúsculas y signos', () => {
    const score = scoreCandidate(
      { title: 'Mariposa Tecknicolor', author: 'Fito Páez' },
      candidate({ title: 'MARIPOSA TECKNICOLOR - Fito Paez', user: { username: 'fan' } }),
    );
    expect(score).toBeGreaterThan(0.9);
  });
});

describe('SoundCloudResolver.findPlayable', () => {
  function fakeSoundCloud(collection: SoundCloudCandidate[], playableUrls: string[]) {
    return vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url === 'https://soundcloud.com/') {
        return new Response('<script crossorigin src="https://a-v2.sndcdn.com/app.js"></script>');
      }
      if (url.startsWith('https://a-v2.sndcdn.com/')) {
        return new Response('x={client_id:"abcdefghijklmnopqrstuvwxyz012345"}');
      }
      if (url.includes('/search/tracks')) return new Response(JSON.stringify({ collection }));
      const lookup = url.split('?')[0] ?? '';
      return new Response('{}', { status: playableUrls.includes(lookup) ? 200 : 404 });
    });
  }

  it('saltea la versión oficial sin MP3 (404) y elige la siguiente mejor reproducible', async () => {
    const official = candidate({
      permalink_url: 'https://soundcloud.com/oficial',
      media: { transcodings: [hls('audio/mpeg', 'https://api/oficial-mp3')] },
    });
    const alternative = candidate({
      title: 'MI CHAIN DE ROQUE - DUKI',
      permalink_url: 'https://soundcloud.com/alternativa',
      media: { transcodings: [hls('audio/mpeg', 'https://api/alt-mp3')] },
    });
    const fetchFn = fakeSoundCloud([official, alternative], ['https://api/alt-mp3']);

    const url = await new SoundCloudResolver(fetchFn).findPlayable({
      title: 'Mi Chain de Roque',
      author: 'Duki',
      durationMs: 180_000,
    });
    expect(url).toBe('https://soundcloud.com/alternativa');
  });

  it('devuelve null si ninguna versión se puede reproducir', async () => {
    const onlyAac = candidate({
      media: { transcodings: [hls('audio/mp4; codecs="mp4a.40.2"', 'https://api/aac')] },
    });
    const fetchFn = fakeSoundCloud([onlyAac], ['https://api/aac']);
    const url = await new SoundCloudResolver(fetchFn).findPlayable({ title: 'Mi Chain de Roque' });
    expect(url).toBeNull();
  });
});
