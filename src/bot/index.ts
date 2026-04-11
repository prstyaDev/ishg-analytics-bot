import { Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
import axios from 'axios';
import { env } from '../config/env';
import { processQuery } from '../agent/hermes';
import { generateChart } from '../utils/chart';

export const bot = new Telegraf(env.TELEGRAM_BOT_TOKEN);

function getDateRange(daysBack: number) {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - daysBack);
  const fmt = (d: Date) => d.toISOString().split('T')[0];
  return { dateFrom: fmt(from), dateTo: fmt(to) };
}

const withTimeout = <T>(promise: Promise<T>, ms: number, timeoutMsg: string): Promise<T> => {
  let timer: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(timeoutMsg)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
};

bot.on(message('text'), async (ctx) => {
  console.log(`[Pesan Masuk] dari ${ctx.from.first_name}: ${ctx.message.text}`);
  console.log("[Debug] Memproses pesan:", ctx.message.text);
  try {
    await ctx.sendChatAction('typing');
    
    let reply: string;
    try {
      reply = await withTimeout(
        processQuery(ctx.message.text, ctx.chat.id.toString()),
        120000,
        'TIMEOUT_ERROR'
      );
    } catch (queryErr: any) {
      if (queryErr.message === 'TIMEOUT_ERROR') {
        console.log('[System] Query execution timed out after 120 detik.');
        await ctx.reply("Maaf, pengambilan data market sedang padat, coba lagi sebentar lagi.");
        return;
      }
      throw queryErr;
    }
    
    console.log('[AI Final Output]:', reply);
    
    if (!reply || reply.trim() === '') {
      await ctx.reply('AI berhasil menarik data pasar, tetapi gagal merangkumnya menjadi teks.');
      return;
    }

    // Cek apakah ada instruksi GENERATE_CHART
    const chartRegex = /\[INSTRUCTION:\s*GENERATE_CHART_FOR_SYMBOL:\s*([A-Z0-9]+)\]/i;
    const match = reply.match(chartRegex);

    // Langsung hapus SELURUH instruksi dari balasan sebelum diproses apa-apa (gunakan global regex)
    reply = reply.replace(/\[INSTRUCTION:.*?\]/gi, '').trim();

    if (match) {
      const symbol = match[1];

      // Kasih tau user kalau bot lagi proses gambar
      await ctx.reply(`📊 Memproses grafik untuk saham ${symbol}...`);
      await ctx.sendChatAction('upload_photo');

      try {
        // Ambil data 30 hari ke belakang
        const { dateFrom, dateTo } = getDateRange(30);
        const { data } = await axios.get(`https://api.goapi.io/stock/idx/${symbol}/historical`, {
          params: { from: dateFrom, to: dateTo },
          headers: { 'X-API-KEY': env.GOAPI_KEY, 'Accept': 'application/json' }
        });

        // Tergantung dari struktur response GoAPI, amankan result-nya
        const historyResult = data?.data?.results || data?.data;
        
        if (historyResult && Array.isArray(historyResult) && historyResult.length > 0) {
          const buffer = await generateChart(symbol, historyResult);
          
          if (reply) await ctx.reply(reply); // kirim teks sisa balasan jika ada
          
          await ctx.replyWithPhoto({ source: buffer });
        } else {
          await ctx.reply(`Maaf, data historis untuk ${symbol} tidak ditemukan.`);
          if (reply) await ctx.reply(reply);
        }
      } catch (err: any) {
        console.error('[Chart Error]:', err?.response?.data || err?.message);
        await ctx.reply(`Gagal membuat grafik untuk ${symbol}.`);
        if (reply) await ctx.reply(reply);
      }
    } else {
      await ctx.reply(reply);
    }
  } catch (error) {
    console.error('[Telegram Error]:', error);
    await ctx.reply('Sistem sedang sibuk. Silakan coba kembali.');
  }
});