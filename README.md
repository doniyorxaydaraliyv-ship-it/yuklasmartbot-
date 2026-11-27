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

## 🆕 Yangi funksiyalar
- **Sifat tanlash:** 🎥 1080p / 🎬 720p / 🎞 480p / 🎵 MP3 (480p — eng kichik va tez)
- **Ko'p tilli:** `/start` da 🇺🇿 O'zbek / 🇷🇺 Русский / 🇬🇧 English tanlash; keyin `/language` bilan o'zgartirish
- `/status` — yuklash holati, `/cancel` — bekor qilish
- 12 ta parallel fragment, birlashtirishsiz yuklash,Progress kamroq yangilanadi — tezroq ishlaydi

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

## 💻 Noutbukda avtomatik ishga tushirish

Bot noutbuk yoqilganda o'z-o'zidan ishga tushishi va o'chib qolsa qayta ishga tushishi uchun:

1. **Bir marta (qo'lda):** `Win + R` → `shell:startup` → Enter. Ochilgan papkaga loyihadagi **`launch-bot.cmd`** faylini nusxalang. Shundan keyin noutbuk yoqilganda bot avtomatik ishga tushadi. (Registry yozish bloklangan bo'lsa ham bu usul ishlaydi.)
2. Keyin har gal noutbuk yoqilib, tizimga kirganingizda bot fonada ishga tushadi — hech narsa qilish kerak emas.

### 🎛 Yoqib / o'chirib turish (eng oson)
**`BOT-YOQ-OCHIR.cmd`** faylini ikki marta bosing:
- Birinchi bosish — botni **yoqadi** ✅
- Yana bosish — botni **o'chiradi** 🛑
- Yana bosish — yana yoqadi (cheksiz almashinadi)

### ⌨️ Terminaldan boshqarish
```powershell
cd "C:\Users\USER\Documents\Default Project\telegram-downloader-bot"

bot.cmd start     # botni yoqish
bot.cmd stop      # botni o'chirish
bot.cmd restart   # qayta ishga tushirish
bot.cmd status    # holatini ko'rish
bot.cmd toggle    # yoqish/o'chirish (almashib turadi)
```
Yoki to'g'ridan-to'g'ri: `npm start` (shu oynada ishga tushiradi, `Ctrl+C` bilan to'xtatiladi).

### Boshqa fayllar
| Fayl | Vazifasi |
|------|----------|
| `start-bot.cmd` | Ikki marta bosilsa — botni fonada ishga tushiradi |
| `stop-bot.ps1` | Botni to'xtatadi (`powershell -File stop-bot.ps1`) |
| `start-bot.ps1` | Kuzatuvchi skript (bot o'chsa 10 soniyada qayta ishga tushiradi) |

Loglar: `bot.log` va `bot-error.log`.

> Eslatma: `avtostart.reg` faqat **joriy foydalanuvchi** uchun qo'shiladi, admin huquqi kerak emas.

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
