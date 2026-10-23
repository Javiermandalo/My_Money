const { db, FieldValue } = require('./firebase');

const CATEGORIAS_INICIALES = [
  { name: 'Comida', type: 'expense' },
  { name: 'Transporte', type: 'expense' },
  { name: 'Salidas', type: 'expense' },
  { name: 'Suscripciones', type: 'expense' },
  { name: 'Otros', type: 'expense' },
  { name: 'Trabajo', type: 'income' },
  { name: 'Otros ingresos', type: 'income' },
];

const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
const PHONE_REGEX = /^\+?[1-9]\d{1,14}$/;
const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,}$/;
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/;

function mesActual() {
  const d = new Date();
  return { anio: d.getFullYear(), mes: d.getMonth() + 1 };
}

function claveMes(anio, mes) {
  return anio + '-' + String(mes).padStart(2, '0');
}

function normalizarTelefono(phone) {
  if (!phone) return null;
  let p = phone.trim().replace(/\s/g, '');
  if (!p.startsWith('+')) p = '+' + p;
  return p;
}

function validarEmail(email) {
  return EMAIL_REGEX.test(email.trim());
}

function validarTelefono(phone) {
  if (!phone) return true;
  return PHONE_REGEX.test(normalizarTelefono(phone));
}

function validarUsername(username) {
  return USERNAME_REGEX.test(username.trim());
}

function validarPassword(password) {
  return PASSWORD_REGEX.test(password);
}

async function getUserByUsername(username) {
  const snap = await db.collection('users').where('username', '==', username.trim()).limit(1).get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, ...doc.data() };
}

async function getUserByEmail(email) {
  const snap = await db.collection('users').where('email', '==', email.trim().toLowerCase()).limit(1).get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, ...doc.data() };
}

async function getUserByPhone(phone) {
  const norm = normalizarTelefono(phone);
  if (!norm) return null;
  const snap = await db.collection('users').where('phone', '==', norm).limit(1).get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, ...doc.data() };
}

async function getUserByEmailOrPhone(identifier) {
  const email = identifier?.trim()?.toLowerCase();
  const phone = normalizarTelefono(identifier);
  
  if (email && validarEmail(email)) {
    const byEmail = await getUserByEmail(email);
    if (byEmail) return byEmail;
  }
  if (phone && validarTelefono(phone)) {
    const byPhone = await getUserByPhone(phone);
    if (byPhone) return byPhone;
  }
  return null;
}

async function getUserByResetToken(token) {
  const snap = await db.collection('users').where('resetToken', '==', token).limit(1).get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  const data = doc.data();
  if (!data.resetTokenExpires || new Date(data.resetTokenExpires) <= new Date()) {
    return null;
  }
  return { id: doc.id, ...data };
}

async function createUser(username, email, passwordHash, phone) {
  const ref = await db.collection('users').add({
    username: username.trim(),
    email: email.trim().toLowerCase(),
    phone: phone ? normalizarTelefono(phone) : null,
    passwordHash,
    emailVerified: false,
    phoneVerified: false,
    createdAt: FieldValue.serverTimestamp(),
  });

  const catsRef = ref.collection('categories');
  const batch = db.batch();

  CATEGORIAS_INICIALES.forEach((c, i) => {
    batch.set(catsRef.doc(), {
      name: c.name,
      type: c.type,
      order: i + 1,
      active: true,
      isDefault: true,
    });
  });

  batch.set(ref.collection('settings').doc('main'), {
    monthly_budget: 0,
    currency: 'MXN',
    theme: 'dark',
  });

  await batch.commit();
  return { id: ref.id, username: username.trim(), email: email.trim().toLowerCase(), phone: phone ? normalizarTelefono(phone) : null };
}

async function setEmailVerified(uid, verified) {
  await db.collection('users').doc(uid).update({ emailVerified: verified });
}

async function setPhoneVerified(uid, verified) {
  await db.collection('users').doc(uid).update({ phoneVerified: verified });
}

async function setResetToken(uid, token, expiresAt) {
  await db.collection('users').doc(uid).update({
    resetToken: token,
    resetTokenExpires: expiresAt,
  });
}

async function clearResetToken(uid) {
  await db.collection('users').doc(uid).update({
    resetToken: FieldValue.delete(),
    resetTokenExpires: FieldValue.delete(),
  });
}

async function updatePassword(uid, newHash) {
  await db.collection('users').doc(uid).update({ passwordHash: newHash });
  await clearResetToken(uid);
}

async function deleteTestUsers() {
  const snap = await db.collection('users').get();
  const batch = db.batch();
  for (const doc of snap.docs) {
    const data = doc.data();
    if (data.username?.startsWith('test') || data.username === 'demo' || data.username === 'Javier') {
      const cats = await doc.ref.collection('categories').get();
      const txs = await doc.ref.collection('transactions').get();
      const settings = await doc.ref.collection('settings').get();
      cats.docs.forEach(d => batch.delete(d.ref));
      txs.docs.forEach(d => batch.delete(d.ref));
      settings.docs.forEach(d => batch.delete(d.ref));
      batch.delete(doc.ref);
    }
  }
  await batch.commit();
}

async function getSettings(uid) {
  const doc = await db.collection('users').doc(uid).collection('settings').doc('main').get();
  const defaults = { monthly_budget: 0, currency: 'MXN', theme: 'dark' };
  if (!doc.exists) {
    await db.collection('users').doc(uid).collection('settings').doc('main').set(defaults);
    return defaults;
  }
  const data = doc.data();
  return {
    monthly_budget: Number(data.monthly_budget || 0),
    currency: data.currency || 'MXN',
    theme: data.theme || 'dark',
  };
}

async function setSettings(uid, s) {
  const update = {};
  if (s.monthly_budget !== undefined) update.monthly_budget = Number(s.monthly_budget) || 0;
  if (s.currency !== undefined) update.currency = s.currency;
  if (s.theme !== undefined) update.theme = s.theme;
  await db.collection('users').doc(uid).collection('settings').doc('main').set(update, { merge: true });
}

async function getCategories(uid) {
  const snap = await db.collection('users').doc(uid).collection('categories').get();
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((c) => c.active !== false)
    .sort((a, b) => (a.order || 0) - (b.order || 0));
}

async function addCategory(uid, name, type) {
  const snap = await db.collection('users').doc(uid).collection('categories').get();
  const maxOrder = snap.docs.reduce((m, d) => Math.max(m, d.data().order || 0), 0);
  const ref = await db.collection('users').doc(uid).collection('categories').add({
    name: String(name).trim(),
    type: type === 'income' ? 'income' : 'expense',
    order: maxOrder + 1,
    active: true,
  });
  return { id: ref.id, name: String(name).trim(), type, order: maxOrder + 1, active: true };
}

async function updateCategory(uid, id, name, type, active) {
  const update = {};
  if (name !== undefined) update.name = String(name).trim();
  if (type !== undefined) update.type = type === 'income' ? 'income' : 'expense';
  if (active !== undefined) update.active = active === true || active === 1 || active === '1';
  if (Object.keys(update).length === 0) return;
  await db.collection('users').doc(uid).collection('categories').doc(String(id)).set(update, { merge: true });
}

async function deleteCategory(uid, id) {
  const ref = db.collection('users').doc(uid).collection('categories').doc(String(id));
  const snap = await ref.get();
  if (!snap.exists) return;

  const txs = await db
    .collection('users')
    .doc(uid)
    .collection('transactions')
    .where('category_id', '==', String(id))
    .get();

  const batch = db.batch();
  txs.docs.forEach((d) => batch.update(d.ref, { category_id: null }));
  batch.delete(ref);
  await batch.commit();
}

async function getTransactions(uid, filtro) {
  const snap = await db
    .collection('users')
    .doc(uid)
    .collection('transactions')
    .orderBy('date', 'desc')
    .get();

  const cats = await getCategories(uid);
  const nombres = {};
  cats.forEach((c) => {
    nombres[c.id] = c.name;
  });

  let lista = snap.docs.map((d) => {
    const data = d.data();
    return {
      ...data,
      id: d.id,
      amount: Number(data.amount || 0),
      category_name: data.category_id ? nombres[data.category_id] || null : null,
    };
  });

  if (filtro && filtro.mes) {
    const prefijo = claveMes(filtro.anio, filtro.mes);
    lista = lista.filter((t) => String(t.date || '').startsWith(prefijo));
  }
  if (filtro && filtro.tipo) {
    lista = lista.filter((t) => t.type === filtro.tipo);
  }
  if (filtro && filtro.categoria) {
    lista = lista.filter((t) => String(t.category_id || '') === String(filtro.categoria));
  }

  return lista.sort((a, b) => {
    if (a.date === b.date) return String(b.id).localeCompare(String(a.id));
    return String(b.date).localeCompare(String(a.date));
  });
}

async function addTransaction(uid, concepto, monto, tipo, categoriaId, fecha) {
  const ref = await db.collection('users').doc(uid).collection('transactions').add({
    concept: String(concepto).trim(),
    amount: Math.round(Number(monto) * 100) / 100,
    type: tipo === 'income' ? 'income' : 'expense',
    category_id: categoriaId ? String(categoriaId) : null,
    date: fecha || new Date().toISOString().slice(0, 10),
    createdAt: FieldValue.serverTimestamp(),
  });
  return { id: ref.id };
}

async function updateTransaction(uid, id, campos) {
  const update = {};
  if (campos.concept !== undefined) update.concept = String(campos.concept).trim();
  if (campos.amount !== undefined) update.amount = Math.round(Number(campos.amount) * 100) / 100;
  if (campos.type !== undefined) update.type = campos.type === 'income' ? 'income' : 'expense';
  if (campos.category_id !== undefined) update.category_id = campos.category_id ? String(campos.category_id) : null;
  if (campos.date !== undefined) update.date = campos.date;
  if (Object.keys(update).length === 0) return;
  await db.collection('users').doc(uid).collection('transactions').doc(String(id)).set(update, { merge: true });
}

async function deleteTransaction(uid, id) {
  await db.collection('users').doc(uid).collection('transactions').doc(String(id)).delete();
}

async function getResumen(uid, filtro) {
  const [txs, settings] = await Promise.all([getTransactions(uid, filtro), getSettings(uid)]);

  let ingresos = 0;
  let gastos = 0;
  txs.forEach((t) => {
    if (t.type === 'income') ingresos += t.amount;
    else gastos += t.amount;
  });

  const limite = filtro && filtro.limite !== undefined ? filtro.limite : settings.monthly_budget;
  const balance = ingresos - gastos;
  const restante = limite > 0 ? limite - gastos : balance;
  const porcentaje = limite > 0 ? (gastos / limite) * 100 : 0;

  const porCategoria = {};
  txs.forEach((t) => {
    if (t.type !== 'expense') return;
    const clave = t.category_name || 'Sin categoría';
    porCategoria[clave] = (porCategoria[clave] || 0) + t.amount;
  });

  return {
    ingresos,
    gastos,
    balance,
    restante,
    limite,
    porcentaje: Math.round(porcentaje * 100) / 100,
    porCategoria: Object.entries(porCategoria)
      .map(([nombre, monto]) => ({ nombre, monto }))
      .sort((a, b) => b.monto - a.monto),
    currency: settings.currency,
    cantidad: txs.length,
  };
}

async function resetUser(uid) {
  const cats = await db.collection('users').doc(uid).collection('categories').get();
  const txs = await db.collection('users').doc(uid).collection('transactions').get();
  const batch = db.batch();
  cats.docs.forEach((d) => batch.delete(d.ref));
  txs.docs.forEach((d) => batch.delete(d.ref));
  batch.set(db.collection('users').doc(uid).collection('settings').doc('main'), {
    monthly_budget: 0,
    currency: 'MXN',
    theme: 'dark',
  });
  await batch.commit();
}

module.exports = {
  getUserByUsername,
  getUserByEmail,
  getUserByPhone,
  getUserByEmailOrPhone,
  getUserByResetToken,
  createUser,
  setEmailVerified,
  setPhoneVerified,
  setResetToken,
  clearResetToken,
  updatePassword,
  deleteTestUsers,
  getSettings,
  setSettings,
  getCategories,
  addCategory,
  updateCategory,
  deleteCategory,
  getTransactions,
  addTransaction,
  updateTransaction,
  deleteTransaction,
  getResumen,
  resetUser,
  mesActual,
  validarEmail,
  validarTelefono,
  validarUsername,
  validarPassword,
  normalizarTelefono,
};