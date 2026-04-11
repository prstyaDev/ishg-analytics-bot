# 📈 ISHG Bot

Bot Telegram berbasis AI untuk analisis saham IHSG secara real-time. Menggunakan **Google Gemini** (via Vercel AI SDK) dengan tool calling untuk menarik data pasar dari [GoAPI](https://goapi.io), mengelola watchlist pribadi, dan menghasilkan analisis teknikal otomatis.

## Fitur Utama

- **Analisis Real-time:** Menarik data harga, statistik pasar, top gainer/loser, fundamental, dan bandarmologi dari [GoAPI](https://goapi.io).
- **Watchlist Pribadi:** Simpan, lihat, dan hapus saham dari daftar pantauan personal berbasis SQLite.
- **Session Memory:** AI mengingat riwayat percakapan per chat (max 20 pesan, TTL 1 jam).
- **Caching:** Response GoAPI di-cache 60 detik via `node-cache` untuk hemat request.
- **Visualisasi Chart:** Render grafik harga saham 30 hari ke belakang menjadi gambar dengan `chartjs-node-canvas`.
- **Time-Aware:** AI mengetahui tanggal dan waktu saat ini (WIB) secara real-time.

## Arsitektur

```text
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Telegram   │────▶│   Telegraf   │────▶│   Hermes     │────▶│   Google     │
│   User       │◀────│   Bot Handler│◀────│   AI Agent   │◀────│   Gemini API │
└──────────────┘     └──────────────┘     └──────┬───────┘     └──────────────┘
                                                  │
                                          tool call│
                                    ┌─────────────┼─────────────┐
                                    ▼             ▼             ▼
                             ┌───────────┐ ┌───────────┐ ┌───────────┐
                             │  GoAPI    │ │  SQLite   │ │  Chart    │
                             │  IDX Data │ │  Watchlist│ │  Renderer │
                             └───────────┘ └───────────┘ └───────────┘
```

| Layer | File | Deskripsi |
|---|---|---|
| **Entrypoint** | `src/index.ts` | Express server + Telegraf + DB init |
| **Bot Handler** | `src/bot/index.ts` | Menerima pesan, timeout handling, intercept chart |
| **AI Agent** | `src/agent/hermes.ts` | Orkestrasi LLM, session context, tool routing |
| **Tool Registry** | `src/tools/registry.ts` | 11 tools (market data + watchlist CRUD) |
| **Database** | `src/db/index.ts` | SQLite init & accessor (portfolio, watchlist, alerts) |
| **Chart Util** | `src/utils/chart.ts` | Render grafik saham via chartjs-node-canvas |
| **Config** | `src/config/env.ts` | Validasi environment variables dengan Zod |

## Tech Stack

| Teknologi | Versi | Fungsi |
|---|---|---|
| TypeScript | 6.x | Bahasa utama |
| Vercel AI SDK | 6.x | Orkestrasi LLM + tool calling |
| @ai-sdk/google | latest | Provider Google Gemini |
| Telegraf | 4.x | Telegram Bot API |
| Express | 5.x | HTTP server (webhook mode) |
| SQLite3 + sqlite | latest | Database lokal untuk watchlist & portfolio |
| Axios | 1.x | HTTP client untuk GoAPI |
| Zod | 4.x | Validasi schema |
| node-cache | 5.x | In-memory caching |

## Prasyarat

- **Node.js** ≥ 18
- **Telegram Bot Token** dari [@BotFather](https://t.me/BotFather)
- **GoAPI Key** dari [goapi.io](https://goapi.io)
- **Google AI API Key** dari [Google AI Studio](https://aistudio.google.com/apikey)

## Setup

### 1. Clone & Install

```bash
git clone https://github.com/prstyaDev/ishg-bot.git
cd ishg-bot
npm install
```

### 2. Konfigurasi Environment Variables

Salin `.env.example` ke `.env` dan isi dengan API key yang sesuai:

```bash
cp .env.example .env
```

```env
# [WAJIB] Token bot Telegram dari @BotFather
TELEGRAM_BOT_TOKEN="your-telegram-bot-token"

# [WAJIB] API key dari goapi.io untuk data saham IDX
GOAPI_KEY="your-goapi-key"

# [WAJIB] API key dari Google AI Studio untuk Gemini
GOOGLE_GENERATIVE_AI_API_KEY="your-google-ai-api-key"

# [OPSIONAL] Port untuk Express server (default: 3000)
PORT=3000

# [OPSIONAL] Mode aplikasi: development (polling) | production (webhook)
NODE_ENV=development
```

#### Detail Environment Variables

| Variable | Wajib | Default | Deskripsi |
|---|---|---|---|
| `TELEGRAM_BOT_TOKEN` | ✅ | - | Token dari @BotFather |
| `GOAPI_KEY` | ✅ | - | API key GoAPI untuk data saham IDX |
| `GOOGLE_GENERATIVE_AI_API_KEY` | ✅ | - | API key Google AI Studio untuk Gemini |
| `PORT` | ❌ | `3000` | Port Express (hanya untuk mode production/webhook) |
| `NODE_ENV` | ❌ | `development` | `development` = polling, `production` = webhook |

### 3. Jalankan

```bash
# Development (polling mode, auto-reload)
npm run dev

# Production build
npm run build
npm start
```

## Tool Registry (11 Tools)

### Market Data Tools (8)

| # | Tool | Endpoint | Parameter | Deskripsi |
|---|------|----------|-----------|-----------| 
| 1 | `get_stock_price` | `GET /stock/idx/prices` | `symbol` | Harga saham terkini |
| 2 | `get_market_summary` | `GET /stock/idx/trending` | — | Ringkasan pasar IHSG & trending |
| 3 | `get_top_movers` | `GET /stock/idx/top_gainer` + `top_loser` | — | Top Gainer & Loser (limited top 10) |
| 4 | `compare_emiten` | `GET /stock/idx/prices` | `symbol1`, `symbol2` | Komparasi dua emiten |
| 5 | `get_historical_data` | `GET /stock/idx/{symbol}/historical` | `symbol` | Data historis 30 hari |
| 6 | `get_fundamentals` | `GET /stock/idx/{symbol}/profile` | `symbol` | Profil & rasio keuangan |
| 7 | `get_broker_summary` | `GET /stock/idx/{symbol}/broker_summary` | `symbol`, `date?`, `investor?` | Bandarmologi |
| 8 | `request_chart` | — (internal) | `symbol` | Render chart grafik saham |

### Watchlist Tools (3) — Factory Pattern

Watchlist tools menggunakan **factory function** pattern: `chatId` di-inject otomatis dari konteks Telegram, sehingga AI hanya perlu menyebut kode saham.

| # | Tool | Parameter | Deskripsi |
|---|------|-----------|-----------|
| 9 | `add_to_watchlist` | `symbol` | Tambah saham ke watchlist |
| 10 | `get_watchlist` | — | Lihat isi watchlist |
| 11 | `remove_from_watchlist` | `symbol` | Hapus saham dari watchlist |

## Database (SQLite)

Bot menggunakan SQLite (`hermes.db`) untuk penyimpanan lokal. Database dibuat otomatis saat pertama kali dijalankan.

### Tabel

| Tabel | Kolom | Deskripsi |
|-------|-------|-----------|
| `portfolio` | id, chat_id, symbol, average_price, total_lot, created_at | Portofolio saham user |
| `watchlist` | id, chat_id, symbol, created_at | Daftar pantauan saham |
| `alerts` | id, chat_id, symbol, target_price, condition, is_active, created_at | Price alert (ABOVE/BELOW) |

## Cara Kerja AI Agent

```text
User mengirim pesan
        │
        ▼
┌─ Phase 1: generateText() dengan 11 tools ──────────┐
│  Gemini menentukan tool mana yang relevan:           │
│  • Harga? → get_stock_price                          │
│  • Pasar? → get_market_summary / get_top_movers      │
│  • Banding? → compare_emiten                         │
│  • Historis? → get_historical_data                   │
│  • Fundamental? → get_fundamentals                   │
│  • Bandar? → get_broker_summary                      │
│  • Grafik? → request_chart                           │
│  • Watchlist? → add/get/remove_from_watchlist         │
│                                                      │
│  GoAPI/SQLite → data → Gemini merangkum              │
└──────────────────────────────────────────────────────┘
        │
        ▼ result.text ada?
       / \
     Ya    Tidak
      │        │
      ▼        ▼
   Return   ┌─ Phase 2: generateText() tanpa tools ──┐
             │  Kirim data tool ke Gemini sebagai      │
             │  prompt → generate analisis             │
             └─────────────────────────────────────────┘
```

## Error Handling

| Error | Penanganan |
|-------|------------|
| **Timeout > 120 detik** | Bot mengirim pesan: "Pengambilan data market sedang padat" |
| **Google AI Rate Limit** | Deteksi `RESOURCE_EXHAUSTED`, kirim pesan informatif ke user |
| **GoAPI Gagal** | Per-tool error handling, return pesan error ke AI untuk disampaikan |
| **Tool Data Kosong** | Fallback Phase 2 untuk generate analisis dari data mentah |

## Deployment

### Mode Development (Polling)

```bash
NODE_ENV=development npm run dev
```

Bot menggunakan long polling — tidak perlu domain publik atau SSL.

### Mode Production (Webhook)

```bash
NODE_ENV=production npm start
```

Pastikan server memiliki:
- Domain publik dengan HTTPS
- Port yang terbuka (default: 3000)

## Struktur Project

```
ishg-bot/
├── src/
│   ├── index.ts              # Entrypoint (Express + Telegraf + DB init)
│   ├── agent/
│   │   └── hermes.ts         # AI agent (Vercel AI SDK + Gemini)
│   ├── bot/
│   │   └── index.ts          # Telegram handler + timeout + rate limit
│   ├── config/
│   │   └── env.ts            # Environment validation (Zod)
│   ├── db/
│   │   └── index.ts          # SQLite database init & accessor
│   ├── tools/
│   │   └── registry.ts       # 11 tool definitions (GoAPI + Watchlist)
│   └── utils/
│       └── chart.ts          # Chart renderer (chartjs-node-canvas)
├── .env                      # Environment variables (tidak di-commit)
├── .env.example              # Template environment variables
├── .gitignore
├── package.json
└── tsconfig.json
```

## License

MIT
