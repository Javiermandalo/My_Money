const bcrypt = require('bcryptjs');
const { db } = require('./firebase');
const db2 = require('./db-firebase');
require('dotenv').config();

const token = (process.env.TELEGRAM_TOKEN || '').trim().replace(/^["']|["']$/g, '').trim();

if (!token) {
  console.error('Falta TELEGRAM_TOKEN en .env');
  process.exit(1);
}

const API = 'https://api.telegram.org/bot' + token;

async function api(metodo, params) {
  const res = await fetch(API + '/' + metodo, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params || {}),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(metodo + ': ' + json.description);
  return json.result;
}

const enviar = (chatId, text) =>
  api('sendMessage', { chat_id: chatId, text, disable_web_page_preview: true });

async function obtenerActualizaciones(offset) {
  const r = await api('getUpdates', {
    offset,
    timeout: 25,
    allowed_updates: ['message'],
  });
  return r;
}

const CATEGORIAS = {
  comida: ['cafe', 'café', 'comida', 'almuerzo', 'taco', 'desayuno', 'cena', 'restaurante', 'taquería', 'taqueria', 'pizza', 'hamburguesa'],
  transporte: ['uber', 'metro', 'bus', 'taxi', 'transporte', 'gasolina', 'combustible', 'didi', 'tren'],
  salidas: ['bar', 'cerveza', 'cine', 'fiesta', 'salida', 'concierto', 'antorcha'],
  equipo: ['laptop', 'monitor', 'teclado', 'mouse', 'libro', 'hardware', 'equipo', 'celular'],
  suscripciones: ['netflix', 'spotify', 'amazon', 'hetzner', 'suscripcion', 'suscripción', 'disney', 'youtube', 'copilot', 'icloud'],
};

const NOMBRES = {
  comida: 'Comida',
  transporte: 'Transporte',
  salidas: 'Salidas',
  equipo: 'Equipo',
  suscripciones: 'Suscripciones',
};

function inferirCategoria(concepto) {
  const c = concepto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const [clave, palabras] of Object.entries(CATEGORIAS)) {
    if (palabras.some((p) => c.includes(p.normalize('NFD').replace(/[\u0300-\u036f]/g, '')))) {
      return NOMBRES[clave];
    }
  }
  return null;
}

function parsearMensaje(text) {
  const mensaje = text.trim();
  const match = mensaje.match(/^(.+?)\s+\$?([\d]+(?:[.,]\d{1,2})?)\s*$/);
  if (!match) return null;

  const concepto = match[1].trim();
  const monto = parseFloat(match[2].replace(',', '.'));
  if (!concepto || isNaN(monto) || monto <= 0) return null;

  return { concepto, monto };
}

async function obtenerVinculo(chatId) {
  const snap = await db.collection('vinculos').where('chatId', '==', chatId).limit(1).get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, ...doc.data() };
}

async function obtenerResumen(userId) {
  const ahora = new Date();
  const resumen = await db2.getResumen(userId, { mes: ahora.getMonth() + 1, anio: ahora.getFullYear() });
  return resumen;
}

const AYUDA = [
  'My Money',
  '',
  'Comandos:',
  '/start - ver esta ayuda',
  '/vincular <usuario> <contrasena> - conectar tu cuenta',
  '/balance - ver resumen',
  '/transacciones - ultimos 10 movimientos',
  '/desvincular - desconectar',
  '',
  'Registrar gasto (friccion cero):',
  'Cafe 2.50',
  'Uber 180',
  'Netflix 149',
  '',
  'Registrar ingreso:',
  '/ingreso Quincena 12000',
  '',
  'Borrar ultimo gasto:',
  '/deshacer',
].join('\n');

async function manejarMensaje(msg) {
  const chatId = msg.chat.id;
  const text = msg.text;
  if (!text) return;

  const limpio = text.trim();
  const usuarioTelegram = msg.from.username || null;
  const nombreTelegram = msg.from.first_name || 'sin nombre';

  try {
    if (limpio.startsWith('/start')) {
      const vinculo = await obtenerVinculo(chatId);
      if (vinculo) {
        const r = await obtenerResumen(vinculo.userId);
        await enviar(
          chatId,
          `Conectado como *${vinculo.username}*\n\nBalance: $${r.balance.toFixed(2)}\nGastos: $${r.gastos.toFixed(2)}\nRestante: $${r.restante.toFixed(2)}\n\n${AYUDA}`
        );
      } else {
        await enviar(chatId, AYUDA);
      }
      return;
    }

    if (limpio.startsWith('/vincular')) {
      const partes = limpio.split(/\s+/);
      const username = partes[1];
      const password = partes[2];

      if (!username || !password) {
        await enviar(chatId, 'Uso: /vincular <usuario> <contrasena>');
        return;
      }

      const snap = await db.collection('users').where('username', '==', username).limit(1).get();
      if (snap.empty) {
        await enviar(chatId, 'Usuario no encontrado.');
        return;
      }

      const user = snap.docs[0];
      const ok = await bcrypt.compare(password, user.data().passwordHash);
      if (!ok) {
        await enviar(chatId, 'Contrasena incorrecta.');
        return;
      }

      const existente = await obtenerVinculo(chatId);
      if (existente) {
        await db.collection('vinculos').doc(existente.id).update({
          userId: user.id,
          username: user.data().username,
        });
      } else {
        await db.collection('vinculos').add({
          chatId,
          userId: user.id,
          username: user.data().username,
          telegramUsername: usuarioTelegram,
          telegramName: nombreTelegram,
          createdAt: new Date(),
        });
      }

      const r = await obtenerResumen(user.id);
      await enviar(
        chatId,
        `Conectado como *${user.data().username}*\n\nBalance: $${r.balance.toFixed(2)}\nGastos: $${r.gastos.toFixed(2)}\nPresupuesto restante: $${r.restante.toFixed(2)}\n\nYa puedes registrar gastos enviando solo el mensaje.`
      );
      return;
    }

    if (limpio.startsWith('/desvincular')) {
      const vinculo = await obtenerVinculo(chatId);
      if (!vinculo) {
        await enviar(chatId, 'No hay ninguna cuenta vinculada.');
        return;
      }
      await db.collection('vinculos').doc(vinculo.id).delete();
      await enviar(chatId, 'Cuenta desconectada.');
      return;
    }

    const vinculo = await obtenerVinculo(chatId);

    if (limpio.startsWith('/balance')) {
      if (!vinculo) return enviar(chatId, 'Primero usa /vincular <usuario> <contrasena>');
      const r = await obtenerResumen(vinculo.userId);
      const linea = r.limite > 0 ? `Presupuesto: $${r.limite.toFixed(2)}` : 'Presupuesto: sin definir';
      return enviar(
        chatId,
        [
          `Resumen de *${vinculo.username}*`,
          '',
          `Ingresos: $${r.ingresos.toFixed(2)}`,
          `Gastos: $${r.gastos.toFixed(2)}`,
          `Balance: $${r.balance.toFixed(2)}`,
          linea,
          `Restante: $${r.restante.toFixed(2)}`,
        ].join('\n')
      );
    }

    if (limpio.startsWith('/transacciones')) {
      if (!vinculo) return enviar(chatId, 'Primero usa /vincular <usuario> <contrasena>');
      const lista = (await db2.getTransactions(vinculo.userId)).slice(0, 10);

      if (!lista.length) return enviar(chatId, 'Sin movimientos todavia.');

      const lineas = lista.map((t) => {
        const signo = t.type === 'income' ? '+' : '-';
        const cat = t.category_name ? ' (' + t.category_name + ')' : '';
        return `${t.date}  ${signo}$${t.amount.toFixed(2)}  ${t.concept}${cat}`;
      });
      return enviar(chatId, ['Ultimos movimientos:', '', ...lineas].join('\n'));
    }

    if (limpio.startsWith('/deshacer')) {
      if (!vinculo) return enviar(chatId, 'Primero usa /vincular <usuario> <contrasena>');
      const ref = db.collection('users').doc(vinculo.userId).collection('transactions');
      const snap = await ref.get();
      if (snap.empty) return enviar(chatId, 'No hay nada que borrar.');

      const docs = snap.docs
        .map((d) => ({ doc: d, data: d.data() }))
        .sort((a, b) => String(b.data.date).localeCompare(String(a.data.date)));
      const ultimo = docs[0];

      await db2.deleteTransaction(vinculo.userId, ultimo.doc.id);
      return enviar(
        chatId,
        `Borrado: *${ultimo.data.concept}* $${Number(ultimo.data.amount).toFixed(2)}`
      );
    }

    if (limpio.startsWith('/ingreso')) {
      if (!vinculo) return enviar(chatId, 'Primero usa /vincular <usuario> <contrasena>');
      const resto = limpio.replace(/^\/ingreso\s+/, '');
      const datos = parsearMensaje(resto);
      if (!datos) return enviar(chatId, 'Uso: /ingreso <concepto> <monto>\nEjemplo: /ingreso Quincena 12000');

      await db2.addTransaction(
        vinculo.userId,
        datos.concepto,
        datos.monto,
        'income',
        null,
        new Date().toISOString().slice(0, 10)
      );

      const r = await obtenerResumen(vinculo.userId);
      return enviar(
        chatId,
        `Ingreso registrado: *${datos.concepto}* $${datos.monto.toFixed(2)}\n\nNuevo balance: $${r.balance.toFixed(2)}`
      );
    }

    if (!vinculo) {
      return enviar(chatId, 'Primero usa /vincular <usuario> <contrasena>');
    }

    const datos = parsearMensaje(limpio);
    if (!datos) {
      return enviar(
        chatId,
        'No pude entender el mensaje.\n\nFormato: `Concepto Monto`\nEjemplos:\n`Cafe 2.50`\n`Uber 180`\n\nUsa /start para ver todos los comandos.'
      );
    }

    const cats = await db2.getCategories(vinculo.userId);
    const gastos = cats.filter((c) => c.type === 'expense');

    let nombreCat = inferirCategoria(datos.concepto);
    if (!nombreCat || !gastos.some((c) => c.name === nombreCat)) {
      const otros = gastos.find((c) => c.name === 'Otros');
      nombreCat = otros ? otros.name : gastos.length ? gastos[0].name : 'Otros';
    }

    const cat = gastos.find((c) => c.name === nombreCat) || (await db2.addCategory(vinculo.userId, nombreCat, 'expense'));

    await db2.addTransaction(
      vinculo.userId,
      datos.concepto,
      datos.monto,
      'expense',
      cat.id,
      new Date().toISOString().slice(0, 10)
    );

    const r = await obtenerResumen(vinculo.userId);
    const restante = r.limite > 0 ? `\nPresupuesto restante: $${r.restante.toFixed(2)}` : '';
    return enviar(
      chatId,
      `Gasto registrado: *${datos.concepto}* -$${datos.monto.toFixed(2)}\nCategoria: ${nombreCat}\n\nBalance: $${r.balance.toFixed(2)}${restante}`
    );
  } catch (error) {
    console.error('Error procesando mensaje:', error);
    await enviar(chatId, 'Ocurrio un error. Intenta de nuevo.');
  }
}

async function main() {
  const yo = await api('getMe', {});
  console.log('Bot de Telegram activo: @' + yo.username);

  let offset = 0;
  while (true) {
    try {
      const updates = await obtenerActualizaciones(offset);
      for (const u of updates) {
        offset = u.update_id + 1;
        if (u.message && u.message.text) {
          await manejarMensaje(u.message);
        }
      }
    } catch (error) {
      console.error('Error de polling:', error.message);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

module.exports = { start: main };


