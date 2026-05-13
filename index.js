const express = require("express");
const {
  Client, GatewayIntentBits, AttachmentBuilder, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  REST, Routes, SlashCommandBuilder, InteractionType, ComponentType
} = require("discord.js");

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const CONFIG = {
  BOT_TOKEN:    process.env.BOT_TOKEN,
  CLIENT_ID:    process.env.CLIENT_ID,    // ID приложения бота (Discord Dev Portal)
  GUILD_ID:     process.env.GUILD_ID,     // ID твоего Discord сервера
  API_SECRET:   process.env.API_SECRET,
  PORT:         process.env.PORT || 3000,

  CHANNELS: {
    SCREENSHOT_ADMIN: process.env.CH_SCREENSHOT_ADMIN || "1496897127010537531",
    SCREENSHOT_MODER: process.env.CH_SCREENSHOT_MODER || "1496897127010537529",
    BAN_LOG:          process.env.CH_BAN_LOG          || "1496897127190761735",
    KEY_LOG:          process.env.CH_KEY_LOG          || "1502798344777633793",
    STEAM_ACCOUNTS:   process.env.CH_STEAM_ACCOUNTS   || "1503078678387491027",
  }
};

if (!CONFIG.BOT_TOKEN)  { console.error("[FATAL] BOT_TOKEN не задан!");  process.exit(1); }
if (!CONFIG.API_SECRET) { console.error("[FATAL] API_SECRET не задан!"); process.exit(1); }
if (!CONFIG.CLIENT_ID)  { console.error("[FATAL] CLIENT_ID не задан!");  process.exit(1); }
if (!CONFIG.GUILD_ID)   { console.error("[FATAL] GUILD_ID не задан!");   process.exit(1); }
// ──────────────────────────────────────────────────────────────────────────────

const app = express();
app.use(express.json({ limit: "50mb" }));

const bot = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function getChannel(id) {
  return bot.channels.cache.get(id) ?? null;
}

function steamProfileEmbed(steamId) {
  return new EmbedBuilder().setAuthor({
    name: "Кликни чтобы перейти в профиль игрока",
    url: `https://steamcommunity.com/profiles/${steamId}/`,
    iconURL: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/83/Steam_icon_logo.svg/2048px-Steam_icon_logo.svg.png"
  });
}

function screenshotButtons(steamId, includeModActions) {
  const row = new ActionRowBuilder();
  if (includeModActions) {
    row.addComponents(
      new ButtonBuilder().setCustomId(`ban_${steamId}`).setLabel("BAN").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`unban_${steamId}`).setLabel("UNBAN").setStyle(ButtonStyle.Success)
    );
  }
  row.addComponents(
    new ButtonBuilder().setCustomId(`screen_${steamId}`).setLabel("SCREEN").setStyle(ButtonStyle.Primary)
  );
  return row;
}

function nowTime() {
  return new Date().toLocaleString("ru-RU", { timeZone: "Europe/Moscow" });
}

function isAdmin(member) {
  if (!member) return false;
  return member.permissions.has("Administrator");
}

// Отправить эфемерный ответ на interaction
async function reply(interaction, text) {
  try {
    await interaction.reply({ content: text, ephemeral: true });
  } catch {
    try { await interaction.followUp({ content: text, ephemeral: true }); } catch {}
  }
}
// ──────────────────────────────────────────────────────────────────────────────

// ─── SLASH КОМАНДЫ ───────────────────────────────────────────────────────────
const commands = [
  new SlashCommandBuilder()
    .setName("screenshot")
    .setDescription("Запросить скриншот игрока")
    .addStringOption(o => o.setName("steamid").setDescription("Steam ID игрока").setRequired(true)),

  new SlashCommandBuilder()
    .setName("hwid")
    .setDescription("Управление HWID банами")
    .addStringOption(o =>
      o.setName("action").setDescription("Действие").setRequired(true)
       .addChoices({ name: "ban", value: "ban" }, { name: "unban", value: "unban" })
    )
    .addStringOption(o => o.setName("steamid").setDescription("Steam ID игрока").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Причина бана").setRequired(false)),

  new SlashCommandBuilder()
    .setName("showcheck")
    .setDescription("Статистика проверок модератора")
    .addStringOption(o => o.setName("steamid").setDescription("Steam ID модератора").setRequired(true)),
].map(c => c.toJSON());

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(CONFIG.BOT_TOKEN);
  try {
    await rest.put(Routes.applicationGuildCommands(CONFIG.CLIENT_ID, CONFIG.GUILD_ID), { body: commands });
    console.log("[COMMANDS] Slash команды зарегистрированы!");
  } catch (err) {
    console.error("[COMMANDS] Ошибка регистрации:", err);
  }
}
// ──────────────────────────────────────────────────────────────────────────────

// ─── ОБРАБОТКА INTERACTIONS (кнопки + slash) ─────────────────────────────────
bot.on("interactionCreate", async (interaction) => {
  try {
    // ── КНОПКИ ────────────────────────────────────────────────────────────────
    if (interaction.type === InteractionType.MessageComponent &&
        interaction.componentType === ComponentType.Button) {

      if (!isAdmin(interaction.member)) {
        await reply(interaction, "У вас нет прав для использования этой команды!");
        return;
      }

      const [action, steamId] = interaction.customId.split("_");
      if (!steamId) return;

      if (action === "ban") {
        // Отправляем команду бана на Rust сервер через внутренний вызов
        await reply(interaction, `🔨 Бан игрока \`${steamId}\` отправлен на сервер`);
        console.log(`[BUTTON] BAN ${steamId} от ${interaction.user.tag}`);
        // Уведомление в ban-log
        const ch = getChannel(CONFIG.CHANNELS.BAN_LOG);
        if (ch) {
          const embed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setDescription("🔨 Игрок забанен через Discord")
            .addFields(
              { name: "SteamID",    value: `\`${steamId}\``,              inline: true },
              { name: "Модератор",  value: interaction.user.tag,           inline: true },
              { name: "Время",      value: nowTime(),                      inline: true },
              { name: "Причина",    value: "Banned By AntiCheat",          inline: false }
            );
          await ch.send({ embeds: [embed, steamProfileEmbed(steamId)] });
        }
      }
      else if (action === "unban") {
        await reply(interaction, `✅ Разбан игрока \`${steamId}\` отправлен на сервер`);
        console.log(`[BUTTON] UNBAN ${steamId} от ${interaction.user.tag}`);
        const ch = getChannel(CONFIG.CHANNELS.BAN_LOG);
        if (ch) {
          const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setDescription("✅ Игрок разбанен через Discord")
            .addFields(
              { name: "SteamID",   value: `\`${steamId}\``,  inline: true },
              { name: "Модератор", value: interaction.user.tag, inline: true },
              { name: "Время",     value: nowTime(),           inline: true }
            );
          await ch.send({ embeds: [embed, steamProfileEmbed(steamId)] });
        }
      }
      else if (action === "screen") {
        // Запрос скриншота — сохраняем pending, Rust сервер должен опросить
        pendingScreenshots.set(BigInt(steamId), interaction.channelId);
        await reply(interaction, `📸 Запрос скриншота отправлен игроку \`${steamId}\``);
        console.log(`[BUTTON] SCREEN ${steamId} от ${interaction.user.tag}`);
      }

      return;
    }

    // ── SLASH КОМАНДЫ ─────────────────────────────────────────────────────────
    if (interaction.type !== InteractionType.ApplicationCommand) return;

    if (!isAdmin(interaction.member)) {
      await reply(interaction, "У вас нет прав для использования этой команды!");
      return;
    }

    const { commandName } = interaction;

    if (commandName === "screenshot") {
      const steamId = interaction.options.getString("steamid");
      pendingScreenshots.set(BigInt(steamId), interaction.channelId);
      await reply(interaction, `📸 Запрос скриншота для \`${steamId}\` поставлен в очередь. Скриншот придёт когда игрок ответит.`);
      console.log(`[SLASH] /screenshot ${steamId} от ${interaction.user.tag}`);
    }
    else if (commandName === "hwid") {
      const action  = interaction.options.getString("action");
      const steamId = interaction.options.getString("steamid");
      const reason  = interaction.options.getString("reason") || "Banned By AntiCheat";

      if (action === "ban") {
        await reply(interaction, `🔨 Команда бана \`${steamId}\` принята. Причина: ${reason}`);
        const ch = getChannel(CONFIG.CHANNELS.BAN_LOG);
        if (ch) {
          const embed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setDescription("🔨 Игрок забанен через Discord (/hwid ban)")
            .addFields(
              { name: "SteamID",   value: `\`${steamId}\``,  inline: true },
              { name: "Модератор", value: interaction.user.tag, inline: true },
              { name: "Время",     value: nowTime(),           inline: true },
              { name: "Причина",   value: reason,              inline: false }
            );
          await ch.send({ embeds: [embed, steamProfileEmbed(steamId)] });
        }
      } else if (action === "unban") {
        await reply(interaction, `✅ Команда разбана \`${steamId}\` принята`);
        const ch = getChannel(CONFIG.CHANNELS.BAN_LOG);
        if (ch) {
          const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setDescription("✅ Игрок разбанен через Discord (/hwid unban)")
            .addFields(
              { name: "SteamID",   value: `\`${steamId}\``,  inline: true },
              { name: "Модератор", value: interaction.user.tag, inline: true },
              { name: "Время",     value: nowTime(),           inline: true }
            );
          await ch.send({ embeds: [embed, steamProfileEmbed(steamId)] });
        }
      }
    }
    else if (commandName === "showcheck") {
      const steamId = interaction.options.getString("steamid");
      await reply(interaction, `📊 Запрос статистики для \`${steamId}\` отправлен`);
    }

  } catch (err) {
    console.error("[INTERACTION] Ошибка:", err);
    try { await reply(interaction, "Произошла ошибка при обработке команды"); } catch {}
  }
});
// ──────────────────────────────────────────────────────────────────────────────

// ─── PENDING SCREENSHOTS (очередь запросов скринов из Discord) ───────────────
// steamId (BigInt) → channelId (string)
const pendingScreenshots = new Map();

// ACore опрашивает этот endpoint чтобы узнать — нужен ли скрин конкретному игроку
app.get("/pending-screenshot/:steamId", (req, res) => {
  const key = BigInt(req.params.steamId);
  if (pendingScreenshots.has(key)) {
    const channelId = pendingScreenshots.get(key);
    pendingScreenshots.delete(key);
    return res.json({ pending: true, channelId });
  }
  res.json({ pending: false });
});
// ──────────────────────────────────────────────────────────────────────────────

// ─── ROUTE: SCREENSHOT ───────────────────────────────────────────────────────
app.post("/screenshot", authMiddleware, async (req, res) => {
  try {
    const { steamId, playerName, imageBase64, targetChannelId } = req.body;
    if (!steamId || !imageBase64) return res.status(400).json({ error: "steamId и imageBase64 обязательны" });

    const imageBuffer = Buffer.from(imageBase64, "base64");

    const mainEmbed = new EmbedBuilder()
      .setColor(0x5865F2)
      .addFields(
        { name: "SteamID",    value: steamId,                inline: true },
        { name: "Имя игрока", value: playerName || "Unknown", inline: true },
        { name: "Время",      value: nowTime(),               inline: true }
      )
      .setImage("attachment://screenshot.png");

    const linkEmbed = steamProfileEmbed(steamId);

    if (targetChannelId) {
      const ch = getChannel(targetChannelId);
      if (!ch) return res.status(404).json({ error: "Канал не найден" });

      const isModerChannel = targetChannelId === CONFIG.CHANNELS.SCREENSHOT_MODER;
      await ch.send({
        embeds: [mainEmbed, linkEmbed],
        files: [new AttachmentBuilder(imageBuffer, { name: "screenshot.png" })],
        components: [screenshotButtons(steamId, !isModerChannel)]
      });
    } else {
      const adminCh = getChannel(CONFIG.CHANNELS.SCREENSHOT_ADMIN);
      const moderCh = getChannel(CONFIG.CHANNELS.SCREENSHOT_MODER);

      if (adminCh) await adminCh.send({
        embeds: [mainEmbed, linkEmbed],
        files: [new AttachmentBuilder(imageBuffer, { name: "screenshot.png" })],
        components: [screenshotButtons(steamId, true)]
      });

      if (moderCh) await moderCh.send({
        embeds: [mainEmbed, linkEmbed],
        files: [new AttachmentBuilder(imageBuffer, { name: "screenshot.png" })],
        components: [screenshotButtons(steamId, false)]
      });
    }

    console.log(`[SCREENSHOT] ${playerName} (${steamId})`);
    res.json({ ok: true });
  } catch (err) {
    console.error("[SCREENSHOT] Ошибка:", err);
    res.status(500).json({ error: err.message });
  }
});
// ──────────────────────────────────────────────────────────────────────────────

// ─── ROUTE: BAN LOG ──────────────────────────────────────────────────────────
app.post("/banlog", authMiddleware, async (req, res) => {
  try {
    const { steamId, reason, isBan } = req.body;
    if (!steamId) return res.status(400).json({ error: "steamId обязателен" });

    const ch = getChannel(CONFIG.CHANNELS.BAN_LOG);
    if (!ch) return res.status(404).json({ error: "Канал ban-log не найден" });

    const embed = new EmbedBuilder()
      .setColor(isBan ? 0xFF0000 : 0x00FF00)
      .setDescription(isBan ? "🔨 Игрок забанен" : "✅ Игрок разбанен")
      .addFields(
        { name: "SteamID", value: `\`${steamId}\``, inline: true },
        { name: "Время",   value: nowTime(),          inline: true }
      );

    if (isBan && reason) embed.addFields({ name: "Причина", value: reason, inline: false });

    await ch.send({ embeds: [embed, steamProfileEmbed(steamId)] });
    console.log(`[BANLOG] ${isBan ? "БАН" : "РАЗБАН"} ${steamId}`);
    res.json({ ok: true });
  } catch (err) {
    console.error("[BANLOG] Ошибка:", err);
    res.status(500).json({ error: err.message });
  }
});
// ──────────────────────────────────────────────────────────────────────────────

// ─── ROUTE: KEY LOG ──────────────────────────────────────────────────────────
app.post("/keylog", authMiddleware, async (req, res) => {
  try {
    const { steamId, playerName, keyData } = req.body;
    if (!steamId || !keyData) return res.status(400).json({ error: "steamId и keyData обязательны" });

    const ch = getChannel(CONFIG.CHANNELS.KEY_LOG);
    if (!ch) return res.status(404).json({ error: "Канал key-log не найден" });

    const embed = new EmbedBuilder()
      .setColor(0xFFA500)
      .setTitle("KeyLog — Подозрительные нажатия")
      .addFields(
        { name: "SteamID", value: `\`${steamId}\``,                          inline: true },
        { name: "Имя",     value: playerName || "Unknown",                    inline: true },
        { name: "Время",   value: nowTime(),                                   inline: true },
        { name: "Данные",  value: `\`\`\`${keyData.substring(0, 1000)}\`\`\``, inline: false }
      )
      .setAuthor({
        name: "Перейти в профиль",
        url: `https://steamcommunity.com/profiles/${steamId}/`,
        iconURL: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/83/Steam_icon_logo.svg/2048px-Steam_icon_logo.svg.png"
      });

    await ch.send({ embeds: [embed] });
    console.log(`[KEYLOG] ${playerName} (${steamId})`);
    res.json({ ok: true });
  } catch (err) {
    console.error("[KEYLOG] Ошибка:", err);
    res.status(500).json({ error: err.message });
  }
});
// ──────────────────────────────────────────────────────────────────────────────

// ─── ROUTE: STEAM ACCOUNTS ───────────────────────────────────────────────────
app.post("/steamaccounts", authMiddleware, async (req, res) => {
  try {
    const { steamId, playerName, accountsData } = req.body;
    if (!steamId) return res.status(400).json({ error: "steamId обязателен" });

    const ch = getChannel(CONFIG.CHANNELS.STEAM_ACCOUNTS);
    if (!ch) return res.status(404).json({ error: "Канал steam-accounts не найден" });

    const accounts = (accountsData || "").split(";").filter(Boolean);
    const mainAccount = accounts[0] || steamId;
    const others = accounts.slice(1, 21).map(a => `\`${a}\``).join("\n") || "Нет других аккаунтов";

    const embed = new EmbedBuilder()
      .setColor(0x1B2838)
      .setTitle("Steam Accounts")
      .addFields(
        { name: "Имя игрока",       value: (playerName || "Unknown").substring(0, 100), inline: true },
        { name: "Время",            value: nowTime(),                                    inline: true },
        { name: "Основной аккаунт", value: `\`${mainAccount}\``,                        inline: false },
        { name: "Другие аккаунты",  value: others.substring(0, 1024),                   inline: false }
      )
      .setAuthor({
        name: "Перейти в профиль",
        url: `https://steamcommunity.com/profiles/${steamId}/`,
        iconURL: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/83/Steam_icon_logo.svg/2048px-Steam_icon_logo.svg.png"
      });

    await ch.send({ embeds: [embed] });
    console.log(`[STEAMACCOUNTS] ${playerName} (${steamId})`);
    res.json({ ok: true });
  } catch (err) {
    console.error("[STEAMACCOUNTS] Ошибка:", err);
    res.status(500).json({ error: err.message });
  }
});
// ──────────────────────────────────────────────────────────────────────────────

// ─── AUTH MIDDLEWARE ──────────────────────────────────────────────────────────
function authMiddleware(req, res, next) {
  const secret = req.headers["x-api-secret"];
  if (!secret || secret !== CONFIG.API_SECRET) {
    console.warn(`[AUTH] Отклонён запрос — неверный секрет`);
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}
// ──────────────────────────────────────────────────────────────────────────────

// ─── ROUTE: HEALTHCHECK ──────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ ok: true, bot: bot.isReady(), uptime: Math.floor(process.uptime()) });
});
// ──────────────────────────────────────────────────────────────────────────────

// ─── BOT READY ───────────────────────────────────────────────────────────────
bot.once("ready", async () => {
  console.log(`[BOT] Залогинен как ${bot.user.tag}`);
  await registerCommands();
  app.listen(CONFIG.PORT, () => {
    console.log(`[HTTP] Сервер запущен на порту ${CONFIG.PORT}`);
  });
});

bot.on("error", (err) => console.error("[BOT] Ошибка:", err));
bot.on("warn",  (msg) => console.warn("[BOT] Предупреждение:", msg));
process.on("unhandledRejection", (err) => console.error("[UNHANDLED]", err));

bot.login(CONFIG.BOT_TOKEN);
