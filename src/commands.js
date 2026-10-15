import {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import {
  addTranslateChannel,
  getUsage,
  listTranslateChannels,
  removeTranslateChannel,
} from './store.js';
import { MODES, VoiceSession, sessions } from './voice.js';
import { config } from './config.js';

const modeOption = (o) =>
  o
    .setName('modus')
    .setDescription('Wie soll die Übersetzung ausgegeben werden?')
    .addChoices(...Object.entries(MODES).map(([value, name]) => ({ name, value })));

export const commandData = [
  new SlashCommandBuilder()
    .setName('uebersetzen')
    .setDescription('Automatische Text-Übersetzung DE↔RU in Channels verwalten')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setContexts(0) // nur auf Servern
    .addSubcommand((s) =>
      s
        .setName('an')
        .setDescription('Auto-Übersetzung in einem Channel einschalten')
        .addChannelOption((o) =>
          o
            .setName('channel')
            .setDescription('Channel (Standard: dieser Channel)')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildVoice),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('aus')
        .setDescription('Auto-Übersetzung in einem Channel ausschalten')
        .addChannelOption((o) => o.setName('channel').setDescription('Channel (Standard: dieser Channel)')),
    )
    .addSubcommand((s) => s.setName('liste').setDescription('Alle Channels mit Auto-Übersetzung anzeigen')),

  new SlashCommandBuilder()
    .setName('voice')
    .setDescription('Live-Übersetzung im Sprach-/Video-Channel')
    .setContexts(0)
    .addSubcommand((s) =>
      s
        .setName('start')
        .setDescription('Bot kommt in deinen Voice-Channel und übersetzt das Gesprochene')
        .addStringOption((o) => modeOption(o)),
    )
    .addSubcommand((s) =>
      s
        .setName('modus')
        .setDescription('Ausgabe umschalten: Text, Audio oder beides')
        .addStringOption((o) => modeOption(o).setRequired(true)),
    )
    .addSubcommand((s) => s.setName('stop').setDescription('Bot verlässt den Voice-Channel')),

  new SlashCommandBuilder()
    .setName('kosten')
    .setDescription('Geschätzte API-Kosten für heute und diesen Monat')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setContexts(0),
].map((c) => c.toJSON());

const reply = (interaction, content) =>
  interaction.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });

export async function handleCommand(interaction) {
  switch (interaction.commandName) {
    case 'uebersetzen':
      return handleTranslateChannels(interaction);
    case 'voice':
      return handleVoice(interaction);
    case 'kosten':
      return handleCosts(interaction);
  }
}

async function handleTranslateChannels(interaction) {
  const sub = interaction.options.getSubcommand();
  const channel = interaction.options.getChannel('channel') ?? interaction.channel;

  if (sub === 'an') {
    addTranslateChannel(interaction.guildId, channel.id);
    return reply(interaction, `✅ Auto-Übersetzung DE↔RU ist jetzt in ${channel} aktiv.`);
  }
  if (sub === 'aus') {
    const removed = removeTranslateChannel(interaction.guildId, channel.id);
    return reply(interaction, removed ? `⏹️ Auto-Übersetzung in ${channel} ausgeschaltet.` : `ℹ️ In ${channel} war sie nicht aktiv.`);
  }
  const ids = listTranslateChannels(interaction.guildId);
  return reply(
    interaction,
    ids.length ? `Auto-Übersetzung aktiv in:\n${ids.map((id) => `• <#${id}>`).join('\n')}` : 'Noch keine Channels eingerichtet. Nutze `/uebersetzen an`.',
  );
}

async function handleVoice(interaction) {
  const sub = interaction.options.getSubcommand();
  const existing = sessions.get(interaction.guildId);

  if (sub === 'stop') {
    if (!existing) return reply(interaction, 'ℹ️ Ich bin in keinem Voice-Channel.');
    existing.destroy();
    return reply(interaction, '👋 Voice-Übersetzung beendet.');
  }

  if (sub === 'modus') {
    if (!existing) return reply(interaction, 'ℹ️ Ich bin in keinem Voice-Channel. Starte mit `/voice start`.');
    const mode = interaction.options.getString('modus', true);
    existing.setMode(mode);
    return reply(interaction, `🔁 Modus: **${MODES[mode]}**`);
  }

  // start
  const mode = interaction.options.getString('modus') ?? 'text';
  const member = await interaction.guild.members.fetch(interaction.user.id);
  const channel = member.voice.channel;
  if (!channel) return reply(interaction, '❌ Du musst zuerst selbst in einem Voice-/Video-Channel sein.');

  const me = interaction.guild.members.me;
  const perms = channel.permissionsFor(me);
  const needed = [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages];
  if (!perms?.has(needed)) {
    return reply(interaction, '❌ Mir fehlen Rechte in diesem Channel (Ansehen, Verbinden, Sprechen, Nachrichten senden).');
  }

  if (existing) {
    if (existing.channel.id === channel.id) {
      existing.setMode(mode);
      return reply(interaction, `🔁 Ich bin schon da. Modus: **${MODES[mode]}**`);
    }
    existing.destroy();
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const session = new VoiceSession(channel, mode);
  sessions.set(interaction.guildId, session);
  try {
    await session.start();
  } catch (err) {
    console.error('[voice] Beitritt fehlgeschlagen:', err);
    session.destroy();
    return interaction.editReply('❌ Konnte dem Voice-Channel nicht beitreten. Bitte erneut versuchen.');
  }
  await channel
    .send({
      content:
        `🎙️ **Live-Übersetzung aktiv** (${MODES[mode]}) – Deutsch ↔ Russisch. Gesprochenes wird an OpenAI zur Übersetzung gesendet.\n` +
        `🎙️ **Синхронный перевод включён** – немецкий ↔ русский. Речь отправляется в OpenAI для перевода.`,
    })
    .catch(() => {});
  return interaction.editReply(`✅ Ich übersetze jetzt in ${channel}. Modus: **${MODES[mode]}**`);
}

// Richtwerte in USD (Stand 2026, bitte bei OpenAI prüfen): pro 1 Mio. Tokens bzw. pro Minute / 1 Mio. Zeichen
const PRICES = {
  inputPerMTok: 0.15,
  outputPerMTok: 0.6,
  sttPerMinute: 0.003,
  ttsPerMChars: 12,
};

function estimate(u) {
  const text = (u.inputTokens * PRICES.inputPerMTok + u.outputTokens * PRICES.outputPerMTok) / 1e6;
  const stt = (u.sttSeconds / 60) * PRICES.sttPerMinute;
  const tts = (u.ttsChars * PRICES.ttsPerMChars) / 1e6;
  return { text, stt, tts, total: text + stt + tts };
}

async function handleCosts(interaction) {
  const { day, month, monthKey } = getUsage();
  const fmt = (n) => `$${n.toFixed(2)}`;
  const block = (label, u) => {
    const e = estimate(u);
    return (
      `**${label}** – ca. ${fmt(e.total)}\n` +
      `• Übersetzungen: ${u.messages} (${fmt(e.text)})\n` +
      `• Sprache erkannt: ${(u.sttSeconds / 60).toFixed(1)} Min. (${fmt(e.stt)})\n` +
      `• Vorgelesen: ${u.ttsChars} Zeichen (${fmt(e.tts)})`
    );
  };
  const limit = config.voiceDailyMinuteLimit ? `\nTageslimit Sprache: ${config.voiceDailyMinuteLimit} Min.` : '';
  return reply(
    interaction,
    `${block('Heute', day)}\n\n${block(`Monat ${monthKey}`, month)}${limit}\n-# Schätzung. Die genaue Abrechnung steht unter platform.openai.com/usage`,
  );
}
