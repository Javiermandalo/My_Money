const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const db = require('./db-firebase');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

app.use(
  session({
    secret: 'mymoney_secret_2026',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 },
  })
);

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'No autorizado' });
  next();
}

function iniciarBot() {
  if (process.env.BOT_DESHABILITADO === '1') return;
  require('./bot')
    .start()
    .catch((error) => console.error('El bot de Telegram no pudo iniciar:', error.message));
}

app.post('/api/auth/register', async (req, res) => {
  try {
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');

    if (username.length < 3) return res.status(400).json({ error: 'El usuario necesita al menos 3 caracteres' });
    if (password.length < 4) return res.status(400).json({ error: 'La contraseña necesita al menos 4 caracteres' });

    const existente = await db.getUserByUsername(username);
    if (existente) return res.status(400).json({ error: 'Ese usuario ya existe' });

    const hash = await bcrypt.hash(password, 10);
    const user = await db.createUser(username, hash);
    req.session.userId = user.id;
    req.session.username = user.username;
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo crear la cuenta' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');

    const user = await db.getUserByUsername(username);
    if (!user) return res.status(400).json({ error: 'Credenciales inválidas' });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(400).json({ error: 'Credenciales inválidas' });

    req.session.userId = user.id;
    req.session.username = user.username;
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo iniciar sesión' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ userId: req.session.userId, username: req.session.username });
});

app.get('/api/settings', requireAuth, async (req, res) => {
  res.json(await db.getSettings(req.session.userId));
});

app.put('/api/settings', requireAuth, async (req, res) => {
  await db.setSettings(req.session.userId, req.body);
  res.json({ success: true });
});

app.get('/api/categories', requireAuth, async (req, res) => {
  res.json(await db.getCategories(req.session.userId));
});

app.post('/api/categories', requireAuth, async (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Falta el nombre de la categoría' });
  res.json(await db.addCategory(req.session.userId, name, req.body.type));
});

app.put('/api/categories/:id', requireAuth, async (req, res) => {
  await db.updateCategory(req.session.userId, req.params.id, req.body.name, req.body.type, req.body.active);
  res.json({ success: true });
});

app.delete('/api/categories/:id', requireAuth, async (req, res) => {
  await db.deleteCategory(req.session.userId, req.params.id);
  res.json({ success: true });
});

app.get('/api/transactions', requireAuth, async (req, res) => {
  const filtro = {};
  if (req.query.m) filtro.mes = Number(req.query.m);
  if (req.query.anio) filtro.anio = Number(req.query.anio);
  if (req.query.tipo) filtro.tipo = req.query.tipo;
  if (req.query.categoria) filtro.categoria = req.query.categoria;

  res.json(await db.getTransactions(req.session.userId, filtro));
});

app.post('/api/transactions', requireAuth, async (req, res) => {
  const concepto = String(req.body.concept || '').trim();
  const amount = Number(req.body.amount);

  if (!concepto) return res.status(400).json({ error: 'Falta el concepto' });
  if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'El monto debe ser mayor que cero' });

  const fecha = req.body.date || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return res.status(400).json({ error: 'Fecha inválida' });

  res.json(await db.addTransaction(req.session.userId, concepto, amount, req.body.type, req.body.category_id, fecha));
});

app.put('/api/transactions/:id', requireAuth, async (req, res) => {
  const campos = {};
  if (req.body.concept !== undefined) campos.concept = req.body.concept;
  if (req.body.amount !== undefined) {
    const amount = Number(req.body.amount);
    if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'El monto debe ser mayor que cero' });
    campos.amount = amount;
  }
  if (req.body.type !== undefined) campos.type = req.body.type;
  if (req.body.category_id !== undefined) campos.category_id = req.body.category_id;
  if (req.body.date !== undefined) campos.date = req.body.date;

  await db.updateTransaction(req.session.userId, req.params.id, campos);
  res.json({ success: true });
});

app.delete('/api/transactions/:id', requireAuth, async (req, res) => {
  await db.deleteTransaction(req.session.userId, req.params.id);
  res.json({ success: true });
});

app.get('/api/summary', requireAuth, async (req, res) => {
  const filtro = {};
  if (req.query.m) filtro.mes = Number(req.query.m);
  if (req.query.anio) filtro.anio = Number(req.query.anio);
  res.json(await db.getResumen(req.session.userId, filtro));
});

app.post('/api/reset', requireAuth, async (req, res) => {
  await db.resetUser(req.session.userId);
  res.json({ success: true });
});

app.get('/app', (req, res) => res.sendFile(path.join(__dirname, '../public', 'app.html')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '../public', 'index.html')));

app.listen(PORT, () => {
  console.log('My Money web en http://localhost:' + PORT);
  iniciarBot();
});
