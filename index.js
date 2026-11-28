// Telegram video/musiqa yuklovchi bot (ko'p tilli)
import "dotenv/config";
import { Telegraf, Markup } from "telegraf";
import dns from "node:dns";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { ensureYtDlp, download, cleanup, searchVideos } from "./downloader.js";

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
const searches = new Map(); // qidiruv id -> natijalar
let searchCounter = 0;
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
      "╭━━━━━━━━━━━━━━━━━━╮\n" +
      "┃  <b>🎬 YuklaSmartBot</b>  ┃\n" +
      "╰━━━━━━━━━━━━━━━━━━╯\n\n" +
      "Assalomu alaykum! Men <b>video</b> va <b>musiqa</b> yuklab beraman 📥\n\n" +
      "▫️ Havola yuboring: <i>YouTube, Instagram, TikTok...</i>\n" +
      "▫️ Formatni tanlang: <b>1080p / 720p / 480p / MP3</b>\n\n" +
      "⚡ <b>480p</b> — eng tez variant\n" +
      "📏 Fayl limiti: <b>50 MB</b>\n" +
      "🔍 <i>\"Tinch musiqa top\"</i> deb yozsangiz, video qidirib beraman\n\n" +
      "Pastdagi tugmalardan foydalaning 👇",
    selectLang: () => "🌐 Tilni tanlang:",
    langSet: (n) => `✅ Til tanlandi: ${n}\n\nHavola yuboring yoki /start bosing.`,
    askLink: () => "🔗 Iltimos, video havolasini yuboring.\nMasalan: https://youtube.com/watch?v=...",
    askFormat: () =>
      "<b>🎯 Formatni tanlang</b>\n\n" +
      "🎥 1080p — yuqori sifat\n" +
      "🎬 720p — o'rtacha\n" +
      "🎞 480p — <i>eng kichik va tez</i>\n" +
      "🎵 MP3 — faqat musiqa",
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
    menuLink: () => "📥 Havola yuborish",
    menuLang: () => "🌐 Tilni o'zgartirish",
    menuHelp: () => "ℹ️ Qanday ishlaydi?",
    howto: () => "🔗 Menga video havolasini yuboring.\nMasalan: <code>https://youtube.com/watch?v=...</code>",
    searching: () => "🔍 Qidirilmoqda...",
    searchEmpty: () => "😔 Hech narsa topilmadi. Boshqa so'rov yozing.",
    searchResults: (q, n) => `🔎 <b>${q}</b> uchun ${n} ta natija topildi.\n\nVideoni tanlang 👇`,
  },
  ru: {
    welcome: () =>
      "╭━━━━━━━━━━━━━━━━━━╮\n" +
      "┃  <b>🎬 YuklaSmartBot</b>  ┃\n" +
      "╰━━━━━━━━━━━━━━━━━━╯\n\n" +
      "Здравствуйте! Я скачиваю <b>видео</b> и <b>музыку</b> 📥\n\n" +
      "▫️ Отправьте ссылку: <i>YouTube, Instagram, TikTok...</i>\n" +
      "▫️ Выберите формат: <b>1080p / 720p / 480p / MP3</b>\n\n" +
      "⚡ <b>480p</b> — самый быстрый вариант\n" +
      "📏 Лимит файла: <b>50 МБ</b>\n" +
      "🔍 Напишите <i>\"спокойная музыка\"</i> — найду видео\n\n" +
      "Используйте кнопки ниже 👇",
    selectLang: () => "🌐 Выберите язык:",
    langSet: (n) => `✅ Язык выбран: ${n}\n\nОтправьте ссылку или нажмите /start.`,
    askLink: () => "🔗 Отправьте ссылку на видео.\nНапример: https://youtube.com/watch?v=...",
    askFormat: () =>
      "<b>🎯 Выберите формат</b>\n\n" +
      "🎥 1080p — высокое качество\n" +
      "🎬 720p — среднее\n" +
      "🎞 480p — <i>самый маленький и быстрый</i>\n" +
      "🎵 MP3 — только музыка",
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
    menuLink: () => "📥 Отправить ссылку",
    menuLang: () => "🌐 Сменить язык",
    menuHelp: () => "ℹ️ Как это работает?",
    howto: () => "🔗 Отправьте мне ссылку на видео.\nНапример: <code>https://youtube.com/watch?v=...</code>",
    searching: () => "🔍 Ищу...",
    searchEmpty: () => "😔 Ничего не найдено. Попробуйте другой запрос.",
    searchResults: (q, n) => `🔎 Найдено ${n} результатов по запросу <b>${q}</b>.\n\nВыберите видео 👇`,
  },
  en: {
    welcome: () =>
      "╭━━━━━━━━━━━━━━━━━━╮\n" +
      "┃  <b>🎬 YuklaSmartBot</b>  ┃\n" +
      "╰━━━━━━━━━━━━━━━━━━╯\n\n" +
      "Hello! I download <b>videos</b> and <b>music</b> 📥\n\n" +
      "▫️ Send a link: <i>YouTube, Instagram, TikTok...</i>\n" +
      "▫️ Choose format: <b>1080p / 720p / 480p / MP3</b>\n\n" +
      "⚡ <b>480p</b> — fastest option\n" +
      "📏 File limit: <b>50 MB</b>\n" +
      "🔍 Type <i>\"calm music\"</i> — I'll find videos for you\n\n" +
      "Use the buttons below 👇",
    selectLang: () => "🌐 Choose a language:",
    langSet: (n) => `✅ Language set: ${n}\n\nSend a link or press /start.`,
    askLink: () => "🔗 Please send a video link.\nExample: https://youtube.com/watch?v=...",
    askFormat: () =>
      "<b>🎯 Choose a format</b>\n\n" +
      "🎥 1080p — high quality\n" +
      "🎬 720p — medium\n" +
      "🎞 480p — <i>smallest and fastest</i>\n" +
      "🎵 MP3 — music only",
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
    menuLink: () => "📥 Send a link",
    menuLang: () => "🌐 Change language",
    menuHelp: () => "ℹ️ How it works",
    howto: () => "🔗 Send me a video link.\nExample: <code>https://youtube.com/watch?v=...</code>",
    searching: () => "🔍 Searching...",
    searchEmpty: () => "😔 Nothing found. Try another request.",
    searchResults: (q, n) => `🔎 Found ${n} results for <b>${q}</b>.\n\nChoose a video 👇`,
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

// Asosiy menyu (chiroyli ko'rinish uchun)
const menuKeyboard = (uid) =>
  Markup.inlineKeyboard([
    [Markup.button.callback(tr(uid, "menuLink"), "menu:howto")],
    [
      Markup.button.callback(tr(uid, "menuLang"), "menu:lang"),
      Markup.button.callback(tr(uid, "menuHelp"), "menu:help"),
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
  const t0 = Date.now();
  const bytes = fs.readFileSync(file);
  const filename = path.basename(file);
  const form = new FormData();
  form.append("chat_id", String(chatId));

  let method;
  if (mode === "audio") {
    method = "sendAudio";
    const ext = path.extname(filename).toLowerCase();
    const mime =
      ext === ".m4a" ? "audio/mp4" : ext === ".ogg" ? "audio/ogg" : "audio/mpeg";
    form.append("audio", new Blob([bytes], { type: mime }), filename);
    form.append("title", filename.replace(/\.[^.]+$/, "").slice(0, 64));
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
  console.log(`[TIME] ${method} yuborildi: ${Date.now() - t0}ms`);
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

const esc = (s) =>
  String(s).replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]);

// Format tugmalari (havola va qidiruv natijasi uchun umumiy)
const formatKeyboard = (uid, id) =>
  Markup.inlineKeyboard([
    [
      Markup.button.callback(tr(uid, "b1080"), `v1080:${id}`),
      Markup.button.callback(tr(uid, "b720"), `v720:${id}`),
    ],
    [
      Markup.button.callback(tr(uid, "b480"), `v480:${id}`),
      Markup.button.callback(tr(uid, "bAudio"), `a:${id}`),
    ],
  ]);

// AI kaliti bor bo'lsa — tabiiy tilni qidiruv so'zlariga aylantiradi
async function aiQuery(text) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return text;
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text:
                    "Convert this request into 3-5 short YouTube search keywords. " +
                    "Reply with ONLY the keywords, no explanation: " +
                    text,
                },
              ],
            },
          ],
        }),
        signal: AbortSignal.timeout(20000),
      }
    );
    const data = await res.json();
    const out = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    return out && out.length < 200 ? out.replace(/\s+/g, " ") : text;
  } catch (err) {
    console.error("AI qidiruv xatosi:", err.message);
    return text;
  }
}

// Matn bo'yicha video qidirish
async function runSearch(ctx, text) {
  const uid = ctx.from.id;
  const status = await ctx.reply(tr(uid, "searching"));
  const query = await aiQuery(text);
  let results = [];
  try {
    results = await searchVideos(ytdlp, query, 5);
  } catch (err) {
    console.error("Qidiruv xatosi:", err.message);
  }

  if (!results.length) {
    const msg = tr(uid, "searchEmpty");
    return ctx.telegram
      .editMessageText(ctx.chat.id, status.message_id, undefined, msg)
      .catch(() => ctx.reply(msg));
  }

  const key = String(++searchCounter);
  searches.set(key, results);
  const buttons = results.map((r, i) => [
    Markup.button.callback(`▶️ ${r.title.slice(0, 42)}`, `s:${key}.${i}`),
  ]);
  await ctx.telegram
    .editMessageText(
      ctx.chat.id,
      status.message_id,
      undefined,
      tr(uid, "searchResults", esc(query), results.length),
      { parse_mode: "HTML", ...Markup.inlineKeyboard(buttons) }
    )
    .catch(() => ctx.reply(tr(uid, "searchResults", esc(query), results.length), {
      parse_mode: "HTML",
      ...Markup.inlineKeyboard(buttons),
    }));
}

// -------------------------------------------------------------- buyruqlar
bot.start((ctx) => ctx.reply(tr(ctx.from.id, "selectLang"), langKeyboard()));
bot.help((ctx) =>
  ctx.reply(tr(ctx.from.id, "welcome"), {
    parse_mode: "HTML",
    ...menuKeyboard(ctx.from.id),
  })
);
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
bot.command("search", (ctx) => {
  const q = ctx.message.text.replace(/^\/search(?:@\w+)?\s*/, "").trim();
  return q ? runSearch(ctx, q) : ctx.reply(tr(ctx.from.id, "searching"));
});

// ---------------------------------------------------------- havola xabari
bot.on("text", async (ctx) => {
  const uid = ctx.from.id;
  const text = ctx.message.text.trim();
  const match = text.match(URL_RE);

  // Havola emas — AI/qidiruv so'rovi sifatida qabul qilamiz
  if (!match) {
    if (text.length < 3) return ctx.reply(tr(uid, "askLink"));
    return runSearch(ctx, text);
  }

  const id = String(++linkCounter);
  links.set(id, match[0]);
  if (links.size > 500) links.delete(links.keys().next().value);

  await ctx.reply(tr(uid, "askFormat"), {
    parse_mode: "HTML",
    ...formatKeyboard(uid, id),
  });
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
    return ctx.editMessageText(tr(uid, "welcome"), {
      parse_mode: "HTML",
      ...menuKeyboard(uid),
    });
  }

  // Asosiy menyu tugmalari
  if (type === "menu") {
    await ctx.answerCbQuery();
    if (id === "lang")
      return ctx.editMessageText(tr(uid, "selectLang"), langKeyboard());
    if (id === "help")
      return ctx.editMessageText(tr(uid, "welcome"), {
        parse_mode: "HTML",
        ...menuKeyboard(uid),
      });
    if (id === "howto")
      return ctx.editMessageText(tr(uid, "howto"), { parse_mode: "HTML" });
    return;
  }

  // Qidiruv natijasini tanlash
  if (type === "s") {
    const [key, idx] = id.split(".");
    const item = searches.get(key)?.[Number(idx)];
    if (!item) return ctx.answerCbQuery(tr(uid, "oldBtn"));
    await ctx.answerCbQuery();
    const linkId = String(++linkCounter);
    links.set(linkId, item.url);
    return ctx.reply(tr(uid, "askFormat"), {
      parse_mode: "HTML",
      ...formatKeyboard(uid, linkId),
    });
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
    await ctx.telegram
      .sendChatAction(ctx.chat.id, mode === "audio" ? "upload_audio" : "upload_video")
      .catch(() => {});
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

// Webhook o'chirilganda QAYTA URINADI, lekin pollingga o'tmaydi
// (Telegraf polling ishga tushirsa, webhook'ni o'zi o'chirib qoyadi)
async function installWebhook() {
  try {
    await bot.telegram.setWebhook(WEBHOOK_URL);
    console.log("✅ Webhook o'rnatildi:", WEBHOOK_URL);
  } catch (err) {
    console.error("Webhook o'rnatish xatosi:", err.message, "- 30 s keyin qayta urinaman");
    setTimeout(installWebhook, 30000);
  }
}

if (WEBHOOK_URL) {
  installWebhook();
  // Har 5 daqiqada tekshiradi: o'chirib qolsa, o'zi qayta o'rnatadi
  setInterval(async () => {
    try {
      const info = await bot.telegram.getWebhookInfo();
      if (info.url !== WEBHOOK_URL) {
        console.log("⚠️ Webhook yo'qolgan — qayta o'rnatyapman");
        await installWebhook();
      }
    } catch (err) {
      console.error("Webhook tekshirish xatosi:", err.message);
    }
  }, 5 * 60 * 1000);
} else {
  startPolling();
}

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
