const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const dbFile = path.join(dataDir, 'mymoney.json');

function load() {
  if (fs.existsSync(dbFile)) {
    try { return JSON.parse(fs.readFileSync(dbFile)); } catch (e) { return getDefault(); }
  }
  return getDefault();
}
function save(data) {
  fs.writeFileSync(dbFile, JSON.stringify(data, null, 2));
}
function getDefault() {
  return { users: [], settings: {}, categories: [], transactions: [], nextId: 1 };
}

const store = load();

module.exports = {
  getUserByUsername: (u) => store.users.find(x => x.username === u),
  createUser: (username, passwordHash) => {
    const id = store.nextId++; const u = { id, username, passwordHash, createdAt: Date.now() };
    store.users.push(u); save(store); return u;
  },
  getSettings: (uid) => store.settings[uid] || { monthly_budget: 0, currency: 'MXN', theme: 'dark' },
  setSettings: (uid, s) => { store.settings[uid] = { monthly_budget: s.monthly_budget||0, currency: s.currency||'MXN', theme: s.theme||'dark' }; save(store); },
  getCategories: (uid) => (store.categories.filter(c=>c.userId===uid && c.active!==false).sort((a,b)=>(a.order||0)-(b.order||0)||a.id-b.id)),
  addCategory: (uid, name, type) => {
    const max = Math.max(0, ...store.categories.filter(c=>c.userId===uid).map(c=>c.order||0));
    const c = { id: store.nextId++, userId: uid, name, type, order: max+1, active: true };
    store.categories.push(c); save(store); return c;
  },
  updateCategory: (uid, id, name, type, active) => {
    const c = store.categories.find(x=>x.id===+id && x.userId===uid); if(c){ c.name=name; c.type=type; c.active=active!==false; save(store);} return c;
  },
  deleteCategory: (uid, id) => { store.categories = store.categories.filter(x=>!(x.id===+id && x.userId===uid)); save(store); },
  getTransactions: (uid) => store.transactions.filter(t=>t.userId===uid).sort((a,b)=> (b.date||'').localeCompare(a.date||'') || b.id-a.id),
  addTransaction: (uid, concept, amount, type, category_id, date) => {
    const t = { id: store.nextId++, userId: uid, concept, amount:+amount, type, category_id: category_id?+category_id:null, date: date||new Date().toISOString().slice(0,10) };
    store.transactions.push(t); save(store); return t;
  },
  deleteTransaction: (uid, id) => { store.transactions = store.transactions.filter(x=>!(x.id===+id && x.userId===uid)); save(store); },
  resetUser: (uid) => { store.transactions = store.transactions.filter(t=>t.userId!==uid); store.categories = store.categories.filter(c=>c.userId!==uid); delete store.settings[uid]; save(store); }
};
