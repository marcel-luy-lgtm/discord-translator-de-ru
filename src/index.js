import { Client, Events, GatewayIntentBits, Partials } from 'discord.js';
import { config } from './config.js';
import { commandData, handleCommand } from './commands.js';
import { isTranslateChannel } from './store.js';
import { FLAGS, translate } from './translate.js';
import { sessions } from './voice.js';
import { budgetNotice, isBudgetExceeded } from './budget.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // muss im Developer Portal aktiviert sein
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [Partials.Channel],
});

client.once(Events.ClientReady, async (c) => {
  console.log(`Eingeloggt als ${c.user.tag}`);
  if (config.devGuildId) {
    const guild = await c.guilds.fetch(config.devGuildId);
    await guild.commands.set(commandData);
    console.log(`Slash-Befehle auf Server ${guild.name} registriert.`);
  } else {
    await c.application.commands.set(commandData);
    console.log('Slash-Befehle global registriert (kann bis zu 1 Std. dauern).');
  }
});

// --- Text: Auto-Übersetzung in freigeschalteten Channels ---
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || message.webhookId || !message.inGuild()) return;
  if (!message.content || !isTranslateChannel(message.guildId, message.channelId)) return;

  if (isBudgetExceeded()) {
    const notice = budgetNotice(message.channelId);
    if (notice) await message.channel.send({ content: notice, allowedMentions: { parse: [] } }).catch(() => {});
    return;
  }

  try {
    const result = await translate(message.content);
    if (!result) return;
    const text = `${FLAGS[result.target]} ${result.translation}`;
    await message.reply({
      content: text.length > 2000 ? `${text.slice(0, 1999)}…` : text,
      allowedMentions: { parse: [], repliedUser: false },
    });
  } catch (err) {
    console.error('[text] Übersetzung fehlgeschlagen:', err.message);
  }
});

// --- Slash-Befehle ---
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  try {
    await handleCommand(interaction);
  } catch (err) {
    console.error(`[cmd] /${interaction.commandName}:`, err);
    const payload = { content: '❌ Da ist etwas schiefgelaufen.', flags: 64 };
    if (interaction.deferred || interaction.replied) await interaction.editReply(payload).catch(() => {});
    else await interaction.reply(payload).catch(() => {});
  }
});

// --- Voice: automatisch gehen, wenn keine Menschen mehr im Channel sind ---
client.on(Events.VoiceStateUpdate, (oldState) => {
  const session = sessions.get(oldState.guild.id);
  if (!session || oldState.channelId !== session.channel.id) return;
  const humans = session.channel.members.filter((m) => !m.user.bot);
  if (humans.size === 0) session.destroy();
});

const shutdown = () => {
  for (const s of sessions.values()) s.destroy();
  client.destroy().finally(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

client.login(config.discordToken);
