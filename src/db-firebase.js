const { db, FieldValue } = require('./firebase');

async function getUserByUsername(username) {
  const snap = await db.collection('users').where('username', '==', username).limit(1).get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, username: doc.data().username, passwordHash: doc.data().passwordHash };
}

async function createUser(username, passwordHash) {
  const ref = await db.collection('users').add({
    username: username.trim(),
    passwordHash,
    createdAt: FieldValue.serverTimestamp(),
  });
  await ref.collection('settings').doc('main').set({
    monthly_budget: 0,
    currency: 'MXN',
    theme: 'dark',
  });
  return { id: ref.id, username: username.trim() };
}

async function getSettings(uid) {
  const doc = await db.collection('users').doc(uid).collection('settings').doc('main').get();
  if (!doc.exists) {
    const defaults = { monthly_budget: 0, currency: 'MXN', theme: 'dark' };
    await db.collection('users').doc(uid).collection('settings').doc('main').set(defaults);
    return defaults;
  }
  const data = doc.data();
  return {
    monthly_budget: data.monthly_budget || 0,
    currency: data.currency || 'MXN',
    theme: data.theme || 'dark',
  };
}

async function setSettings(uid, s) {
  await db.collection('users').doc(uid).collection('settings').doc('main').set(
    {
      monthly_budget: s.monthly_budget || 0,
      currency: s.currency || 'MXN',
      theme: s.theme || 'dark',
    },
    { merge: true }
  );
}

async function getCategories(uid) {
  const snap = await db
    .collection('users')
    .doc(uid)
    .collection('categories')
    .orderBy('order', 'asc')
    .get();
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((c) => c.active !== false);
}

async function addCategory(uid, name, type) {
  const snap = await db.collection('users').doc(uid).collection('categories').get();
  const maxOrder = snap.docs.reduce((m, d) => Math.max(m, d.data().order || 0), 0);
  const ref = await db.collection('users').doc(uid).collection('categories').add({
    name,
    type,
    order: maxOrder + 1,
    active: true,
  });
  return { id: ref.id, name, type, order: maxOrder + 1, active: true };
}

async function updateCategory(uid, id, name, type, active) {
  await db.collection('users').doc(uid).collection('categories').doc(String(id)).update({
    name,
    type,
    active: active !== false,
  });
}

async function deleteCategory(uid, id) {
  await db.collection('users').doc(uid).collection('categories').doc(String(id)).delete();
}

async function getTransactions(uid) {
  const snap = await db
    .collection('users')
    .doc(uid)
    .collection('transactions')
    .orderBy('date', 'desc')
    .orderBy('createdAt', 'desc')
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function addTransaction(uid, concept, amount, type, category_id, date) {
  const ref = await db.collection('users').doc(uid).collection('transactions').add({
    concept,
    amount: parseFloat(amount),
    type,
    category_id: category_id ? String(category_id) : null,
    date: date || new Date().toISOString().slice(0, 10),
    createdAt: FieldValue.serverTimestamp(),
  });
  return { id: ref.id };
}

async function deleteTransaction(uid, id) {
  await db.collection('users').doc(uid).collection('transactions').doc(String(id)).delete();
}

async function resetUser(uid) {
  const cats = await db.collection('users').doc(uid).collection('categories').get();
  for (const d of cats.docs) await d.ref.delete();

  const txs = await db.collection('users').doc(uid).collection('transactions').get();
  for (const d of txs.docs) await d.ref.delete();

  await db.collection('users').doc(uid).collection('settings').doc('main').set({
    monthly_budget: 0,
    currency: 'MXN',
    theme: 'dark',
  });
}

module.exports = {
  getUserByUsername,
  createUser,
  getSettings,
  setSettings,
  getCategories,
  addCategory,
  updateCategory,
  deleteCategory,
  getTransactions,
  addTransaction,
  deleteTransaction,
  resetUser,
};
