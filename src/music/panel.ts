import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  ThumbnailBuilder,
  type EmbedBuilder,
  type MessageMentionOptions,
  type User,
} from 'discord.js';
import type { Player, RepeatMode, Track, UnresolvedTrack } from 'lavalink-client';
import { brandEmbed, Colors } from '../ui/embeds.js';
import { formatDuration, progressBar, truncate } from './format.js';

declare module 'lavalink-client' {
  /** Quién pidió cada tema (se guarda con toRequester al buscar). */
  interface TrackRequester {
    id: string;
    username: string;
  }
}

export function toRequester(user: User): { id: string; username: string } {
  return { id: user.id, username: user.username };
}

export const REPEAT_LABELS: Record<RepeatMode, string> = {
  off: 'Desactivado',
  track: 'Tema actual',
  queue: 'Toda la cola',
};

const SOURCE_LABELS: Record<string, string> = {
  spotify: 'Spotify',
  soundcloud: 'SoundCloud',
  bandcamp: 'Bandcamp',
  twitch: 'Twitch',
  vimeo: 'Vimeo',
};

/** Paso de volumen de los botones 🔉 / 🔊. */
export const VOLUME_STEP = 10;
export const MAX_VOLUME = 150;

function escapeLinkText(text: string): string {
  return text.replace(/[[\]]/g, '');
}

export function trackLink(track: Track | UnresolvedTrack): string {
  const title = truncate(escapeLinkText(track.info.title), 80);
  return track.info.uri ? `[${title}](${track.info.uri})` : title;
}

export const ButtonIds = {
  previous: 'music:previous',
  toggle: 'music:toggle',
  skip: 'music:skip',
  stop: 'music:stop',
  volumeDown: 'music:volume-down',
  volumeUp: 'music:volume-up',
  loop: 'music:loop',
  shuffle: 'music:shuffle',
  queue: 'music:queue',
} as const;

function button(id: string, emoji: string, style = ButtonStyle.Secondary): ButtonBuilder {
  return new ButtonBuilder().setCustomId(id).setEmoji(emoji).setStyle(style);
}

function controlRows(player: Player): ActionRowBuilder<ButtonBuilder>[] {
  const repeatActive = player.repeatMode !== 'off';
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      button(ButtonIds.previous, '⏮️'),
      player.paused
        ? button(ButtonIds.toggle, '▶️', ButtonStyle.Success)
        : button(ButtonIds.toggle, '⏸️', ButtonStyle.Primary),
      button(ButtonIds.skip, '⏭️'),
      button(ButtonIds.stop, '⏹️', ButtonStyle.Danger),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      button(ButtonIds.volumeDown, '🔉').setDisabled(player.volume <= VOLUME_STEP),
      button(ButtonIds.volumeUp, '🔊').setDisabled(player.volume >= MAX_VOLUME),
      button(
        ButtonIds.loop,
        player.repeatMode === 'track' ? '🔂' : '🔁',
        repeatActive ? ButtonStyle.Success : ButtonStyle.Secondary,
      ),
      button(ButtonIds.shuffle, '🔀').setDisabled(player.queue.tracks.length < 2),
      button(ButtonIds.queue, '📜'),
    ),
  ];
}

/** Mensaje del panel: sirve igual para enviar, editar o responder a un botón. */
export interface PanelPayload {
  components: ContainerBuilder[];
  flags: MessageFlags.IsComponentsV2;
  allowedMentions: MessageMentionOptions;
}

/**
 * Tarjeta de "sonando ahora" con Components V2: carátula, título, barra de progreso,
 * estado y controles. Con controls=false se muestra solo la información (para /sonando).
 */
export function nowPlayingPanel(
  player: Player,
  track: Track,
  { controls = true }: { controls?: boolean } = {},
): PanelPayload {
  const { info } = track;
  const header = player.paused ? '-# ⏸️  EN PAUSA' : '-# 🎶  SONANDO AHORA';
  const title = `### ${trackLink(track)}`;
  const author = `**${truncate(info.author, 80)}**`;

  const container = new ContainerBuilder().setAccentColor(
    player.paused ? Colors.warning : Colors.brand,
  );

  const heading = [header, title, author].map((content) =>
    new TextDisplayBuilder().setContent(content),
  );
  if (info.artworkUrl) {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(...heading)
        .setThumbnailAccessory(
          new ThumbnailBuilder().setURL(info.artworkUrl).setDescription(info.title),
        ),
    );
  } else {
    container.addTextDisplayComponents(...heading);
  }

  container.addSeparatorComponents(
    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
  );

  const progress = info.isStream
    ? '🔴  **En vivo**'
    : `\`${formatDuration(player.position)}\`  ${progressBar(player.position, info.duration)}  \`${formatDuration(info.duration)}\``;

  const isAlternative = track.userData?.['alternative'] === 1;
  const status = [
    `🔊 ${player.volume}%`,
    `🔁 ${REPEAT_LABELS[player.repeatMode]}`,
    `📜 ${player.queue.tracks.length} en cola`,
    SOURCE_LABELS[info.sourceName] ?? info.sourceName,
  ];
  if (track.requester) status.push(`Pedido por <@${track.requester.id}>`);
  if (isAlternative) status.unshift('⚠️ Versión alternativa');

  const lines = [progress, `-# ${status.join('  ·  ')}`];
  const [next] = player.queue.tracks;
  if (next) {
    lines.push(
      `-# A continuación: ${truncate(escapeLinkText(next.info.title), 60)} — ${truncate(next.info.author ?? '', 40)}`,
    );
  }
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')));

  if (controls) {
    container.addSeparatorComponents(
      new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small),
    );
    container.addActionRowComponents(...controlRows(player));
  }

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    // La mención de quién pidió el tema se muestra pero no notifica.
    allowedMentions: { parse: [] },
  };
}

const QUEUE_PAGE_SIZE = 10;

/** Embed con la cola paginada (para /cola y el botón 📜). */
export function queueEmbed(player: Player, requestedPage = 1): EmbedBuilder {
  const tracks = player.queue.tracks;
  const pages = Math.max(1, Math.ceil(tracks.length / QUEUE_PAGE_SIZE));
  const page = Math.min(Math.max(1, requestedPage), pages);
  const start = (page - 1) * QUEUE_PAGE_SIZE;
  const current = player.queue.current;

  const lines = tracks
    .slice(start, start + QUEUE_PAGE_SIZE)
    .map(
      (track, i) =>
        `\`${start + i + 1}.\` ${trackLink(track)} · ${formatDuration(track.info.duration ?? 0)}`,
    );

  return brandEmbed()
    .setTitle('📜 Cola')
    .setDescription(
      [
        current ? `**Sonando:** ${trackLink(current)}` : '_Nada sonando._',
        '',
        ...(lines.length ? lines : ['_Nada más en cola._']),
      ].join('\n'),
    )
    .setFooter({
      text: `Página ${page}/${pages} · ${tracks.length} temas · ${formatDuration(player.queue.utils.totalDuration())} en total`,
    });
}

/** Orden de rotación del botón de repetir. */
export function nextRepeatMode(mode: RepeatMode): RepeatMode {
  return mode === 'off' ? 'queue' : mode === 'queue' ? 'track' : 'off';
}
