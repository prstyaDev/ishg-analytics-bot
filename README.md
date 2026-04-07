# 📈 ISHG Bot

Bot Telegram berbasis AI untuk analisis saham IHSG secara real-time. Menggunakan LLM lokal (Ollama) dengan tool calling untuk menarik data pasar dari [GoAPI](https://goapi.io) dan menghasilkan analisis teknikal otomatis.

## Fitur Utama

- **Analisis Real-time:** Menarik data harga, statistik pasar mingguan, top gainer/loser, hingga fundamental murni dari [GoAPI](https://goapi.io).
- **Session Memory:** AI dapat mengingat riwayat percakapan sebelumnya per chat (Dibatasi 20 pesan terakhir dengan TTL 1 jam agar hemat memori API LLM).
- **Caching:** Menyimpan sementara pemanggilan GoAPI dengan TTL 60 detik melalui `node-cache` untuk penghematan *request/bandwidth*.
- **Visualisasi Chart:** Bot berkemampuan me-render grafik (chart) harga saham selama 30 hari ke belakang menjadi gambar secara dinamis dengan menggunakan dependensi native \`chartjs-node-canvas\`.

## Arsitektur

```text
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Telegram   │────▶│   Telegraf   │────▶│   Hermes     │────▶│   Ollama     │
│   User       │◀────│   Bot Handler│◀────│   AI Agent   │◀────│   LLM (7B)   │
└──────────────┘     └──────────────┘     └──────────────┘     └──────┬───────┘
                                                                      │
                                                                      │ tool call
                                                                      ▼
                                                               ┌──────────────┐
                                                               │   GoAPI      │
                                                               │   Stock IDX  │
                                                               └──────────────┘
```

| Layer | File | Deskripsi |
|---|---|---|
| **Entrypoint** | `src/index.ts` | Express server + Telegraf (polling/webhook) |
| **Bot Handler** | `src/bot/index.ts` | Menerima pesan, intercept chart, memanggil agen |
| **AI Agent** | `src/agent/hermes.ts` | Orkestrasi LLM, session context |
| **Tool Registry** | `src/tools/registry.ts` | Definisi 8 tool (harga, trending, top movers, dsb) |
| **Chart Util** | `src/utils/chart.ts` | Helper function render chartjs-node-canvas |
| **Config** | `src/config/env.ts` | Validasi environment variables dengan Zod |

## Tech Stack

| Teknologi | Versi | Fungsi |
|---|---|---|
| TypeScript | 6.x | Bahasa utama |
| Vercel AI SDK | 6.x | Orkestrasi LLM + tool calling |
| @ai-sdk/openai | 3.x | Provider OpenAI-compatible (Ollama) |
| Telegraf | 4.x | Telegram Bot API |
| Express | 5.x | HTTP server (webhook mode) |
| Axios | 1.x | HTTP client untuk GoAPI |
| Zod | 4.x | Validasi schema |
| Ollama | - | Runtime LLM lokal |

## Prasyarat

- **Node.js** ≥ 18
- **Ollama** terinstal dan berjalan di `localhost:11434`
- Model LLM sudah di-pull (default: `qwen3:8b`)
- **Telegram Bot Token** dari [@BotFather](https://t.me/BotFather)
- **GoAPI Key** dari [goapi.io](https://goapi.io)

## Setup

### 1. Clone & Install

```bash
git clone https://github.com/prstyaDev/ishg-bot.git
cd ishg-bot
npm install
```

### 2. Pull Model Ollama

```bash
ollama pull qwen3:8b
```

Atau gunakan model lain yang mendukung tool calling (misalnya `llama3.1:8b`, `mistral:7b`).

### 3. Konfigurasi Environment Variables

Buat file `.env` di root project:

```env
# [WAJIB] Token bot Telegram dari @BotFather
TELEGRAM_BOT_TOKEN="your-telegram-bot-token"

# [WAJIB] API key dari goapi.io untuk data saham IDX
GOAPI_KEY="your-goapi-key"

# [OPSIONAL] Port untuk Express server (default: 3000)
PORT=3000

# [OPSIONAL] Mode aplikasi: development (polling) | production (webhook)
NODE_ENV=development

# [OPSIONAL] Base URL Ollama (default: http://localhost:11434/v1)
OLLAMA_BASE_URL=http://localhost:11434/v1

# [OPSIONAL] Model Ollama yang digunakan (default: qwen3:8b)
OLLAMA_MODEL=qwen3:8b
```

#### Detail Environment Variables

| Variable | Wajib | Default | Deskripsi |
|---|---|---|---|
| `TELEGRAM_BOT_TOKEN` | ✅ | - | Token dari @BotFather |
| `GOAPI_KEY` | ✅ | - | API key GoAPI untuk data saham IDX |
| `PORT` | ❌ | `3000` | Port Express (hanya untuk mode production/webhook) |
| `NODE_ENV` | ❌ | `development` | `development` = polling, `production` = webhook |
| `OLLAMA_BASE_URL` | ❌ | `http://localhost:11434/v1` | Endpoint Ollama |
| `OLLAMA_MODEL` | ❌ | `qwen3:8b` | Nama model Ollama |

### 4. Jalankan

```bash
# Development (polling mode)
npm run dev

# Production build
npm run build
npm start
```

## API Reference

### Base Configuration

Semua request menggunakan konfigurasi berikut:

```
Base URL: https://api.goapi.io
Headers:
  X-API-KEY: <GOAPI_KEY>
  Accept: application/json
Timeout: 15000ms
```

### Tool Registry (8 Tools)

Berikut adalah daftar lengkap tool yang tersedia untuk dipanggil oleh LLM melalui Vercel AI SDK:

| # | Tool | Endpoint | Parameter | Deskripsi |
|---|------|----------|-----------|-----------|
| 1 | `get_stock_price` | `GET /stock/idx/prices?symbols={symbol}` | `symbol` (string) | Harga saham terkini berdasarkan kode emiten |
| 2 | `get_market_summary` | `GET /stock/idx/trending` | — | Ringkasan pasar IHSG & saham trending hari ini |
| 3 | `get_top_movers` | `GET /stock/idx/top_gainer` + `GET /stock/idx/top_loser` | — | Top Gainer & Top Loser hari ini (parallel fetch) |
| 4 | `compare_emiten` | `GET /stock/idx/prices?symbols={s1},{s2}` | `symbol1`, `symbol2` (string) | Komparasi harga & volume dua emiten side-by-side |
| 5 | `get_historical_data` | `GET /stock/idx/{symbol}/historical?from=&to=` | `symbol` (string) | Data historis harga 30 hari terakhir (tanggal auto-generate) |
| 6 | `get_fundamentals` | `GET /stock/idx/{symbol}/profile` | `symbol` (string) | Profil perusahaan & rasio keuangan (PER, PBV, ROE, EPS) |
| 7 | `get_broker_summary` | `GET /stock/idx/{symbol}/broker_summary?date=&investor=` | `symbol` (string), `date?` (YYYY-MM-DD), `investor?` (LOCAL/FOREIGN/ALL) | Analisis bandarmologi: aktivitas broker lokal & asing |
| 8 | `request_chart` | — | `symbol` (string) | AI menyisipkan command Telegram untuk membuat grafik visual saham |

### Contoh Response (get_stock_price)

```json
{
  "status": "success",
  "message": "Menampilkan harga terakhir dari 1 saham.",
  "data": {
    "results": [
      {
        "symbol": "BBCA",
        "company": {
          "symbol": "BBCA",
          "name": "Bank Central Asia Tbk.",
          "logo": "https://s3.goapi.io/logo/BBCA.jpg"
        },
        "date": "2026-04-02",
        "open": 6550,
        "high": 6600,
        "low": 6525,
        "close": 6525,
        "volume": 10608100,
        "change": 25,
        "change_pct": 0.3846
      }
    ]
  }
}
```

## Cara Kerja AI Agent

```text
User mengirim pesan
        │
        ▼
┌─ Phase 1: generateText() dengan 8 tools ───────────┐
│  LLM menentukan tool mana yang relevan:             │
│  • Harga? → get_stock_price                         │
│  • Pasar? → get_market_summary / get_top_movers     │
│  • Banding? → compare_emiten                        │
│  • Historis? → get_historical_data                  │
│  • Fundamental? → get_fundamentals                  │
│  • Bandar? → get_broker_summary                     │
│  • Menggambar Grafik? → request_chart               │
│                                                     │
│  GoAPI mengembalikan data → LLM merangkum           │
└─────────────────────────────────────────────────────┘
        │
        ▼ result.text ada?
       / \
     Ya    Tidak (model kecil kadang gagal loop)
      │        │
      ▼        ▼
   Return   ┌─ Phase 2: generateText() tanpa tools ──┐
             │  Kirim data tool ke LLM sebagai prompt  │
             │  LLM generate analisis dari data        │
             └─────────────────────────────────────────┘
```

Phase 2 adalah fallback untuk model kecil (7-8B) yang terkadang tidak bisa melanjutkan generasi teks setelah tool call selesai. `maxSteps: 5` mengizinkan LLM memanggil lebih dari satu tool dalam satu sesi.

## Database

Project ini **tidak menggunakan database**. Semua data saham diambil secara real-time dari GoAPI dan tidak disimpan secara persisten.

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

Pada mode production, bot menerima update via webhook di path:

```
POST /webhook/<secret-path>
```

Pastikan server memiliki:
- Domain publik dengan HTTPS
- Port yang terbuka (default: 3000)
- Webhook URL yang sudah di-set ke Telegram via `setWebhook`

## Struktur Project

```
ishg-bot/
├── src/
│   ├── index.ts              # Entrypoint (Express + Telegraf)
│   ├── agent/
│   │   └── hermes.ts         # AI agent (Vercel AI SDK + Ollama)
│   ├── bot/
│   │   └── index.ts          # Telegram message handler
│   ├── config/
│   │   └── env.ts            # Environment validation (Zod)
│   └── tools/
│       └── registry.ts       # Tool definitions (GoAPI)
├── .env                      # Environment variables (tidak di-commit)
├── .gitignore
├── package.json
└── tsconfig.json
```

## License

MIT
