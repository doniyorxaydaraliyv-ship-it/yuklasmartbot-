// Telegram video/musiqa yuklovchi bot
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
  console.error(
    "XATO: .env faylida BOT_TOKEN ni o'rnating!\n" +
      "1) .env.example faylidan .env nusxa oling\n" +
      "2) @BotFather'dan olgan tokeningizni yozing"
  );
  process.exit(1);
}

// Yuklash uzoq davom etishi mumkin — standart 90 soniyalik timeout yetarli emas
const bot = new Telegraf(TOKEN, { handlerTimeout: 15 * 60 * 1000 });
const ytdlp = await ensureYtDlp();

// Havolalarni vaqtinchalik saqlash (callback data 64 baytdan oshmasligi kerak)
const links = new Map(); // id -> url
let linkCounter = 0;

// Bir foydalanuvchi bir vaqtda faqat bitta yuklash qiladi
const busyUsers = new Set();
const cancellations = new Map(); // userId -> bekor qilish funksiyasi

const URL_RE = /https?:\/\/[^\s]+/i;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Faylni yuborish vaqtida aloqa uzilsa, bir necha marta qayta urinadi
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

// Faylni Telegram'ga yuborish: Telegraf/form-data o'rniga Node'ning ichki fetch'i
// (bu muhitda Telegraf stream yuborish "socket hang up" beradi)
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

// Status/xato xabarini yetkazish: tahrirlab bo'lmasa, yangi xabar yuboradi
async function notify(ctx, status, text) {
  try {
    await sendWithRetry(() =>
      ctx.telegram.editMessageText(ctx.chat.id, status.message_id, undefined, text)
    );
  } catch {
    await sendWithRetry(() => ctx.reply(text)).catch(() => {});
  }
}

const WELCOME =
  "👋 Assalomu alaykum!\n\n" +
  "Men video va musiqa yuklovchi botman. 📥\n\n" +
  "Menga YouTube, Instagram, TikTok yoki boshqa sayt havolasini yuboring — " +
  "men uni video (MP4) yoki musiqa (MP3) ko'rinishida yuklab beraman.\n\n" +
  "🎬 Video 720p / 🎞 Video 480p / 🎵 MP3 — siz tanlaysiz.\n\n" +
  "Buyruqlar:\n" +
  "/status — yuklash holati\n" +
  "/cancel — yuklashni bekor qilish\n\n" +
  "⚠️ Telegram cheklovi: fayl hajmi 50 MB dan oshmasligi kerak.";

bot.start((ctx) => ctx.reply(WELCOME));
bot.help((ctx) => ctx.reply(WELCOME));
bot.command("status", (ctx) =>
  ctx.reply(
    busyUsers.has(ctx.from.id)
      ? "⏳ Hozir siz uchun fayl yuklanayapti. /cancel bilan bekor qilishingiz mumkin."
      : "✅ Hozir hech narsa yuklanayotgani yo'q. Havola yuboring!"
  )
);
bot.command("cancel", (ctx) => {
  const cancel = cancellations.get(ctx.from.id);
  if (cancel) {
    cancel();
    return ctx.reply("🛑 Yuklash bekor qilindi.");
  }
  return ctx.reply("Bekor qilinadigan yuklash yo'q.");
});

// Havola yuborilganda — format tanlash tugmalari
bot.on("text", async (ctx) => {
  const match = ctx.message.text.match(URL_RE);
  if (!match) {
    return ctx.reply("Iltimos, video havolasini (link) yuboring. 🔗\n\nMasalan: https://youtube.com/watch?v=...");
  }
  const url = match[0];
  const id = String(++linkCounter);
  links.set(id, url);
  // Xotira to'lib qolmasligi uchun eski havolalarni tozalash
  if (links.size > 500) links.delete(links.keys().next().value);

  await ctx.reply(
    "Qanday formatda yuklab beray? 🤔\n(480p — kichikroq fayl, tezroq yuboriladi)",
    Markup.inlineKeyboard([
      [
        Markup.button.callback("🎬 Video 720p", `v720:${id}`),
        Markup.button.callback("🎞 Video 480p", `v480:${id}`),
      ],
      [Markup.button.callback("🎵 Musiqa (MP3)", `a:${id}`)],
    ])
  );
});

// Format tanlanganda — yuklab olish
bot.on("callback_query", async (ctx) => {
  const data = ctx.callbackQuery.data || "";
  const [type, id] = data.split(":");
  const url = links.get(id);
  if (!url || !["v720", "v480", "a"].includes(type)) {
    return ctx.answerCbQuery("Bu tugma eskirgan. Havolani qayta yuboring.");
  }

  const userId = ctx.from.id;
  if (busyUsers.has(userId)) {
    return ctx.answerCbQuery("Sizda allaqachon yuklanayotgan fayl bor!");
  }
  await ctx.answerCbQuery("Yuklash boshlandi ⏳");
  busyUsers.add(userId);

  const mode = type === "a" ? "audio" : "video";
  const quality = type === "v480" ? "480" : "720";
  const label = mode === "audio" ? "🎵 Musiqa" : `🎬 Video ${quality}p`;
  const status = await ctx.reply(`${label} yuklanmoqda... 0% ⏳`);

  // Progress xabarini yangilash (Telegram limitiga tushmaslik uchun sekinroq)
  let lastEdit = 0;
  const onProgress = (percent) => {
    const now = Date.now();
    if (now - lastEdit < 3000) return;
    lastEdit = now;
    ctx.telegram
      .editMessageText(ctx.chat.id, status.message_id, undefined,
        `${label} yuklanmoqda... ${percent}% ${bar(percent)}`)
      .catch(() => {});
  };

  let result;
  try {
    result = await download(ytdlp, url, mode, onProgress, {
      quality,
      onStart: (cancel) => cancellations.set(userId, cancel),
    });
    await notify(ctx, status, `${label} tayyor! Telegramga yuborilmoqda... 📤`);

    await sendWithRetry(() => uploadFile(ctx.chat.id, result.file, mode));
    await ctx.telegram.deleteMessage(ctx.chat.id, status.message_id).catch(() => {});
  } catch (err) {
    console.error("Yuklash xatosi:", err.message);
    let msg;
    if (err.message === "CANCELLED") {
      msg = "🛑 Yuklash bekor qilindi.";
    } else if (err.message === "TOO_BIG") {
      msg = "😔 Fayl 50 MB dan katta — Telegram orqali yubora olmayman. Qisqaroq video tanlang.";
    } else if (/private|login|sign in|cookies/i.test(err.message)) {
      msg = "🔒 Bu video yopiq yoki login talab qiladi. Ochiq video havolasini yuboring.";
    } else if (/unsupported url/i.test(err.message)) {
      msg = "❌ Bu sayt qo'llab-quvvatlanmaydi. YouTube, Instagram yoki TikTok havolasini yuboring.";
    } else if (/403|429|too many requests|rate limit|forbidden/i.test(err.message)) {
      msg = "🚫 Sayt so'rovni rad etdi (masalan, bot aniqlangan yoki limit tugagan). Biroz kutib, boshqa havola bilan qayta urining.";
    } else if (/ffmpeg|postprocess/i.test(err.message)) {
      msg = "🎞 Faylni qayta ishlashda xatolik. Boshqa formatni (MP3 yoki 480p) sinab ko'ring.";
    } else if (/socket hang up|ECONNRESET|ETIMEDOUT|fetch failed|sendAudio|sendVideo/i.test(err.message)) {
      msg = "📤 Faylni yuborishda aloqa uzildi. Internetni tekshirib, qayta urinib ko'ring.";
    } else {
      // Aniq sababni ham ko'rsatamiz — keyingi safar tez tuzatish uchun
      const detail = String(err.message).replace(/\s+/g, " ").slice(0, 200);
      msg = `❌ Yuklab olishda xatolik: ${detail}`;
    }
    await notify(ctx, status, msg);
  } finally {
    if (result) cleanup(result.dir);
    busyUsers.delete(userId);
    cancellations.delete(userId);
  }
});

function bar(percent) {
  const filled = Math.round(percent / 10);
  return "▓".repeat(filled) + "░".repeat(10 - filled);
}

bot.catch((err) => console.error("Bot xatosi:", err));

// Bulut platformalari (Render/Koyeb) port ochishni talab qiladi — sog'liq tekshiruvi
const PORT = process.env.PORT || 3100;
http
  .createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("YuklaSmartBot ishlayapti ✅");
  })
  .listen(PORT, () => console.log(`Health server: port ${PORT}`));

// Polling xatoliganda (masalan, boshqa bot instance bilan 409 Conflict) avtomatik qayta urinadi
async function startPolling() {
  try {
    await bot.launch({ dropPendingUpdates: true }, () =>
      console.log("✅ Bot ishga tushdi! Telegram'da /start bosing.")
    );
  } catch (err) {
    console.error("Bot polling xatosi:", err.message, "- 10 soniyada qayta urinaman");
    setTimeout(startPolling, 10000);
  }
}

startPolling();

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
