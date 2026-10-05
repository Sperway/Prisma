import { OAuth2Scopes, PermissionFlagsBits, type Client } from 'discord.js';
import type { BotContext } from '../commands/types.js';

/** Permisos que pide la invitación del bot. Se amplían a medida que se suman funciones. */
const INVITE_PERMISSIONS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.ReadMessageHistory,
  PermissionFlagsBits.Connect,
  PermissionFlagsBits.Speak,
];

export async function handleReady(client: Client<true>, ctx: BotContext): Promise<void> {
  const { logger, config } = ctx;
  logger.info({ user: client.user.tag }, 'Conectado a Discord');

  await ctx.music.init({ id: client.user.id, username: client.user.username });

  // Salir de cualquier servidor que no sea el nuestro (por si alguien obtuvo la invitación).
  for (const guild of client.guilds.cache.values()) {
    if (guild.id !== config.DISCORD_GUILD_ID) {
      logger.warn({ guild: guild.id, name: guild.name }, 'Servidor no autorizado: saliendo');
      await guild.leave();
    }
  }

  if (!client.guilds.cache.has(config.DISCORD_GUILD_ID)) {
    const invite = client.generateInvite({
      scopes: [OAuth2Scopes.Bot, OAuth2Scopes.ApplicationsCommands],
      permissions: INVITE_PERMISSIONS,
      guild: config.DISCORD_GUILD_ID,
      disableGuildSelect: true,
    });
    logger.warn({ invite }, 'Prisma todavía no está en el servidor. Invitalo con este enlace');
    return;
  }

  // Registro en el servidor (no global): los cambios se ven al instante y es idempotente.
  const body = [...ctx.commands.values()].map((command) => command.data.toJSON());
  await client.application.commands.set(body, config.DISCORD_GUILD_ID);
  logger.info({ count: body.length }, 'Comandos sincronizados');
}
