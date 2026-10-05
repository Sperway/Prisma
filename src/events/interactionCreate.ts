import { MessageFlags, type Interaction } from 'discord.js';
import type { BotContext } from '../commands/types.js';
import { handleMusicButton } from '../music/buttons.js';
import { errorEmbed } from '../ui/embeds.js';

export async function handleInteraction(interaction: Interaction, ctx: BotContext): Promise<void> {
  // Prisma es de un único servidor privado: ignora cualquier otro origen (incluidos DMs).
  if (interaction.guildId !== ctx.config.DISCORD_GUILD_ID) return;

  if (interaction.isButton()) {
    try {
      await handleMusicButton(interaction, ctx.music, ctx.logger);
    } catch (error) {
      ctx.logger.error({ err: error, button: interaction.customId }, 'Error en botón');
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  const command = ctx.commands.get(interaction.commandName);
  if (!command) {
    ctx.logger.warn({ command: interaction.commandName }, 'Comando desconocido');
    return;
  }

  const log = ctx.logger.child({ command: interaction.commandName, user: interaction.user.id });
  const started = performance.now();

  try {
    await command.execute(interaction, ctx);
    log.info({ ms: Math.round(performance.now() - started) }, 'Comando ejecutado');
  } catch (error) {
    log.error({ err: error }, 'Error ejecutando comando');
    const payload = {
      embeds: [errorEmbed('Algo salió mal ejecutando el comando. Ya quedó registrado.')],
      flags: MessageFlags.Ephemeral,
    } as const;
    // Si Discord ya no acepta la respuesta (p. ej. expiró), no hay nada más que hacer.
    await (
      interaction.replied || interaction.deferred
        ? interaction.followUp(payload)
        : interaction.reply(payload)
    ).catch(() => undefined);
  }
}
