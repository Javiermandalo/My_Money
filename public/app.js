let txType='expense';
let categories=[];
let editingTx=null;

function fmt(n){return '$'+(n||0).toFixed(2);}

async function load(){
  const [me,summary,txs,cats]=await Promise.all([
    fetch('/api/auth/me'),
    fetch('/api/summary'),
    fetch('/api/transactions'),
    fetch('/api/categories')
  ]);
  if(!me.ok)return location.href='/';
  const s=await summary.json(), t=await txs.json(), c=await cats.json();
  categories=c;
  document.getElementById('balance').textContent=fmt(s.balance);
  document.getElementById('gastos').textContent=fmt(s.gastos);
  document.getElementById('ingresos').textContent=fmt(s.ingresos);
  document.getElementById('restante').textContent=fmt(s.restante);
  document.getElementById('porc').textContent=s.porcentaje.toFixed(1)+'%';
  document.getElementById('progress').style.width=s.porcentaje+'%';
  renderTx(t);
  fillCats();
  fillSettingsCats(c);
  const setB=document.getElementById('set-budget'); if(setB) setB.value=s.limite||0;
}

function renderTx(list){
  const el=document.getElementById('tx-list');
  const empty=document.getElementById('empty');
  if(!list.length){el.innerHTML='';empty.classList.remove('hidden');return;}
  empty.classList.add('hidden');
  el.innerHTML=list.map(x=>`
    <div class="flex items-center justify-between px-4 py-2.5">
      <div class="min-w-0">
        <div class="text-sm font-medium truncate">${x.concept}</div>
        <div class="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
          <span class="px-1.5 py-0.5 rounded bg-slate-800/60">${x.category_name||'Sin categoría'}</span>
          <span>${x.date||''}</span>
        </div>
      </div>
      <div class="text-right pl-2">
        <div class="text-sm font-medium ${x.type==='income'?'text-emerald-400':'text-slate-100'}">${x.type==='income'?'+':''}${fmt(x.amount)}</div>
      </div>
    </div>
  `).join('');
}

function fillCats(){
  const sel=document.getElementById('tx-cat');
  sel.innerHTML='<option value="">Sin categoría</option>'+categories.filter(c=>c.type===txType).map(c=>`<option value="${c.id}">${c.name}</option>`).join('');
}

function fillSettingsCats(list){
  const el=document.getElementById('cats-list');
  el.innerHTML=list.map(c=>`
    <div class="flex items-center gap-2 bg-slate-900/40 border border-slate-800 rounded-xl px-2 py-1.5">
      <input value="${c.name}" data-id="${c.id}" class="cat-name flex-1 bg-transparent text-sm px-2 py-1" />
      <select data-id="${c.id}" class="cat-type bg-slate-900/60 border border-slate-800 rounded-lg text-xs px-2 py-1">
        <option value="expense" ${c.type==='expense'?'selected':''}>Gasto</option>
        <option value="income" ${c.type==='income'?'selected':''}>Ingreso</option>
      </select>
      <button data-del="${c.id}" class="w-8 h-8 rounded-lg hover:bg-red-500/20 flex items-center justify-center"><span class="material-symbols-outlined text-base text-red-400">delete</span></button>
    </div>
  `).join('');
  el.querySelectorAll('.cat-name,.cat-type').forEach(i=>i.onchange=async(e)=>{
    const id=e.target.dataset.id; const row=el.querySelector(`[data-id='${id}']`).closest('.flex');
    const name=row.querySelector('.cat-name').value; const type=row.querySelector('.cat-type').value;
    await fetch('/api/categories/'+id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,type,budget:0,color:'#4b7cff',icon:'category',active:1})});
    load();
  });
  el.querySelectorAll('[data-del]').forEach(b=>b.onclick=async(e)=>{
    const id=e.currentTarget.dataset.del; await fetch('/api/categories/'+id,{method:'DELETE'}); load();
  });
}

document.querySelectorAll('.type-btn').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('.type-btn').forEach(x=>{x.classList.remove('bg-slate-800/80');x.classList.add('text-slate-400');});
  b.classList.add('bg-slate-800/80');b.classList.remove('text-slate-400'); txType=b.dataset.type; fillCats();
});

document.getElementById('btn-add').onclick=document.getElementById('fab-add').onclick=()=>{editingTx=null;document.getElementById('tx-concept').value='';document.getElementById('tx-amount').value='';document.getElementById('tx-date').value=new Date().toISOString().split('T')[0];document.getElementById('modal-tx').classList.remove('hidden');};
document.getElementById('close-tx').onclick=()=>document.getElementById('modal-tx').classList.add('hidden');
document.getElementById('save-tx').onclick=async()=>{
  const concept=document.getElementById('tx-concept').value.trim(); const amount=parseFloat(document.getElementById('tx-amount').value)||0; const date=document.getElementById('tx-date').value; const cat=document.getElementById('tx-cat').value||null;
  if(!concept||amount<=0){alert('Concepto y monto válidos');return;}
  await fetch('/api/transactions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({concept,amount,type:txType,category_id:cat||null,date,notes:''})});
  document.getElementById('modal-tx').classList.add('hidden'); load();
};

document.getElementById('btn-settings').onclick=()=>document.getElementById('modal-settings').classList.remove('hidden');
document.getElementById('close-settings').onclick=()=>document.getElementById('modal-settings').classList.add('hidden');
document.getElementById('add-cat').onclick=async()=>{
  const name=prompt('Nombre de categoría'); if(!name)return;
  const type=txType;
  await fetch('/api/categories',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,type,budget:0,color:'#4b7cff',icon:'category'})});
  load();
};
document.getElementById('save-settings').onclick=async()=>{
  const budget=parseFloat(document.getElementById('set-budget').value)||0;
  await fetch('/api/settings',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({monthly_budget:budget,currency:'MXN',theme:'dark'})});
  document.getElementById('modal-settings').classList.add('hidden'); load();
};
document.getElementById('reset-data').onclick=async()=>{
  if(!confirm('Esto borrará TODAS las transacciones y categorías. ¿Continuar?'))return;
  await fetch('/api/reset',{method:'POST'}); load();
};
document.getElementById('btn-logout').onclick=async()=>{await fetch('/api/auth/logout',{method:'POST'});location.href='/'};
document.getElementById('fab-add').onclick=document.getElementById('btn-add').onclick;

load(); setInterval(load,5000);
