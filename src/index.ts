import express from 'express';
import { bot } from './bot';
import { env } from './config/env';
import { initDatabase } from './db';

const app = express();
app.use(express.json());

async function main() {
  // Inisialisasi database sebelum bot aktif
  await initDatabase();
  console.log('[System] Database terhubung dan siap digunakan.');

  if (env.NODE_ENV === 'production') {
    const path = `/webhook/${bot.secretPathComponent()}`;
    app.use(bot.webhookCallback(path));

    app.listen(env.PORT, () => {
      console.log(`Server aktif pada port ${env.PORT}`);
    });
  } else {
    await bot.launch();
    console.log('Sistem aktif dalam mode Polling');
  }
}

main().catch((err) => {
  console.error('Gagal menjalankan aplikasi:', err);
  process.exit(1);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));