import axios from 'axios';
import { tool } from 'ai';
import { z } from 'zod';
import NodeCache from 'node-cache';
import { env } from '../config/env';
import { getDb } from '../db';

const api = axios.create({
  baseURL: 'https://api.goapi.io',
  headers: {
    'X-API-KEY': env.GOAPI_KEY,
    'Accept': 'application/json'
  },
  timeout: 120000
});

const cache = new NodeCache({ stdTTL: 60, checkperiod: 30 });

function getDateRange(daysBack: number) {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - daysBack);
  const fmt = (d: Date) => d.toISOString().split('T')[0];
  return { dateFrom: fmt(from), dateTo: fmt(to) };
}

// ────────────────────────────────────────────────────────────────────────────────
// 1. GET STOCK PRICE
// ────────────────────────────────────────────────────────────────────────────────
export const getPrice = tool({
  description:
    'Mendapatkan harga saham terkini berdasarkan kode emiten 4 huruf di BEI (Bursa Efek Indonesia). ' +
    'Gunakan tool ini ketika pengguna menanyakan harga, pergerakan, atau data real-time suatu saham. ' +
    'Contoh kode emiten: BBCA, BBRI, TLKM, ASII.',
  inputSchema: z.object({
    symbol: z
      .string()
      .describe('Kode emiten saham 4 huruf di BEI, contoh: BBCA, BBRI, TLKM')
  }),
  execute: async ({ symbol }) => {
    try {
      const sym = symbol.toUpperCase();
      const cacheKey = `prices_${sym}`;
      const cached = cache.get<string>(cacheKey);
      if (cached) {
        console.log(`[Cache HIT] ${cacheKey}`);
        return cached;
      }
      console.log(`[Cache MISS] Fetching new data for: ${cacheKey}`);
      const { data } = await api.get('/stock/idx/prices', {
        params: { symbols: sym }
      });
      console.log('[GoAPI get_stock_price]:', JSON.stringify(data, null, 2));
      const result = data?.data?.results?.[0] || data?.data || data;
      const closePrice = result?.close ?? result?.price ?? 'Tidak diketahui';
      const high = result?.high ?? '-';
      const low = result?.low ?? '-';
      const open = result?.open ?? '-';
      const volume = result?.volume ?? '-';
      const change = result?.change ?? '-';
      const changePct = result?.change_pct ?? '-';
      const output = `[SYSTEM DATA] Emiten: ${sym}, Harga Terakhir: ${closePrice}, Open: ${open}, High: ${high}, Low: ${low}, Volume: ${volume}, Perubahan: ${change} (${changePct}%). Tolong berikan analisa teknikal singkat berdasarkan angka-angka ini.`;
      cache.set(cacheKey, output);
      return output;
    } catch (err: any) {
      console.error('[get_stock_price Error]:', err?.response?.status, err?.response?.data || err?.message);
      return '[SYSTEM ERROR] Data emiten gagal ditarik dari bursa';
    }
  }
});

// ────────────────────────────────────────────────────────────────────────────────
// 2. GET MARKET SUMMARY
// ────────────────────────────────────────────────────────────────────────────────
export const getMarketSummary = tool({
  description:
    'Mendapatkan ringkasan pasar saham IHSG dan daftar saham yang sedang trending hari ini. ' +
    'Gunakan tool ini ketika pengguna bertanya tentang kondisi pasar secara umum, ' +
    'misalnya: "bagaimana IHSG hari ini?", "pasar lagi naik atau turun?", "saham apa yang lagi trending?".',
  inputSchema: z.object({}),
  execute: async () => {
    try {
      const cacheKey = 'market_summary';
      const cached = cache.get<string>(cacheKey);
      if (cached) {
        console.log(`[Cache HIT] ${cacheKey}`);
        return cached;
      }
      console.log(`[Cache MISS] Fetching new data for: ${cacheKey}`);
      const { data } = await api.get('/stock/idx/trending');
      console.log('[GoAPI get_market_summary]:', JSON.stringify(data, null, 2));
      const output = `[SYSTEM DATA - MARKET SUMMARY]\n${JSON.stringify(data, null, 2)}\nBerikan ringkasan kondisi pasar berdasarkan data di atas.`;
      cache.set(cacheKey, output);
      return output;
    } catch (err: any) {
      console.error('[get_market_summary Error]:', err?.response?.status, err?.response?.data || err?.message);
      return '[SYSTEM ERROR] Gagal mengambil data ringkasan pasar IHSG';
    }
  }
});

// ────────────────────────────────────────────────────────────────────────────────
// 3. GET TOP MOVERS
// ────────────────────────────────────────────────────────────────────────────────
export const getTopMovers = tool({
  description:
    'Mendapatkan daftar saham Top Gainer (naik tertinggi) dan Top Loser (turun terdalam) hari ini di bursa IDX. ' +
    'Gunakan tool ini ketika pengguna bertanya tentang saham yang naik/turun paling banyak, ' +
    'misalnya: "saham apa yang naik paling tinggi?", "top gainer hari ini?", "saham apa yang anjlok?", "top loser?".',
  inputSchema: z.object({}),
  execute: async () => {
    try {
      const cacheKey = 'top_movers';
      const cached = cache.get<string>(cacheKey);
      if (cached) {
        console.log(`[Cache HIT] ${cacheKey}`);
        return cached;
      }
      console.log(`[Cache MISS] Fetching new data for: ${cacheKey}`);
      console.log(`[GoAPI get_top_movers] Memulai fetch data gainers...`);
      const gainers = await api.get('/stock/idx/top_gainer');
      console.log(`[GoAPI get_top_movers] Berhasil fetch gainers.`);
      
      console.log(`[GoAPI get_top_movers] Memulai fetch data losers...`);
      const losers = await api.get('/stock/idx/top_loser');
      console.log(`[GoAPI get_top_movers] Berhasil fetch losers.`);

      // Optimasi: Ambil hanya 10 data teratas agar payload tidak membebani LLM (timeout prevention)
      const extractData = (res: any) => {
        const raw = res?.data?.data?.results || res?.data?.data || res?.data || [];
        return Array.isArray(raw) ? raw.slice(0, 10) : raw;
      };
      
      const limitedGainers = extractData(gainers);
      const limitedLosers = extractData(losers);

      console.log('[GoAPI get_top_movers] Limited Gainers:', JSON.stringify(limitedGainers, null, 2));
      console.log('[GoAPI get_top_movers] Limited Losers:', JSON.stringify(limitedLosers, null, 2));

      const output =
        `[SYSTEM DATA - TOP MOVERS]\n` +
        `🟢 TOP GAINERS (Top 10):\n${JSON.stringify(limitedGainers, null, 2)}\n\n` +
        `🔴 TOP LOSERS (Top 10):\n${JSON.stringify(limitedLosers, null, 2)}\n\n` +
        `Berikan ringkasan saham-saham yang mengalami pergerakan signifikan hari ini.`;
      cache.set(cacheKey, output);
      return output;
    } catch (err: any) {
      console.error('[get_top_movers Error]:', err?.response?.status, err?.response?.data || err?.message);
      return '[SYSTEM ERROR] Gagal mengambil data top gainers/losers';
    }
  }
});

// ────────────────────────────────────────────────────────────────────────────────
// 4. COMPARE EMITEN
// ────────────────────────────────────────────────────────────────────────────────
export const compareEmiten = tool({
  description:
    'Membandingkan dua saham berdasarkan harga, volume, dan metrik dasar lainnya secara berdampingan. ' +
    'Gunakan tool ini ketika pengguna ingin membandingkan dua emiten secara langsung. ' +
    'Contoh pertanyaan: "bandingkan BBCA vs BBRI", "mending TLKM atau ISAT?", "compare ASII dan UNTR".',
  inputSchema: z.object({
    symbol1: z
      .string()
      .describe('Kode emiten saham pertama (4 huruf), contoh: BBCA'),
    symbol2: z
      .string()
      .describe('Kode emiten saham kedua (4 huruf) untuk dibandingkan, contoh: BBRI')
  }),
  execute: async ({ symbol1, symbol2 }) => {
    try {
      const s1 = symbol1.toUpperCase();
      const s2 = symbol2.toUpperCase();
      const sorted = [s1, s2].sort();
      const cacheKey = `compare_${sorted[0]}_${sorted[1]}`;
      const cached = cache.get<string>(cacheKey);
      if (cached) {
        console.log(`[Cache HIT] ${cacheKey}`);
        return cached;
      }
      console.log(`[Cache MISS] Fetching new data for: ${cacheKey}`);
      const { data } = await api.get('/stock/idx/prices', {
        params: { symbols: `${s1},${s2}` }
      });
      console.log('[GoAPI compare_emiten]:', JSON.stringify(data, null, 2));
      const output =
        `[SYSTEM DATA - PERBANDINGAN EMITEN] ${s1} vs ${s2}\n` +
        `${JSON.stringify(data, null, 2)}\n` +
        `Berikan analisis perbandingan kedua emiten berdasarkan data di atas. Mana yang lebih menarik untuk investor?`;
      cache.set(cacheKey, output);
      return output;
    } catch (err: any) {
      console.error('[compare_emiten Error]:', err?.response?.status, err?.response?.data || err?.message);
      return `[SYSTEM ERROR] Gagal membandingkan ${symbol1.toUpperCase()} dan ${symbol2.toUpperCase()}`;
    }
  }
});

// ────────────────────────────────────────────────────────────────────────────────
// 5. GET HISTORICAL DATA
// ────────────────────────────────────────────────────────────────────────────────
export const getHistoricalData = tool({
  description:
    'Mendapatkan data historis harga saham 30 hari terakhir untuk analisis tren dan teknikal. ' +
    'Gunakan tool ini ketika pengguna bertanya tentang tren harga, pergerakan historis, ' +
    'analisa teknikal, atau data candlestick suatu saham. ' +
    'Contoh: "tren BBCA sebulan terakhir?", "historis harga TLKM", "pergerakan BBRI 30 hari?".',
  inputSchema: z.object({
    symbol: z
      .string()
      .describe('Kode emiten saham 4 huruf di BEI untuk diambil data historisnya, contoh: BBCA')
  }),
  execute: async ({ symbol }) => {
    try {
      const sym = symbol.toUpperCase();
      const { dateFrom, dateTo } = getDateRange(30);
      const cacheKey = `historical_${sym}_${dateFrom}_${dateTo}`;
      const cached = cache.get<string>(cacheKey);
      if (cached) {
        console.log(`[Cache HIT] ${cacheKey}`);
        return cached;
      }
      console.log(`[Cache MISS] Fetching new data for: ${cacheKey}`);
      const { data } = await api.get(`/stock/idx/${sym}/historical`, {
        params: { from: dateFrom, to: dateTo }
      });
      console.log(`[GoAPI get_historical_data] ${sym} (${dateFrom} → ${dateTo}):`, JSON.stringify(data, null, 2));
      const output =
        `[SYSTEM DATA - HISTORICAL] Emiten: ${sym} | Periode: ${dateFrom} s/d ${dateTo}\n` +
        `${JSON.stringify(data, null, 2)}\n` +
        `Berikan analisis tren dan teknikal berdasarkan data historis di atas.`;
      cache.set(cacheKey, output);
      return output;
    } catch (err: any) {
      console.error('[get_historical_data Error]:', err?.response?.status, err?.response?.data || err?.message);
      return `[SYSTEM ERROR] Gagal mengambil data historis untuk ${symbol.toUpperCase()}`;
    }
  }
});

// ────────────────────────────────────────────────────────────────────────────────
// 6. GET FUNDAMENTALS
// ────────────────────────────────────────────────────────────────────────────────
export const getFundamentals = tool({
  description:
    'Mendapatkan profil dan rasio keuangan fundamental suatu saham, meliputi PER, PBV, ROE, EPS, ' +
    'serta informasi perusahaan. Gunakan tool ini ketika pengguna bertanya tentang valuasi, ' +
    'fundamental, profil perusahaan, atau apakah suatu saham murah/mahal. ' +
    'Contoh: "PER BBCA berapa?", "fundamental TLKM gimana?", "profil BBRI", "ASII kemahalan gak?".',
  inputSchema: z.object({
    symbol: z
      .string()
      .describe('Kode emiten saham 4 huruf di BEI untuk dicek profil dan rasio fundamentalnya, contoh: BBCA')
  }),
  execute: async ({ symbol }) => {
    try {
      const sym = symbol.toUpperCase();
      const cacheKey = `fundamentals_${sym}`;
      const cached = cache.get<string>(cacheKey);
      if (cached) {
        console.log(`[Cache HIT] ${cacheKey}`);
        return cached;
      }
      console.log(`[Cache MISS] Fetching new data for: ${cacheKey}`);
      const { data } = await api.get(`/stock/idx/${sym}/profile`);
      console.log(`[GoAPI get_fundamentals] ${sym}:`, JSON.stringify(data, null, 2));
      const output =
        `[SYSTEM DATA - FUNDAMENTAL] Emiten: ${sym}\n` +
        `${JSON.stringify(data, null, 2)}\n` +
        `Berikan analisis fundamental berdasarkan data di atas. Apakah valuasi saham ini wajar, murah, atau kemahalan?`;
      cache.set(cacheKey, output);
      return output;
    } catch (err: any) {
      console.error('[get_fundamentals Error]:', err?.response?.status, err?.response?.data || err?.message);
      return `[SYSTEM ERROR] Gagal mengambil data fundamental untuk ${symbol.toUpperCase()}`;
    }
  }
});

// ────────────────────────────────────────────────────────────────────────────────
// 7. GET BROKER SUMMARY (Bandarmologi)
// ────────────────────────────────────────────────────────────────────────────────
export const getBrokerSummary = tool({
  description:
    'Mendapatkan ringkasan aktivitas broker (bandarmologi) untuk suatu saham. ' +
    'Menampilkan data net buy/sell dari broker lokal dan asing. ' +
    'Gunakan tool ini ketika pengguna bertanya tentang bandar, broker, akumulasi, distribusi, ' +
    'asing masuk/keluar, atau aktivitas institusional pada suatu saham. ' +
    'Contoh: "broker summary BBCA", "bandar BBRI lagi ngapain?", "asing masuk di saham apa?", ' +
    '"bandarmologi TLKM tanggal 2026-04-01".',
  inputSchema: z.object({
    symbol: z
      .string()
      .describe('Kode emiten saham 4 huruf di BEI untuk dicek aktivitas broker-nya, contoh: BBCA'),
    date: z
      .string()
      .optional()
      .describe('Tanggal data broker dalam format YYYY-MM-DD. Opsional, default hari ini. Contoh: 2026-04-07'),
    investor: z
      .enum(['LOCAL', 'FOREIGN', 'ALL'])
      .optional()
      .describe('Filter jenis investor: LOCAL (domestik), FOREIGN (asing), atau ALL (semua). Opsional, default ALL')
  }),
  execute: async ({ symbol, date, investor }) => {
    try {
      const sym = symbol.toUpperCase();
      const queryDate = date || new Date().toISOString().split('T')[0];
      const queryInvestor = investor || 'ALL';
      const cacheKey = `broker_${sym}_${queryDate}_${queryInvestor}`;
      const cached = cache.get<string>(cacheKey);
      if (cached) {
        console.log(`[Cache HIT] ${cacheKey}`);
        return cached;
      }
      console.log(`[Cache MISS] Fetching new data for: ${cacheKey}`);
      const { data } = await api.get(`/stock/idx/${sym}/broker_summary`, {
        params: { date: queryDate, investor: queryInvestor }
      });
      console.log(`[GoAPI get_broker_summary] ${sym} (${queryDate}, ${queryInvestor}):`, JSON.stringify(data, null, 2));
      const output =
        `[SYSTEM DATA - BROKER SUMMARY] Emiten: ${sym} | Tanggal: ${queryDate} | Investor: ${queryInvestor}\n` +
        `${JSON.stringify(data, null, 2)}\n` +
        `Berikan analisis bandarmologi berdasarkan data broker di atas. Apakah ada indikasi akumulasi atau distribusi?`;
      cache.set(cacheKey, output);
      return output;
    } catch (err: any) {
      console.error('[get_broker_summary Error]:', err?.response?.status, err?.response?.data || err?.message);
      return `[SYSTEM ERROR] Gagal mengambil data broker summary untuk ${symbol.toUpperCase()}`;
    }
  }
});

// ────────────────────────────────────────────────────────────────────────────────
// 8. REQUEST CHART
// ────────────────────────────────────────────────────────────────────────────────
export const requestChart = tool({
  description:
    'Tool khusus untuk meminta sistem membuatkan grafik (chart) pergerakan harga saham sekian waktu terakhir. ' +
    'Gunakan tool ini JIKA DAN HANYA JIKA pengguna secara spesifik meminta gambar, grafik, chart, atau visualisasi. ' +
    'Contoh: "tampilkan chart BBCA", "minta grafik TLKM", "tolong gambarkan grafik BBRI".',
  inputSchema: z.object({
    symbol: z
      .string()
      .describe('Kode emiten saham 4 huruf di BEI, contoh: BBCA')
  }),
  execute: async ({ symbol }) => {
    // Tool ini hanya akan mengembalikan command khusus untuk di-intercept oleh Telegram Bot.
    return `[INSTRUCTION: GENERATE_CHART_FOR_SYMBOL: ${symbol.toUpperCase()}]`;
  }
});

// ────────────────────────────────────────────────────────────────────────────────
// WATCHLIST TOOLS — Factory function (chatId di-inject otomatis, bukan dari AI)
// ────────────────────────────────────────────────────────────────────────────────
export function createWatchlistTools(chatId: string) {
  const numericChatId = Number(chatId);

  const addToWatchlist = tool({
    description:
      'Menambahkan saham ke daftar watchlist pengguna. ' +
      'Gunakan tool ini ketika pengguna ingin memantau atau mengikuti suatu saham. ' +
      'Contoh: "watchlist BBCA", "pantau TLKM", "tambah BBRI ke watchlist saya".',
    inputSchema: z.object({
      symbol: z
        .string()
        .describe('Kode emiten saham 4 huruf di BEI, contoh: BBCA')
    }),
    execute: async ({ symbol }) => {
      try {
        const db = getDb();
        const sym = symbol.toUpperCase();

        const existing = await db.get(
          'SELECT id FROM watchlist WHERE chat_id = ? AND symbol = ?',
          [numericChatId, sym]
        );

        if (existing) {
          return `[SYSTEM] Saham ${sym} sudah ada di watchlist Anda.`;
        }

        await db.run(
          'INSERT INTO watchlist (chat_id, symbol) VALUES (?, ?)',
          [numericChatId, sym]
        );
        console.log(`[Watchlist] Added ${sym} for chat ${chatId}`);
        return `[SYSTEM] Saham ${sym} berhasil ditambahkan ke watchlist Anda.`;
      } catch (err: any) {
        console.error('[add_to_watchlist Error]:', err?.message);
        return `[SYSTEM ERROR] Gagal menambahkan saham ke watchlist.`;
      }
    }
  });

  const getWatchlist = tool({
    description:
      'Menampilkan daftar saham yang ada di watchlist pengguna. ' +
      'Gunakan tool ini ketika pengguna ingin melihat saham yang sedang dipantau. ' +
      'Contoh: "lihat watchlist saya", "watchlist apa saja?", "daftar pantauan saya".',
    inputSchema: z.object({}),
    execute: async () => {
      try {
        const db = getDb();
        const rows = await db.all(
          'SELECT symbol FROM watchlist WHERE chat_id = ?',
          [numericChatId]
        );

        if (!rows || rows.length === 0) {
          return '[SYSTEM] Watchlist Anda masih kosong.';
        }

        const symbols = rows.map((r: any) => r.symbol).join(', ');
        console.log(`[Watchlist] Fetched ${rows.length} items for chat ${chatId}`);
        return `[SYSTEM DATA - WATCHLIST] Daftar saham di watchlist Anda (${rows.length} saham): ${symbols}. Sampaikan daftar ini ke pengguna dengan format yang rapi.`;
      } catch (err: any) {
        console.error('[get_watchlist Error]:', err?.message);
        return '[SYSTEM ERROR] Gagal mengambil data watchlist.';
      }
    }
  });

  const removeFromWatchlist = tool({
    description:
      'Menghapus saham dari daftar watchlist pengguna. ' +
      'Gunakan tool ini ketika pengguna ingin berhenti memantau suatu saham. ' +
      'Contoh: "hapus BBCA dari watchlist", "remove TLKM", "jangan pantau BBRI lagi".',
    inputSchema: z.object({
      symbol: z
        .string()
        .describe('Kode emiten saham 4 huruf di BEI yang ingin dihapus, contoh: BBCA')
    }),
    execute: async ({ symbol }) => {
      try {
        const db = getDb();
        const sym = symbol.toUpperCase();

        const result = await db.run(
          'DELETE FROM watchlist WHERE chat_id = ? AND symbol = ?',
          [numericChatId, sym]
        );

        if (result.changes && result.changes > 0) {
          console.log(`[Watchlist] Removed ${sym} for chat ${chatId}`);
          return `[SYSTEM] Saham ${sym} berhasil dihapus dari watchlist Anda.`;
        } else {
          return `[SYSTEM] Saham ${sym} tidak ditemukan di watchlist Anda.`;
        }
      } catch (err: any) {
        console.error('[remove_from_watchlist Error]:', err?.message);
        return `[SYSTEM ERROR] Gagal menghapus saham dari watchlist.`;
      }
    }
  });

  return {
    add_to_watchlist: addToWatchlist,
    get_watchlist: getWatchlist,
    remove_from_watchlist: removeFromWatchlist
  };
}

// ────────────────────────────────────────────────────────────────────────────────
// TOOLS REGISTRY
// ────────────────────────────────────────────────────────────────────────────────
const baseTools = {
  get_stock_price: getPrice,
  get_market_summary: getMarketSummary,
  get_top_movers: getTopMovers,
  compare_emiten: compareEmiten,
  get_historical_data: getHistoricalData,
  get_fundamentals: getFundamentals,
  get_broker_summary: getBrokerSummary,
  request_chart: requestChart
};

export function createAllTools(chatId: string) {
  return {
    ...baseTools,
    ...createWatchlistTools(chatId)
  };
}

// Export base tools untuk backward-compat jika diperlukan
export const tools = baseTools;