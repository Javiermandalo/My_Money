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

app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password || password.length < 4) {
      return res.status(400).json({ error: 'Usuario y contraseña (mín 4) requeridos' });
    }
    const existing = await db.getUserByUsername(username);
    if (existing) return res.status(400).json({ error: 'Usuario ya existe' });
    const hash = await bcrypt.hash(password, 10);
    const user = await db.createUser(username, hash);
    req.session.userId = user.id;
    req.session.username = user.username;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Error al registrar' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await db.getUserByUsername(username);
    if (!user) return res.status(400).json({ error: 'Credenciales inválidas' });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(400).json({ error: 'Credenciales inválidas' });
    req.session.userId = user.id;
    req.session.username = user.username;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Error al iniciar sesión' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ userId: req.session.userId, username: req.session.username });
});

app.get('/api/settings', requireAuth, async (req, res) => {
  const s = await db.getSettings(req.session.userId);
  res.json(s);
});

app.put('/api/settings', requireAuth, async (req, res) => {
  await db.setSettings(req.session.userId, req.body);
  res.json({ success: true });
});

app.get('/api/categories', requireAuth, async (req, res) => {
  const c = await db.getCategories(req.session.userId);
  res.json(c);
});

app.post('/api/categories', requireAuth, async (req, res) => {
  const c = await db.addCategory(req.session.userId, req.body.name, req.body.type);
  res.json(c);
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
  const t = await db.getTransactions(req.session.userId);
  res.json(t);
});

app.post('/api/transactions', requireAuth, async (req, res) => {
  const t = await db.addTransaction(req.session.userId, req.body.concept, req.body.amount, req.body.type, req.body.category_id, req.body.date);
  res.json(t);
});

app.delete('/api/transactions/:id', requireAuth, async (req, res) => {
  await db.deleteTransaction(req.session.userId, req.params.id);
  res.json({ success: true });
});

app.get('/api/summary', requireAuth, async (req, res) => {
  const settings = await db.getSettings(req.session.userId);
  const tx = await db.getTransactions(req.session.userId);
  let ingresos = 0, gastos = 0;
  tx.forEach((t) => {
    if (t.type === 'income') ingresos += Number(t.amount || 0);
    else gastos += Number(t.amount || 0);
  });
  const limite = settings.monthly_budget || 0;
  const balance = ingresos - gastos;
  const restante = limite > 0 ? Math.max(limite - gastos, 0) : balance;
  const porcentaje = limite > 0 ? Math.min((gastos / limite) * 100, 100) : 0;
  res.json({ ingresos, gastos, balance, restante, limite, porcentaje: Number(porcentaje.toFixed(2)) });
});

app.post('/api/reset', requireAuth, async (req, res) => {
  await db.resetUser(req.session.userId);
  res.json({ success: true });
});

app.get('/app', (req, res) => res.sendFile(path.join(__dirname, '../public', 'app.html')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '../public', 'index.html')));

app.listen(PORT, () => console.log('🚀 MyMoney corriendo en http://localhost:' + PORT));
