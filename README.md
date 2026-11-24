# 📥 Telegram Video/Musiqa Yuklovchi Bot

YouTube, Instagram, TikTok va boshqa saytlardan video (MP4) yoki musiqa (MP3) yuklab beradigan Telegram bot.

**Texnologiyalar:** Node.js + Telegraf + yt-dlp + ffmpeg

## 🚀 Ishga tushirish

### 1. Bot token oling
1. Telegram'da [@BotFather](https://t.me/BotFather) ni oching
2. `/newbot` buyrug'ini yuboring
3. Botga nom va username bering (username `bot` bilan tugashi kerak)
4. Berilgan tokenni nusxalang

### 2. Tokenni sozlang
`.env.example` faylidan `.env` nusxa oling va tokenni yozing:

```
BOT_TOKEN=123456789:AA...sizning_tokeningiz
```

PowerShell'da:
```powershell
Copy-Item .env.example .env
notepad .env
```

### 3. Ishga tushiring
```powershell
npm install   # bir marta (agar hali o'rnatilmagan bo'lsa)
npm start
```

Birinchi ishga tushirishda `yt-dlp` avtomatik yuklab olinadi (`bin/` papkasiga).

## 💬 Foydalanish
1. Telegram'da botingizni ochib `/start` bosing
2. Video havolasini yuboring (masalan `https://youtube.com/watch?v=...`)
3. **🎬 Video (MP4)** yoki **🎵 Musiqa (MP3)** tugmasini bosing
4. Bot yuklab, faylni sizga yuboradi — progress foizi ko'rsatiladi

## ⚠️ Cheklovlar
- Telegram Bot API orqali maksimal **50 MB** fayl yuborish mumkin
- Yopiq (private) videolar yuklanmaydi
- Bir foydalanuvchi bir vaqtda bitta fayl yuklay oladi

## 📁 Fayllar
| Fayl | Vazifasi |
|------|----------|
| `index.js` | Bot logikasi (Telegraf) |
| `downloader.js` | yt-dlp orqali yuklash moduli |
| `.env` | Bot tokeni (maxfiy!) |
| `bin/` | yt-dlp binary (avtomatik yuklanadi) |

## ☁️ Bepul bulutga joylashtirish (Render)

Bot 24/7 ishlashi uchun (kompyuter o'chsa ham):

### 1. GitHub'ga yuklash
```powershell
git init
git add .
git commit -m "Telegram downloader bot"
git branch -M main
git remote add origin https://github.com/SIZNING_LOGININGIZ/yuklasmartbot.git
git push -u origin main
```
(Birinchisida GitHub'da yangi repo ochib, uning URL'ini qo'ying. `.env` va `bin/` yuborilmaydi — bu xavfsiz.)

### 2. Render'da joylashtirish
1. [render.com](https://render.com) → akkaunt oching (GitHub bilan kirsangiz bo'ladi)
2. **New + → Web Service** → GitHub repositoriyasini tanlang
3. Sozlamalar avtomatik to'ldiriladi (`render.yaml` tufayli):
   - **Build Command:** `npm install`
   - **Start Command:** `node index.js`
   - **Plan:** Free
4. **Environment** bo'limida `BOT_TOKEN` ga BotFather bergan tokenni yozing
5. **Create Web Service** bosing

### 3. Tekshirish
- Render loglarida `✅ Bot ishga tushdi!` ko'rinishi kerak
- Telegram'da botga `/start` yuboring

> ⚠️ **Render Free** rejasida sayt 15 daqiqa harakatsizlikdan keyin uxlab qoladi. Bot birinchi xabarda qayta uyg'onadi (10-30 soniya kutish mumkin). Doimiy ishlash kerak bo'lsa, Fly.io yoki Koyeb kabi xizmatlarni ko'ring.

> 🔒 `.env` fayli GitHub'ga yuborilmaydi (`.gitignore` da bor). Tokenni faqat Render dashboard'ida kiriting!
