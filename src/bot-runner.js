const bot = require('./bot');

bot.start().catch((error) => {
  console.error('No se pudo iniciar el bot de Telegram:', error.message);
});
