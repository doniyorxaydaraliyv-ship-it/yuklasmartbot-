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

/** yt-dlp binary'sini tekshiradi, yo'q bo'lsa GitHub'dan yuklab oladi */
export async function ensureYtDlp() {
  fs.mkdirSync(BIN_DIR, { recursive: true });
  if (!fs.existsSync(BIN_PATH)) {
    console.log("yt-dlp yuklab olinmoqda (birinchi ishga tushirish)...");
    await YTDlpWrap.downloadFromGithub(BIN_PATH);
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
export function download(ytdlp, url, mode, onProgress = () => {}) {
  return new Promise((resolve, reject) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tgbot-"));
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
      "--retries", "3",
    ];

    if (mode === "audio") {
      args.push(
        "-f", "bestaudio/best",
        "-x",
        "--audio-format", "mp3",
        "--audio-quality", "128K"
      );
    } else {
      args.push(
        "-f",
        "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
        "--merge-output-format", "mp4"
      );
    }

    const proc = ytdlp.exec(args);
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
