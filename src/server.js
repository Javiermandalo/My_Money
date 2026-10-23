const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const db = require('./db-firebase');
const emailSvc = require('./email');
console.log('email module loaded:', Object.keys(emailSvc));

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
    cookie: { maxAge: 30 * 24 * 60 * 60 * 1000, httpOnly: true, sameSite: 'lax' },
  })
);

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'No autorizado' });
  next();
}

async function iniciarBot() {
  if (process.env.BOT_DESHABILITADO === '1') return;
  try {
    await db.deleteTestUsers();
    console.log('Usuarios de prueba eliminados');
  } catch (e) {
    console.warn('No se pudieron limpiar usuarios de prueba:', e.message);
  }
  try {
    require('./bot').start().catch((error) => console.error('Bot no pudo iniciar:', error.message));
  } catch (e) {
    console.warn('Bot no disponible:', e.message);
  }
}

function validarRegistro(body) {
  const { username, email, password, phone } = body;
  const errores = [];
  
  if (!db.validarUsername(username)) errores.push('Usuario: 3+ chars, solo letras, números y _');
  if (!email || !db.validarEmail(email)) errores.push('Email inválido');
  if (!db.validarPassword(password)) errores.push('Contraseña: 8+ chars, 1 mayúscula, 1 minúscula, 1 número, 1 símbolo');
  if (phone && !db.validarTelefono(phone)) errores.push('Teléfono: formato E.164 (+52XXXXXXXXXX)');
  
  return errores;
}

app.post('/api/auth/register', async (req, res) => {
  try {
    const errores = validarRegistro(req.body);
    if (errores.length) return res.status(400).json({ error: errores.join('; ') });

    const { username, email, password, phone } = req.body;
    
    const existeUser = await db.getUserByUsername(username);
    if (existeUser) return res.status(400).json({ error: 'Ese usuario ya existe' });
    
    const existeEmail = await db.getUserByEmail(email);
    if (existeEmail) return res.status(400).json({ error: 'Ese email ya está registrado' });
    
    if (req.body.phone) {
      const existePhone = await db.getUserByPhone(req.body.phone);
      if (existePhone) return res.status(400).json({ error: 'Ese teléfono ya está registrado' });
    }

    const hash = await bcrypt.hash(password, 10);
    const user = await db.createUser(username, email, hash, phone);
    
    const codigo = emailSvc.generarCodigo6();
    const expira = new Date(Date.now() + 15 * 60 * 1000);
    await db.setResetToken(user.id, codigo, expira);
    
    await emailSvc.enviarVerificacion(user.email, user.username, codigo);
    
    req.session.pendingVerification = { userId: user.id, email: user.email, username: user.username };
    
    res.json({ success: true, needsVerification: true });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'No se pudo crear la cuenta' });
  }
});

app.post('/api/auth/verify', async (req, res) => {
  try {
    const { code } = req.body;
    const pending = req.session.pendingVerification;
    
    if (!pending || !code) return res.status(400).json({ error: 'Código requerido' });
    
    const user = await db.getUserByResetToken(code);
    if (!user || user.id !== pending.userId) {
      return res.status(400).json({ error: 'Código inválido o expirado' });
    }
    
    await db.setEmailVerified(user.id, true);
    await db.clearResetToken(user.id);
    
    req.session.userId = user.id;
    req.session.username = user.username;
    delete req.session.pendingVerification;
    
    res.json({ success: true, verified: true });
  } catch (err) {
    console.error('Verify error:', err);
    res.status(500).json({ error: 'Error al verificar' });
  }
});

app.post('/api/auth/resend-verification', async (req, res) => {
  try {
    const pending = req.session.pendingVerification;
    if (!pending) return res.status(400).json({ error: 'No hay registro pendiente' });
    
    const codigo = emailSvc.generarCodigo6();
    const expira = new Date(Date.now() + 15 * 60 * 1000);
    await db.setResetToken(pending.userId, codigo, expira);
    await emailSvc.enviarVerificacion(pending.email, pending.username, codigo);
    
    res.json({ success: true });
  } catch (err) {
    console.error('Resend error:', err);
    res.status(500).json({ error: 'Error al reenviar' });
  }
});

app.post('/api/auth/identify', async (req, res) => {
  try {
    const { email, phone } = req.body;
    const identifier = email || phone;
    
    if (!identifier) return res.status(400).json({ error: 'Email o teléfono requerido' });
    
    const user = await db.getUserByEmailOrPhone(identifier);
    
    if (!user) {
      return res.json({ exists: false });
    }
    
    res.json({
      exists: true,
      username: user.username,
      displayName: user.username,
      hasEmail: !!user.email,
      hasPhone: !!user.phone,
    });
  } catch (err) {
    console.error('Identify error:', err);
    res.status(500).json({ error: 'Error al identificar' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, email, phone, password } = req.body;
    
    if (!password) return res.status(400).json({ error: 'Contraseña requerida' });
    
    let user = null;
    
    if (username) {
      user = await db.getUserByUsername(username);
    } else if (email) {
      user = await db.getUserByEmail(email);
    } else if (phone) {
      user = await db.getUserByPhone(phone);
    } else {
      return res.status(400).json({ error: 'Usuario, email o teléfono requerido' });
    }
    
    if (!user) return res.status(400).json({ error: 'Credenciales inválidas' });
    
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(400).json({ error: 'Credenciales inválidas' });
    
    req.session.userId = user.id;
    req.session.username = user.username;
    
    res.json({ success: true });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Error al iniciar sesión' });
  }
});

app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email, phone } = req.body;
    const identifier = email || phone;
    
    if (!identifier) return res.status(400).json({ error: 'Email o teléfono requerido' });
    
    const user = await db.getUserByEmailOrPhone(identifier);
    
    if (!user) {
      return res.json({ success: true });
    }
    
    const codigo = emailSvc.generarCodigo6();
    const expira = new Date(Date.now() + 15 * 60 * 1000);
    await db.setResetToken(user.id, codigo, expira);
    
    if (email && user.email) {
      await emailSvc.enviarResetPassword(user.email, user.username, codigo);
    } else if (phone && user.phone) {
      console.log('📱 SMS MOCK - Código reset para', user.phone, ':', codigo);
    }
    
    res.json({ success: true });
  } catch (err) {
    console.error('Forgot error:', err);
    res.status(500).json({ error: 'Error al solicitar reset' });
  }
});

app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    
    if (!token || !password) return res.status(400).json({ error: 'Token y nueva contraseña requeridos' });
    if (!db.validarPassword(password)) {
      return res.status(400).json({ error: 'Contraseña: 8+ chars, 1 mayúscula, 1 minúscula, 1 número, 1 símbolo' });
    }
    
    const user = await db.getUserByResetToken(token);
    if (!user) return res.status(400).json({ error: 'Token inválido o expirado' });
    
    const hash = await bcrypt.hash(password, 10);
    await db.updatePassword(user.id, hash);
    
    res.json({ success: true });
  } catch (err) {
    console.error('Reset error:', err);
    res.status(500).json({ error: 'Error al restablecer' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

app.get('/api/auth/me', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'No autorizado' });
  res.json({ userId: req.session.userId, username: req.session.username });
});

app.get('/api/settings', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'No autorizado' });
  res.json(await db.getSettings(req.session.userId));
});

app.put('/api/settings', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'No autorizado' });
  await db.setSettings(req.session.userId, req.body);
  res.json({ success: true });
});

app.get('/api/categories', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'No autorizado' });
  res.json(await db.getCategories(req.session.userId));
});

app.post('/api/categories', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'No autorizado' });
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Falta el nombre' });
  res.json(await db.addCategory(req.session.userId, name, req.body.type));
});

app.put('/api/categories/:id', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'No autorizado' });
  await db.updateCategory(req.session.userId, req.params.id, req.body.name, req.body.type, req.body.active);
  res.json({ success: true });
});

app.delete('/api/categories/:id', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'No autorizado' });
  await db.deleteCategory(req.session.userId, req.params.id);
  res.json({ success: true });
});

app.get('/api/transactions', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'No autorizado' });
  const filtro = {};
  if (req.query.m) filtro.mes = Number(req.query.m);
  if (req.query.anio) filtro.anio = Number(req.query.anio);
  if (req.query.tipo) filtro.tipo = req.query.tipo;
  if (req.query.categoria) filtro.categoria = req.query.categoria;
  res.json(await db.getTransactions(req.session.userId, filtro));
});

app.post('/api/transactions', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'No autorizado' });
  const concepto = String(req.body.concept || '').trim();
  const amount = Number(req.body.amount);
  if (!concepto) return res.status(400).json({ error: 'Falta el concepto' });
  if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'Monto debe ser mayor que cero' });
  const fecha = req.body.date || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return res.status(400).json({ error: 'Fecha inválida' });
  res.json(await db.addTransaction(req.session.userId, concepto, amount, req.body.type, req.body.category_id, fecha));
});

app.put('/api/transactions/:id', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'No autorizado' });
  const campos = {};
  if (req.body.concept !== undefined) campos.concept = req.body.concept;
  if (req.body.amount !== undefined) {
    const amount = Number(req.body.amount);
    if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'Monto inválido' });
    campos.amount = amount;
  }
  if (req.body.type !== undefined) campos.type = req.body.type;
  if (req.body.category_id !== undefined) campos.category_id = req.body.category_id;
  if (req.body.date !== undefined) campos.date = req.body.date;
  await db.updateTransaction(req.session.userId, req.params.id, campos);
  res.json({ success: true });
});

app.delete('/api/transactions/:id', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'No autorizado' });
  await db.deleteTransaction(req.session.userId, req.params.id);
  res.json({ success: true });
});

app.get('/api/summary', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'No autorizado' });
  const filtro = {};
  if (req.query.m) filtro.mes = Number(req.query.m);
  if (req.query.anio) filtro.anio = Number(req.query.anio);
  res.json(await db.getResumen(req.session.userId, filtro));
});

app.post('/api/reset', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'No autorizado' });
  await db.resetUser(req.session.userId);
  res.json({ success: true });
});

app.get('/app', (req, res) => res.sendFile(path.join(__dirname, '../public', 'app.html')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '../public', 'index.html')));

app.listen(PORT, () => {
  console.log('My Money web en http://localhost:' + PORT);
  iniciarBot();
});

module.exports = app;