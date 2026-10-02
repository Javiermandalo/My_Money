const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const db = require('./db-simple');

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
  const { username, password } = req.body;
  if (!username || !password || password.length < 4) return res.status(400).json({ error: 'Usuario y contraseña (mín 4) requeridos' });
  try {
    const hash = await bcrypt.hash(password, 10);
    const user = db.createUser(username.trim(), hash);
    req.session.userId = user.id;
    req.session.username = user.username;
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: 'Usuario ya existe' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  const user = db.getUserByUsername(username);
  if (!user) return res.status(400).json({ error: 'Credenciales inválidas' });
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(400).json({ error: 'Credenciales inválidas' });
  req.session.userId = user.id;
  req.session.username = user.username;
  res.json({ success: true });
});

app.post('/api/auth/logout', (req, res) => req.session.destroy(() => res.json({ success: true })));
app.get('/api/auth/me', requireAuth, (req, res) => res.json({ userId: req.session.userId, username: req.session.username }));

app.get('/api/settings', requireAuth, (req, res) => res.json(db.getSettings(req.session.userId)));
app.put('/api/settings', requireAuth, (req, res) => { db.setSettings(req.session.userId, req.body); res.json({ success: true }); });

app.get('/api/categories', requireAuth, (req, res) => res.json(db.getCategories(req.session.userId)));
app.post('/api/categories', requireAuth, (req, res) => { const c = db.addCategory(req.session.userId, req.body.name, req.body.type); res.json(c); });
app.put('/api/categories/:id', requireAuth, (req, res) => { db.updateCategory(req.session.userId, req.params.id, req.body.name, req.body.type, req.body.active); res.json({ success: true }); });
app.delete('/api/categories/:id', requireAuth, (req, res) => { db.deleteCategory(req.session.userId, req.params.id); res.json({ success: true }); });

app.get('/api/transactions', requireAuth, (req, res) => res.json(db.getTransactions(req.session.userId)));
app.post('/api/transactions', requireAuth, (req, res) => { const t = db.addTransaction(req.session.userId, req.body.concept, req.body.amount, req.body.type, req.body.category_id, req.body.date); res.json(t); });
app.delete('/api/transactions/:id', requireAuth, (req, res) => { db.deleteTransaction(req.session.userId, req.params.id); res.json({ success: true }); });

app.get('/api/summary', requireAuth, (req, res) => {
  const settings = db.getSettings(req.session.userId);
  const tx = db.getTransactions(req.session.userId);
  let ingresos = 0, gastos = 0;
  tx.forEach(t => { if (t.type === 'income') ingresos += t.amount; else gastos += t.amount; });
  const limite = settings.monthly_budget || 0;
  const balance = ingresos - gastos;
  const restante = limite > 0 ? Math.max(limite - gastos, 0) : balance;
  const porcentaje = limite > 0 ? Math.min((gastos / limite) * 100, 100) : 0;
  res.json({ ingresos, gastos, balance, restante, limite, porcentaje: Number(porcentaje.toFixed(2)) });
});

app.post('/api/reset', requireAuth, (req, res) => { db.resetUser(req.session.userId); res.json({ success: true }); });
app.get('/app', (req, res) => res.sendFile(path.join(__dirname, '../public', 'app.html')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '../public', 'index.html')));

app.listen(PORT, () => console.log('🚀 MyMoney corriendo en http://localhost:' + PORT));
