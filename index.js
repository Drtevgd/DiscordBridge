const express = require("express");
const { Client, GatewayIntentBits, AttachmentBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const crypto = require("crypto");

// ─── CONFIG (все значения берутся из переменных окружения Railway) ────────────
const CONFIG = {
  BOT_TOKEN:  process.env.BOT_TOKEN,
  API_SECRET: process.env.API_SECRET,
  PORT:       process.env.PORT || 3000,   // Railway сам выставляет PORT

  CHANNELS: {
    SCREENSHOT_ADMIN: process.env.CH_SCREENSHOT_ADMIN || "1496897127010537531",
    SCREENSHOT_MODER: process.env.CH_SCREENSHOT_MODER || "1496897127010537529",
    BAN_LOG:          process.env.CH_BAN_LOG          || "1496897127190761735",
    KEY_LOG:          process.env.CH_KEY_LOG          || "1502798344777633793",
    STEAM_ACCOUNTS:   process.env.CH_STEAM_ACCOUNTS   || "1503078678387491027",
  }
};

// Проверяем обязательные переменные при старте
if (!CONFIG.BOT_TOKEN)  { console.error("[FATAL] BOT_TOKEN не задан!"); process.exit(1); }
if (!CONFIG.API_SECRET) { console.error("[FATAL] API_SECRET не задан!"); process.exit(1); }
// ──────────────────────────────────────────────────────────────────────────────

const app = express();
app.use(express.json({ limit: "50mb" }));

const bot = new Client({ intents: [GatewayIntentBits.Guilds] });

// ─── AUTH MIDDLEWARE ──────────────────────────────────────────────────────────
function authMiddleware(req, res, next) {
  const secret = req.headers["x-api-secret"];
  if (!secret || secret !== CONFIG.API_SECRET) {
    console.warn(`[AUTH] Отклонён запрос от ${req.ip} — неверный секрет`);
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}
// ──────────────────────────────────────────────────────────────────────────────

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
// ──────────────────────────────────────────────────────────────────────────────

// ─── ROUTE: SCREENSHOT ───────────────────────────────────────────────────────
app.post("/screenshot", authMiddleware, async (req, res) => {
  try {
    const { steamId, playerName, imageBase64, targetChannelId } = req.body;

    if (!steamId || !imageBase64) {
      return res.status(400).json({ error: "steamId и imageBase64 обязательны" });
    }

    const imageBuffer = Buffer.from(imageBase64, "base64");
    const attachment = new AttachmentBuilder(imageBuffer, { name: "screenshot.png" });

    const mainEmbed = new EmbedBuilder()
      .setColor(0x5865F2)
      .addFields(
        { name: "SteamID",      value: steamId,              inline: true },
        { name: "Имя игрока",   value: playerName || "Unknown", inline: true },
        { name: "Время",        value: nowTime(),             inline: true }
      )
      .setImage("attachment://screenshot.png");

    const linkEmbed = steamProfileEmbed(steamId);

    // Если запрос пришёл с конкретным каналом (команда /screenshot из Discord)
    if (targetChannelId) {
      const ch = getChannel(targetChannelId);
      if (!ch) return res.status(404).json({ error: "Канал не найден" });

      const isModerChannel = targetChannelId === CONFIG.CHANNELS.SCREENSHOT_MODER;
      await ch.send({
        embeds: [mainEmbed, linkEmbed],
        files: [attachment],
        components: [screenshotButtons(steamId, !isModerChannel)]
      });
    } else {
      // Авто-скриншот — шлём в оба канала
      const adminCh = getChannel(CONFIG.CHANNELS.SCREENSHOT_ADMIN);
      const moderCh = getChannel(CONFIG.CHANNELS.SCREENSHOT_MODER);

      if (adminCh) {
        await adminCh.send({
          embeds: [mainEmbed, linkEmbed],
          files: [new AttachmentBuilder(imageBuffer, { name: "screenshot.png" })],
          components: [screenshotButtons(steamId, true)]
        });
      }
      if (moderCh) {
        await moderCh.send({
          embeds: [mainEmbed, linkEmbed],
          files: [new AttachmentBuilder(imageBuffer, { name: "screenshot.png" })],
          components: [screenshotButtons(steamId, false)]
        });
      }
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

    if (isBan && reason) {
      embed.addFields({ name: "Причина", value: reason, inline: false });
    }

    await ch.send({ embeds: [embed, steamProfileEmbed(steamId)] });

    console.log(`[BANLOG] ${isBan ? "БАН" : "РАЗБАН"} ${steamId} — ${reason || ""}`);
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
        { name: "SteamID",  value: `\`${steamId}\``,          inline: true },
        { name: "Имя",      value: playerName || "Unknown",    inline: true },
        { name: "Время",    value: nowTime(),                   inline: true },
        { name: "Данные",   value: `\`\`\`${keyData.substring(0, 1000)}\`\`\``, inline: false }
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

// ─── ROUTE: HEALTHCHECK ──────────────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({ ok: true, bot: bot.isReady(), uptime: process.uptime() });
});
// ──────────────────────────────────────────────────────────────────────────────

// ─── BOT READY ───────────────────────────────────────────────────────────────
bot.once("ready", () => {
  console.log(`[BOT] Залогинен как ${bot.user.tag}`);
  app.listen(CONFIG.PORT, () => {
    console.log(`[HTTP] Сервер запущен на порту ${CONFIG.PORT}`);
  });
});

bot.on("error", (err) => console.error("[BOT] Ошибка:", err));
bot.on("warn",  (msg) => console.warn("[BOT] Предупреждение:", msg));

process.on("unhandledRejection", (err) => console.error("[UNHANDLED]", err));

bot.login(CONFIG.BOT_TOKEN);
