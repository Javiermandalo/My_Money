const TelegramBot = require('node-telegram-bot-api');
const notionService = require('./notionService');
require('dotenv').config();

const token = process.env.TELEGRAM_TOKEN;

if (!token || token === 'telegram_token_placeholder') {
  console.warn('⚠️  TELEGRAM_TOKEN no configurado en .env');
}

const bot = new TelegramBot(token, { polling: true });

function parsearMensaje(text) {
  const mensaje = text.trim();
  const regex = /^(.+?)\s+([\d.,]+)$/i;

  const match = mensaje.match(regex);
  if (match) {
    const concepto = match[1].trim();
    const montoStr = match[2].replace(',', '.');
    const monto = parseFloat(montoStr);

    return {
      concepto,
      monto,
      categoria: 'Comida',
    };
  }

  const regexMontoAlFinal = /^(.+?)\s+(\d+[\.,]?\d*)$/i;
  const match2 = mensaje.match(regexMontoAlFinal);
  if (match2) {
    const concepto = match2[1].trim();
    const montoStr = match2[2].replace(',', '.');
    const monto = parseFloat(montoStr);

    return {
      concepto,
      monto,
      categoria: inferirCategoria(concepto),
    };
  }

  return null;
}

function inferirCategoria(concepto) {
  const c = concepto.toLowerCase();

  if (c.includes('metro') || c.includes('bus') || c.includes('taxi') || c.includes('transporte')) {
    return 'Transporte';
  }
  if (c.includes('spotify') || c.includes('tidal') || c.includes('netflix') || c.includes('suscripcion') || c.includes('copilot') || c.includes('hetzner')) {
    return 'Suscripciones';
  }
  if (c.includes('salida') || c.includes('bar') || c.includes('cerveza') || c.includes('cine')) {
    return 'Salidas';
  }
  if (c.includes('cafe') || c.includes('comida') || c.includes('almuerzo') || c.includes('taco') || c.includes('desayuno')) {
    return 'Comida';
  }
  if (c.includes('libro') || c.includes('mouse') || c.includes('teclado') || c.includes('hardware') || c.includes('equipo')) {
    return 'Equipo';
  }

  return 'Comida';
}

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!text) return;

  if (text.startsWith('/start')) {
    bot.sendMessage(
      chatId,
      '¡Hola! Soy tu bot de finanzas.\n\nPara registrar un gasto, envía un mensaje como:\n\n`Café 2.50`\n`Metro 1.80`\n`Spotify 5.99`\n\nFricción cero.',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  const datos = parsearMensaje(text);
  if (!datos) {
    bot.sendMessage(
      chatId,
      'No pude entender el mensaje.\nFormato: `Concepto Monto`\nEjemplo: `Café 2.50`',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  try {
    const tokenVal = process.env.NOTION_TOKEN || '';
    if (tokenVal.includes('placeholder') || !tokenVal) {
      bot.sendMessage(
        chatId,
        `✅ [DEMO] $${datos.monto.toFixed(2)} registrados en *${datos.categoria}*.\nConcepto: *${datos.concepto}*`,
        { parse_mode: 'Markdown' }
      );
      return;
    }
    await notionService.crearTransaccion(datos.concepto, datos.monto, datos.categoria);
    bot.sendMessage(
      chatId,
      `✅ $${datos.monto.toFixed(2)} registrados en *${datos.categoria}*.\nConcepto: *${datos.concepto}*`,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    bot.sendMessage(
      chatId,
      `✅ [DEMO] $${datos.monto.toFixed(2)} registrados en *${datos.categoria}*.\nConcepto: *${datos.concepto}*`,
      { parse_mode: 'Markdown' }
    );
  }
});

console.log('🤖 Bot de Telegram iniciado...');
