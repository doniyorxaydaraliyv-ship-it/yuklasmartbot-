// yt-dlp yordamida video/audio yuklab olish moduli
import YTDlpWrapModule from "yt-dlp-wrap";
const YTDlpWrap = YTDlpWrapModule.default ?? YTDlpWrapModule;
import ffmpegPath from "ffmpeg-static";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const BIN_DIR = path.join(ROOT, "bin");
const BIN_PATH = path.join(
  BIN_DIR,
  process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp"
);

// Telegram Bot API orqali maksimal 50 MB fayl yuborish mumkin
export const MAX_FILE_SIZE = 49 * 1024 * 1024;

// GitHub API ishlatilmaydi — bulutlarda umumiy IP tufayli API limiti (60/soat) tugashi mumkin
const YTDLP_ASSET = process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp_linux";
const YTDLP_URLS = [
  `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${YTDLP_ASSET}`,
  `https://github.com/yt-dlp/yt-dlp/releases/download/2026.10.26/${YTDLP_ASSET}`,
];

async function fetchBinary(url, dest) {
  const res = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(3 * 60 * 1000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

/** yt-dlp binary'sini tekshiradi, yo'q bo'lsa to'g'ridan-to'g'ri URL'dan yuklaydi */
export async function ensureYtDlp() {
  fs.mkdirSync(BIN_DIR, { recursive: true });
  if (!fs.existsSync(BIN_PATH)) {
    console.log("yt-dlp yuklab olinmoqda (GitHub API'siz)...");
    let downloaded = false;
    for (const url of YTDLP_URLS) {
      try {
        await fetchBinary(url, BIN_PATH);
        downloaded = true;
        break;
      } catch (err) {
        console.error("yt-dlp yuklab olish xatosi:", err.message);
      }
    }
    if (!downloaded) throw new Error("yt-dlp yuklab olinmadi — keyinroq qayta urining");
    if (process.platform !== "win32") fs.chmodSync(BIN_PATH, 0o755);
    console.log("yt-dlp tayyor:", BIN_PATH);
  }
  return new YTDlpWrap(BIN_PATH);
}

/**
 * Videoni yuklab oladi.
 * @param {YTDlpWrap} ytdlp
 * @param {string} url
 * @param {"video"|"audio"} mode
 * @param {(percent:number)=>void} onProgress
 * @returns {Promise<{file:string, dir:string, size:number}>}
 */
export function download(ytdlp, url, mode, onProgress = () => {}, options = {}) {
  return new Promise((resolve, reject) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tgbot-"));
    let cancelled = false;
    const outputTemplate = path.join(dir, "%(title).80B.%(ext)s");

    const args = [
      url,
      "-o", outputTemplate,
      "--no-playlist",
      "--no-warnings",
      "--newline",
      "--restrict-filenames",
      "--max-filesize", "50M",
      "--ffmpeg-location", ffmpegPath,
      "--socket-timeout", "30",
      "--retries", "2",
      // Segmentlarni parallel yuklab olish — DASH/HLS uchun tezlikni oshiradi
      "--concurrent-fragments", "12",
      // Bulutda YouTube challenge'larini hal qilish uchun JS muhiti
      "--js-runtimes", "node",
      "--remote-components", "ejs:github",
    ];

    if (mode === "audio") {
      // Agar manba allaqachon MP3 bo'lsa, qayta kodlashsiz olinadi
      args.push(
        "-f", "bestaudio[ext=mp3]/bestaudio/best",
        "-x",
        "--audio-format", "mp3",
        "--audio-quality", "96K"
      );
    } else {
      // Bitta fayl (video+audio birga) — ffmpeg bilan birlashtirish bosqichi yo'q
      const h = ["480", "720", "1080"].includes(options.quality)
        ? options.quality
        : "720";
      args.push(
        "-f",
        `best[ext=mp4][height<=${h}]/best[height<=${h}]/best[ext=mp4]/best`
      );
    }

    const proc = ytdlp.exec(args);
    // Tashqi tomondan bekor qilish imkoniyati (/cancel buyrug'i uchun)
    options.onStart?.(() => {
      cancelled = true;
      const child = proc.ytDlpProcess ?? proc;
      if (typeof child.kill === "function") child.kill();
    });
    let stderr = "";
    let lastPercent = -1;

    proc.on("stdout", (chunk) => {
      const m = String(chunk).match(/\[download\]\s+(\d+(?:\.\d+)?)%/);
      if (m) {
        const percent = Math.floor(parseFloat(m[1]));
        if (percent >= lastPercent + 5) {
          lastPercent = percent;
          onProgress(percent);
        }
      }
    });

    proc.on("stderr", (chunk) => {
      stderr += String(chunk);
    });

    proc.on("error", (err) => {
      cleanup(dir);
      reject(err);
    });

    proc.on("close", (code) => {
      if (cancelled) {
        cleanup(dir);
        reject(new Error("CANCELLED"));
        return;
      }
      if (code !== 0) {
        cleanup(dir);
        const reason = stderr.trim().split("\n").pop() || `yt-dlp xato kodi: ${code}`;
        reject(new Error(reason));
        return;
      }
      const files = fs
        .readdirSync(dir)
        .map((f) => path.join(dir, f))
        .filter((f) => fs.statSync(f).isFile());
      if (files.length === 0) {
        cleanup(dir);
        reject(new Error("Fayl yuklab olinmadi"));
        return;
      }
      // Eng katta fayl — yakuniy natija (video yoki mp3)
      const file = files.sort(
        (a, b) => fs.statSync(b).size - fs.statSync(a).size
      )[0];
      const size = fs.statSync(file).size;
      if (size > MAX_FILE_SIZE) {
        cleanup(dir);
        reject(new Error("TOO_BIG"));
        return;
      }
      resolve({ file, dir, size });
    });
  });
}

/** Vaqtinchalik papkani o'chiradi */
export function cleanup(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // e'tiborsiz qoldiramiz
  }
}
