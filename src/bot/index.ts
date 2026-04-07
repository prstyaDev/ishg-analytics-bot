import { Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
import { env } from '../config/env';
import { processQuery } from '../agent/hermes';

export const bot = new Telegraf(env.TELEGRAM_BOT_TOKEN);

bot.on(message('text'), async (ctx) => {
  console.log(`[Pesan Masuk] dari ${ctx.from.first_name}: ${ctx.message.text}`);
  try {
    await ctx.sendChatAction('typing');
    const reply = await processQuery(ctx.message.text, ctx.chat.id.toString());
    console.log('[AI Final Output]:', reply);
    if (!reply || reply.trim() === '') {
      await ctx.reply('AI berhasil menarik data pasar, tetapi gagal merangkumnya menjadi teks.');
    } else {
      await ctx.reply(reply);
    }
  } catch (error) {
    console.error('[Telegram Error]:', error);
    await ctx.reply('Sistem sedang sibuk. Silakan coba kembali.');
  }
});