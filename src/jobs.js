const cron = require('node-cron');
const notionService = require('./notionService');
const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

const token = process.env.TELEGRAM_TOKEN;
const bot = token && token !== 'telegram_token_placeholder' ? new TelegramBot(token) : null;

// CHAT_ID por defecto (debe configurarse en .env si se quiere notificar)
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || null;

async function verificarSuscripciones() {
  try {
    const suscripciones = await notionService.obtenerSuscripciones();
    const hoy = new Date().toISOString().split('T')[0];

    for (const s of suscripciones) {
      if (!s.cobro || !s.estado) continue;
      if (s.cobro === hoy && bot && CHAT_ID) {
        bot.sendMessage(
          CHAT_ID,
          `💳 Hoy se cobra tu suscripción de *${s.servicio}*: $${s.costo.toFixed(2)}`,
          { parse_mode: 'Markdown' }
        );
      }
    }
  } catch (error) {
    console.error('Error en cron jobs:', error);
  }
}

cron.schedule('0 8 * * *', verificarSuscripciones, {
  timezone: 'America/Mexico_City',
});

console.log('⏰ Cron jobs programados (8:00 AM)');
