// Telegram video/musiqa yuklovchi bot (ko'p tilli)
import "dotenv/config";
import { Telegraf, Markup } from "telegraf";
import dns from "node:dns";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { ensureYtDlp, download, cleanup } from "./downloader.js";

// Ba'zi tarmoqlarda IPv6 ishlamaydi — avval IPv4'ga ulanamiz
dns.setDefaultResultOrder("ipv4first");

const TOKEN = process.env.BOT_TOKEN;
if (!TOKEN || TOKEN.includes("AAExample")) {
  console.error("XATO: .env faylida BOT_TOKEN ni o'rnating!");
  process.exit(1);
}

const bot = new Telegraf(TOKEN, { handlerTimeout: 15 * 60 * 1000 });
const ytdlp = await ensureYtDlp();

const links = new Map(); // id -> url
let linkCounter = 0;
const busyUsers = new Set();
const cancellations = new Map();
const userLangs = new Map(); // userId -> til kodi

const URL_RE = /https?:\/\/[^\s]+/i;

// ---------------------------------------------------------------- tillar
const LANGS = {
  uz: "🇺🇿 O'zbek",
  ru: "🇷🇺 Русский",
  en: "🇬🇧 English",
};

const T = {
  uz: {
    welcome: () =>
      "👋 Assalomu alaykum!\n\nMen video va musiqa yuklovchi botman. 📥\n" +
      "YouTube, Instagram, TikTok yoki boshqa sayt havolasini yuboring.\n\n" +
      "🎥 1080p / 🎬 720p / 🎞 480p / 🎵 MP3 — siz tanlaysiz.\n\n" +
      "Buyruqlar:\n/status — yuklash holati\n/cancel — bekor qilish\n" +
      "/language — tilni o'zgartirish\n\n⚠️ Fayl 50 MB dan katta bo'lmasligi kerak.",
    selectLang: () => "🌐 Tilni tanlang:",
    langSet: (n) => `✅ Til tanlandi: ${n}\n\nHavola yuboring yoki /start bosing.`,
    askLink: () => "🔗 Iltimos, video havolasini yuboring.\nMasalan: https://youtube.com/watch?v=...",
    askFormat: () => "Qanday formatda yuklab beray? 🤔\n(480p — eng kichik va tez)",
    b1080: () => "🎥 Video 1080p",
    b720: () => "🎬 Video 720p",
    b480: () => "🎞 Video 480p",
    bAudio: () => "🎵 Musiqa (MP3)",
    loading: (l) => `${l} yuklanmoqda... 0% ⏳`,
    progress: (l, p, b) => `${l} yuklanmoqda... ${p}% ${b}`,
    ready: (l) => `${l} tayyor! Yuborilmoqda... 📤`,
    tooBig: () => "😔 Fayl 50 MB dan katta. Qisqaroq video yoki 480p tanlang.",
    private: () => "🔒 Video yopiq yoki login talab qiladi. Ochiq havola yuboring.",
    unsupported: () => "❌ Sayt qo'llab-quvvatlanmaydi. YouTube/Instagram/TikTok havolasini yuboring.",
    blocked: () => "🚫 Sayt so'rovni rad etdi (limit yoki bot aniqlangan). Biroz kutib qayta urining.",
    ffmpeg: () => "🎞 Faylni qayta ishlashda xatolik. Boshqa formatni sinang.",
    sendFail: () => "📤 Faylni yuborishda aloqa uzildi. Qayta urinib ko'ring.",
    generic: (d) => `❌ Yuklash xatoligi: ${d}`,
    cancelled: () => "🛑 Yuklash bekor qilindi.",
    busyCb: () => "Sizda allaqachon yuklanayotgan fayl bor!",
    startedCb: () => "Yuklash boshlandi ⏳",
    oldBtn: () => "Bu tugma eskirgan. Havolani qayta yuboring.",
    statusBusy: () => "⏳ Hozir fayl yuklanayapti. /cancel bilan bekor qiling.",
    statusIdle: () => "✅ Hozir hech narsa yuklanayotgani yo'q. Havola yuboring!",
    cancelNone: () => "Bekor qilinadigan yuklash yo'q.",
  },
  ru: {
    welcome: () =>
      "👋 Здравствуйте!\n\nЯ бот для скачивания видео и музыки. 📥\n" +
      "Отправьте ссылку с YouTube, Instagram, TikTok или другого сайта.\n\n" +
      "🎥 1080p / 🎬 720p / 🎞 480p / 🎵 MP3 — выбирайте сами.\n\n" +
      "Команды:\n/status — статус загрузки\n/cancel — отменить\n" +
      "/language — сменить язык\n\n⚠️ Размер файла не должен превышать 50 МБ.",
    selectLang: () => "🌐 Выберите язык:",
    langSet: (n) => `✅ Язык выбран: ${n}\n\nОтправьте ссылку или нажмите /start.`,
    askLink: () => "🔗 Отправьте ссылку на видео.\nНапример: https://youtube.com/watch?v=...",
    askFormat: () => "В каком формате скачать? 🤔\n(480p — самый маленький и быстрый)",
    b1080: () => "🎥 Видео 1080p",
    b720: () => "🎬 Видео 720p",
    b480: () => "🎞 Видео 480p",
    bAudio: () => "🎵 Музыка (MP3)",
    loading: (l) => `${l}: загрузка... 0% ⏳`,
    progress: (l, p, b) => `${l}: загрузка... ${p}% ${b}`,
    ready: (l) => `${l} готово! Отправляю... 📤`,
    tooBig: () => "😔 Файл больше 50 МБ. Выберите короче видео или 480p.",
    private: () => "🔒 Видео закрыто или требует входа. Отправьте открытую ссылку.",
    unsupported: () => "❌ Сайт не поддерживается. Отправьте ссылку YouTube/Instagram/TikTok.",
    blocked: () => "🚫 Сайт отклонил запрос (лимит или обнаружен бот). Попробуйте позже.",
    ffmpeg: () => "🎞 Ошибка обработки файла. Попробуйте другой формат.",
    sendFail: () => "📤 Ошибка отправки файла. Попробуйте ещё раз.",
    generic: (d) => `❌ Ошибка загрузки: ${d}`,
    cancelled: () => "🛑 Загрузка отменена.",
    busyCb: () => "У вас уже идёт загрузка!",
    startedCb: () => "Загрузка началась ⏳",
    oldBtn: () => "Кнопка устарела. Отправьте ссылку заново.",
    statusBusy: () => "⏳ Сейчас идёт загрузка. Отмените через /cancel.",
    statusIdle: () => "✅ Сейчас ничего не загружается. Отправьте ссылку!",
    cancelNone: () => "Нет загрузки для отмены.",
  },
  en: {
    welcome: () =>
      "👋 Hello!\n\nI download videos and music. 📥\n" +
      "Send a link from YouTube, Instagram, TikTok or any other site.\n\n" +
      "🎥 1080p / 🎬 720p / 🎞 480p / 🎵 MP3 — you choose.\n\n" +
      "Commands:\n/status — download status\n/cancel — cancel\n" +
      "/language — change language\n\n⚠️ File size must be under 50 MB.",
    selectLang: () => "🌐 Choose a language:",
    langSet: (n) => `✅ Language set: ${n}\n\nSend a link or press /start.`,
    askLink: () => "🔗 Please send a video link.\nExample: https://youtube.com/watch?v=...",
    askFormat: () => "Which format? 🤔\n(480p — smallest and fastest)",
    b1080: () => "🎥 Video 1080p",
    b720: () => "🎬 Video 720p",
    b480: () => "🎞 Video 480p",
    bAudio: () => "🎵 Music (MP3)",
    loading: (l) => `${l} downloading... 0% ⏳`,
    progress: (l, p, b) => `${l} downloading... ${p}% ${b}`,
    ready: (l) => `${l} ready! Sending... 📤`,
    tooBig: () => "😔 File is over 50 MB. Choose a shorter video or 480p.",
    private: () => "🔒 Video is private or needs login. Send a public link.",
    unsupported: () => "❌ Site not supported. Send a YouTube/Instagram/TikTok link.",
    blocked: () => "🚫 Site rejected the request (rate limit or bot detected). Try later.",
    ffmpeg: () => "🎞 Error processing the file. Try another format.",
    sendFail: () => "📤 Failed to send the file. Please try again.",
    generic: (d) => `❌ Download error: ${d}`,
    cancelled: () => "🛑 Download cancelled.",
    busyCb: () => "You already have a download in progress!",
    startedCb: () => "Download started ⏳",
    oldBtn: () => "This button is expired. Send the link again.",
    statusBusy: () => "⏳ A download is in progress. Use /cancel to stop it.",
    statusIdle: () => "✅ Nothing is downloading now. Send a link!",
    cancelNone: () => "Nothing to cancel.",
  },
};

const langOf = (id) => userLangs.get(id) || "uz";
const tr = (id, key, ...args) => T[langOf(id)][key](...args);

const langKeyboard = () =>
  Markup.inlineKeyboard([
    [
      Markup.button.callback(LANGS.uz, "lang:uz"),
      Markup.button.callback(LANGS.ru, "lang:ru"),
      Markup.button.callback(LANGS.en, "lang:en"),
    ],
  ]);

// ------------------------------------------------------------- yordamchi
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function sendWithRetry(sendFn) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      return await sendFn();
    } catch (err) {
      console.error(`Telegramga yuborish xatosi (urinish ${attempt}/5):`, err.message);
      if (attempt === 5) throw err;
      await wait(Math.min(3000 * 2 ** (attempt - 1), 30000));
    }
  }
}

// Faylni Telegram'ga yuborish (Node ichki fetch — tez va ishonchli)
async function uploadFile(chatId, file, mode) {
  const bytes = fs.readFileSync(file);
  const filename = path.basename(file);
  const form = new FormData();
  form.append("chat_id", String(chatId));

  let method;
  if (mode === "audio") {
    method = "sendAudio";
    form.append("audio", new Blob([bytes], { type: "audio/mpeg" }), filename);
    form.append("title", filename.replace(/\.mp3$/i, "").slice(0, 64));
  } else {
    method = "sendVideo";
    form.append("video", new Blob([bytes], { type: "video/mp4" }), filename);
    form.append("supports_streaming", "true");
  }

  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(10 * 60 * 1000),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.description || "Telegram API xatosi");
  return data;
}

async function notify(ctx, status, text) {
  try {
    await sendWithRetry(() =>
      ctx.telegram.editMessageText(ctx.chat.id, status.message_id, undefined, text)
    );
  } catch {
    await sendWithRetry(() => ctx.reply(text)).catch(() => {});
  }
}

function bar(percent) {
  const filled = Math.round(percent / 10);
  return "▓".repeat(filled) + "░".repeat(10 - filled);
}

// -------------------------------------------------------------- buyruqlar
bot.start((ctx) => ctx.reply(tr(ctx.from.id, "selectLang"), langKeyboard()));
bot.help((ctx) => ctx.reply(tr(ctx.from.id, "welcome")));
bot.command("language", (ctx) =>
  ctx.reply(tr(ctx.from.id, "selectLang"), langKeyboard())
);
bot.command("status", (ctx) =>
  ctx.reply(
    busyUsers.has(ctx.from.id)
      ? tr(ctx.from.id, "statusBusy")
      : tr(ctx.from.id, "statusIdle")
  )
);
bot.command("cancel", (ctx) => {
  const cancel = cancellations.get(ctx.from.id);
  if (cancel) {
    cancel();
    return ctx.reply(tr(ctx.from.id, "cancelled"));
  }
  return ctx.reply(tr(ctx.from.id, "cancelNone"));
});

// ---------------------------------------------------------- havola xabari
bot.on("text", async (ctx) => {
  const uid = ctx.from.id;
  const match = ctx.message.text.match(URL_RE);
  if (!match) return ctx.reply(tr(uid, "askLink"));

  const id = String(++linkCounter);
  links.set(id, match[0]);
  if (links.size > 500) links.delete(links.keys().next().value);

  await ctx.reply(
    tr(uid, "askFormat"),
    Markup.inlineKeyboard([
      [
        Markup.button.callback(tr(uid, "b1080"), `v1080:${id}`),
        Markup.button.callback(tr(uid, "b720"), `v720:${id}`),
      ],
      [
        Markup.button.callback(tr(uid, "b480"), `v480:${id}`),
        Markup.button.callback(tr(uid, "bAudio"), `a:${id}`),
      ],
    ])
  );
});

// ------------------------------------------------------- tugmalar / yuklash
bot.on("callback_query", async (ctx) => {
  const data = ctx.callbackQuery.data || "";
  const [type, id] = data.split(":");
  const uid = ctx.from.id;

  // Til tanlash
  if (type === "lang") {
    if (!T[id]) return ctx.answerCbQuery();
    userLangs.set(uid, id);
    await ctx.answerCbQuery();
    return ctx.editMessageText(tr(uid, "langSet", LANGS[id]));
  }

  const url = links.get(id);
  if (!url || !["v1080", "v720", "v480", "a"].includes(type)) {
    return ctx.answerCbQuery(tr(uid, "oldBtn"));
  }
  if (busyUsers.has(uid)) return ctx.answerCbQuery(tr(uid, "busyCb"));
  await ctx.answerCbQuery(tr(uid, "startedCb"));
  busyUsers.add(uid);

  const mode = type === "a" ? "audio" : "video";
  const quality = type.startsWith("v") ? type.slice(1) : "720";
  const label = mode === "audio" ? tr(uid, "bAudio") : tr(uid, `b${quality}`);
  const status = await ctx.reply(tr(uid, "loading", label));

  // Progress xabarini kamroq yangilaymiz — bu ham tezlikka yordam beradi
  let lastEdit = 0;
  const onProgress = (percent) => {
    const now = Date.now();
    if (now - lastEdit < 5000) return;
    lastEdit = now;
    ctx.telegram
      .editMessageText(
        ctx.chat.id,
        status.message_id,
        undefined,
        tr(uid, "progress", label, percent, bar(percent))
      )
      .catch(() => {});
  };

  let result;
  try {
    result = await download(ytdlp, url, mode, onProgress, {
      quality,
      onStart: (cancel) => cancellations.set(uid, cancel),
    });
    await notify(ctx, status, tr(uid, "ready", label));
    await sendWithRetry(() => uploadFile(ctx.chat.id, result.file, mode));
    await ctx.telegram.deleteMessage(ctx.chat.id, status.message_id).catch(() => {});
  } catch (err) {
    console.error("Yuklash xatosi:", err.message);
    const m = err.message;
    let msg;
    if (m === "CANCELLED") msg = tr(uid, "cancelled");
    else if (m === "TOO_BIG") msg = tr(uid, "tooBig");
    else if (/private|login|sign in|cookies/i.test(m)) msg = tr(uid, "private");
    else if (/unsupported url/i.test(m)) msg = tr(uid, "unsupported");
    else if (/403|429|too many requests|rate limit|forbidden/i.test(m)) msg = tr(uid, "blocked");
    else if (/ffmpeg|postprocess/i.test(m)) msg = tr(uid, "ffmpeg");
    else if (/socket hang up|ECONNRESET|ETIMEDOUT|fetch failed|sendAudio|sendVideo/i.test(m))
      msg = tr(uid, "sendFail");
    else msg = tr(uid, "generic", String(m).replace(/\s+/g, " ").slice(0, 200));
    await notify(ctx, status, msg);
  } finally {
    if (result) cleanup(result.dir);
    busyUsers.delete(uid);
    cancellations.delete(uid);
  }
});

bot.catch((err) => console.error("Bot xatosi:", err));

// -------------------------------------------------- server / webhook sozlamasi
const PORT = process.env.PORT || 3100;
http
  .createServer(async (req, res) => {
    if (req.method === "POST" && req.url === "/telegram") {
      let body = "";
      try {
        for await (const chunk of req) body += chunk;
        await bot.handleUpdate(JSON.parse(body));
      } catch (err) {
        console.error("Webhook xatosi:", err.message);
      }
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("ok");
      return;
    }
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("YuklaSmartBot ishlayapti ✅");
  })
  .listen(PORT, () => console.log(`Health server: port ${PORT}`));

async function startPolling() {
  try {
    await bot.launch({ dropPendingUpdates: true }, () =>
      console.log("✅ Bot ishga tushdi (polling)!")
    );
  } catch (err) {
    console.error("Bot polling xatosi:", err.message, "- 10 soniyada qayta urinaman");
    setTimeout(startPolling, 10000);
  }
}

const WEBHOOK_URL = process.env.RENDER_EXTERNAL_URL
  ? `${process.env.RENDER_EXTERNAL_URL}/telegram`
  : process.env.WEBHOOK_URL;

if (WEBHOOK_URL) {
  try {
    await bot.telegram.setWebhook(WEBHOOK_URL, { drop_pending_updates: true });
    console.log("✅ Webhook o'rnatildi:", WEBHOOK_URL);
  } catch (err) {
    console.error("Webhook xatosi, pollingga o'tiladi:", err.message);
    startPolling();
  }
} else {
  startPolling();
}

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
