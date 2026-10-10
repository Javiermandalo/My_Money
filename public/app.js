const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const SIMBOLOS = { MXN: '$', USD: '$', EUR: '€' };

let estado = {
  tipo: 'expense',
  filtro: 'all',
  categorias: [],
  resumen: null,
  mes: null,
  anio: null,
  editandoId: null,
  vistoId: null,
  moneda: 'MXN',
};

const $ = (id) => document.getElementById(id);
const sim = () => SIMBOLOS[estado.moneda] || '$';

function fmt(n) {
  return sim() + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escapar(t) {
  return String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function toast(mensaje) {
  const t = $('toast');
  $('toast-msg').textContent = mensaje;
  t.classList.remove('hidden');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.add('hidden'), 2600);
}

async function api(url, opciones) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...opciones,
    body: opciones && opciones.body ? JSON.stringify(opciones.body) : undefined,
  });
  if (res.status === 401) {
    location.href = '/';
    return null;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Error en la servidor');
  return data;
}

function abrirSheet(id) {
  $(id).classList.remove('hidden');
}

function cerrarSheet(id) {
  $(id).classList.add('hidden');
}

function fechaHoy() {
  return new Date().toISOString().slice(0, 10);
}

function tituloMes() {
  if (estado.mes === new Date().getMonth() + 1 && estado.anio === new Date().getFullYear()) return 'Este mes';
  return MESES[estado.mes - 1] + ' ' + estado.anio;
}

async function cargar() {
  const params = new URLSearchParams({ m: estado.mes, anio: estado.anio });
  const [resumen, txs] = await Promise.all([
    api('/api/summary?' + params),
    api('/api/transactions?' + params),
  ]);
  if (!resumen || !txs) return;

  estado.resumen = resumen;
  estado._txs = txs;
  estado.moneda = resumen.currency || 'MXN';

  $('balance').textContent = fmt(resumen.balance);
  $('restante').textContent = fmt(resumen.restante);
  $('gastos').textContent = fmt(resumen.gastos);
  $('ingresos').textContent = fmt(resumen.ingresos);
  $('gastos-label').textContent = 'Gastos ' + sim() + fmt(resumen.gastos).slice(1);

  const pct = Math.min(resumen.porcentaje, 100);
  $('progress').style.width = pct + '%';
  $('porc').textContent = resumen.porcentaje.toFixed(1) + '%';
  $('progress').className = 'h-full transition-all duration-500 ' + (resumen.porcentaje >= 100 ? 'bg-red-500' : resumen.porcentaje >= 80 ? 'bg-amber-500' : 'bg-emerald-500');

  $('mes-titulo').textContent = tituloMes();
  $('set-presupuesto').value = resumen.limite || 0;
  $('set-moneda').value = estado.moneda;

  pintarCategorias();
  const filtradas = estado.filtro === 'all' ? txs : txs.filter((t) => t.type === estado.filtro);
  pintarTransacciones(filtradas);
}

function pintarCategorias() {
  const el = $('cat-breakdown');
  const datos = estado.resumen.porCategoria || [];
  if (!datos.length) {
    el.innerHTML = '<p class="text-sm text-slate-400 text-center">Sin gastos registrados</p>';
    return;
  }
  const max = Math.max(...datos.map((d) => d.monto));
  el.innerHTML = datos.map((d) => {
    const ancho = (d.monto / max) * 100;
    return `
      <div>
        <div class="flex justify-between text-xs mb-1.5">
          <span class="text-slate-300 truncate pr-2">${escapar(d.nombre)}</span>
          <span class="text-slate-400 shrink-0">${fmt(d.monto)}</span>
        </div>
        <div class="w-full bg-slate-900/60 h-1.5 rounded-full overflow-hidden">
          <div class="bg-emerald-500/70 h-full rounded-full" style="width:${ancho}%"></div>
        </div>
      </div>`;
  }).join('');
}

function pintarTransacciones(lista) {
  const el = $('tx-list');
  if (!lista.length) {
    el.innerHTML = '';
    $('empty').classList.remove('hidden');
    return;
  }
  $('empty').classList.add('hidden');

  const hoy = fechaHoy();
  let ultimoMes = '';

  el.innerHTML = lista.map((t) => {
    const [anio, mes, dia] = String(t.date).split('-');
    let etiqueta = '';
    if (t.date === hoy) etiqueta = 'Hoy';
    else {
      const ayer = new Date();
      ayer.setDate(ayer.getDate() - 1);
      if (t.date === ayer.toISOString().slice(0, 10)) etiqueta = 'Ayer';
      else etiqueta = dia + ' ' + MESES[Number(mes) - 1].toLowerCase();
    }

    const separator = etiqueta !== ultimoMes ? `<div class="px-4 py-1.5 text-xs text-slate-500 bg-slate-900/40">${etiqueta}</div>` : '';
    ultimoMes = etiqueta;

    const signo = t.type === 'income' ? '+' : '-';
    const color = t.type === 'income' ? 'text-emerald-400' : 'text-slate-100';

    return separator + `
      <button data-id="${t.id}" class="tx-row w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-800/30 text-left transition">
        <div class="min-w-0 pr-3">
          <div class="text-sm font-medium truncate">${escapar(t.concept)}</div>
          <div class="text-xs text-slate-400 mt-0.5">${escapar(t.category_name || 'Sin categoría')}</div>
        </div>
        <div class="text-sm font-medium shrink-0 ${color}">${signo}${fmt(t.amount)}</div>
      </button>`;
  }).join('');

  el.querySelectorAll('.tx-row').forEach((b) => {
    b.onclick = () => abrirDetalle(b.dataset.id);
  });
}

function abrirDetalle(id) {
  estado.vistoId = id;
  const t = (estado._txs || []).find((x) => x.id === id);
  if (!t) return;

  const signo = t.type === 'income' ? '+' : '-';
  $('det-monto').textContent = signo + fmt(t.amount);
  $('det-monto').className = 'text-3xl font-semibold ' + (t.type === 'income' ? 'text-emerald-400' : 'text-slate-100');
  $('det-concepto').textContent = t.concept;
  $('det-tipo').textContent = t.type === 'income' ? 'Ingreso' : 'Gasto';
  $('det-categoria').textContent = t.category_name || 'Sin categoría';
  $('det-fecha').textContent = t.date;
  abrirSheet('sheet-detalle');
}

function fillCategoriasModal() {
  const sel = $('tx-categoria');
  const lista = estado.categorias.filter((c) => c.type === estado.tipo);
  sel.innerHTML = '<option value="">Sin categoría</option>' +
    lista.map((c) => `<option value="${c.id}">${escapar(c.name)}</option>`).join('');
}

function pintarListaCategorias() {
  const el = $('cats-list');
  if (!estado.categorias.length) {
    el.innerHTML = '<p class="text-sm text-slate-400 text-center">Sin categorías</p>';
    return;
  }
  el.innerHTML = estado.categorias.map((c) => `
    <div class="flex items-center gap-2 bg-slate-900/40 border border-slate-800 rounded-xl px-2 py-1.5">
      <span class="text-xs px-2 py-0.5 rounded ${c.type === 'income' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-slate-800 text-slate-300'}">${c.type === 'income' ? 'Ingreso' : 'Gasto'}</span>
      <input value="${escapar(c.name)}" data-id="${c.id}" data-campo="name" class="cat-edit flex-1 bg-transparent text-sm px-2 py-1 min-w-0" />
      <button data-borrar="${c.id}" class="w-8 h-8 rounded-lg hover:bg-red-500/20 flex items-center justify-center shrink-0">
        <span class="material-symbols-outlined text-base text-red-400">delete</span>
      </button>
    </div>
  `).join('');

  el.querySelectorAll('.cat-edit').forEach((input) => {
    input.onchange = async () => {
      const nombre = input.value.trim();
      if (!nombre) {
        input.value = estado.categorias.find((c) => c.id === input.dataset.id).name;
        return;
      }
      try {
        await api('/api/categories/' + input.dataset.id, { method: 'PUT', body: { name: nombre } });
        await cargarCategorias();
        await cargar();
        fillCategoriasModal();
        toast('Categoría actualizada');
      } catch (e) {
        toast(e.message);
      }
    };
  });

  el.querySelectorAll('[data-borrar]').forEach((b) => {
    b.onclick = async () => {
      const cat = estado.categorias.find((c) => c.id === b.dataset.borrar);
      if (!confirm('¿Borrar "' + cat.name + '"? Sus transacciones quedarán sin categoría.')) return;
      try {
        await api('/api/categories/' + b.dataset.borrar, { method: 'DELETE' });
        await cargarCategorias();
        await cargar();
        fillCategoriasModal();
        toast('Categoría borrada');
      } catch (e) {
        toast(e.message);
      }
    };
  });
}

async function cargarCategorias() {
  estado.categorias = await api('/api/categories');
}

async function guardarTx() {
  const concepto = $('tx-concepto').value.trim();
  const monto = Number($('tx-monto').value);
  const fecha = $('tx-fecha').value;
  const categoria = $('tx-categoria').value || null;

  const err = $('tx-error');
  err.classList.add('hidden');

  if (!concepto) {
    err.textContent = 'Escribe un concepto';
    err.classList.remove('hidden');
    return;
  }
  if (!Number.isFinite(monto) || monto <= 0) {
    err.textContent = 'El monto debe ser mayor que cero';
    err.classList.remove('hidden');
    return;
  }

  const cuerpo = { concept: concepto, amount: monto, type: estado.tipo, category_id: categoria, date: fecha };

  try {
    if (estado.editandoId) {
      await api('/api/transactions/' + estado.editandoId, { method: 'PUT', body: cuerpo });
      toast('Transacción actualizada');
    } else {
      await api('/api/transactions', { method: 'POST', body: cuerpo });
      toast(estado.tipo === 'income' ? 'Ingreso registrado' : 'Gasto registrado');
    }
    cerrarSheet('sheet-tx');
    await cargar();
  } catch (e) {
    err.textContent = e.message;
    err.classList.remove('hidden');
  }
}

function abrirTx(tipo) {
  estado.editandoId = null;
  estado.tipo = tipo || 'expense';
  $('tx-titulo').textContent = 'Nueva transacción';
  $('tx-concepto').value = '';
  $('tx-monto').value = '';
  $('tx-fecha').value = fechaHoy();
  $('tx-error').classList.add('hidden');
  marcarTipo();
  fillCategoriasModal();
  abrirSheet('sheet-tx');
  setTimeout(() => $('tx-concepto').focus(), 100);
}

function marcarTipo() {
  document.querySelectorAll('.tipo-btn').forEach((b) => {
    const activo = b.dataset.tipo === estado.tipo;
    b.className = 'tipo-btn py-2 rounded-xl border text-sm ' +
      (activo ? 'border-emerald-500 bg-emerald-500/15 text-emerald-400' : 'border-slate-800 text-slate-400');
  });
}

async function editarTx() {
  const id = estado.vistoId;
  const t = estado._txs.find((x) => x.id === id);
  if (!t) return;

  cerrarSheet('sheet-detalle');
  estado.editandoId = id;
  estado.tipo = t.type;
  $('tx-titulo').textContent = 'Editar transacción';
  $('tx-concepto').value = t.concept;
  $('tx-monto').value = t.amount;
  $('tx-fecha').value = t.date;
  $('tx-error').classList.add('hidden');
  marcarTipo();
  fillCategoriasModal();
  $('tx-categoria').value = t.category_id || '';
  abrirSheet('sheet-tx');
}

async function borrarTx() {
  const id = estado.vistoId;
  const t = estado._txs.find((x) => x.id === id);
  if (!confirm('¿Borrar "' + t.concept + '"?')) return;
  try {
    await api('/api/transactions/' + id, { method: 'DELETE' });
    cerrarSheet('sheet-detalle');
    await cargar();
    toast('Transacción borrada');
  } catch (e) {
    toast(e.message);
  }
}

async function nuevaCategoria(tipo) {
  const nombre = prompt(tipo === 'income' ? 'Nombre del ingreso' : 'Nombre del gasto');
  if (!nombre || !nombre.trim()) return;
  try {
    await api('/api/categories', { method: 'POST', body: { name: nombre.trim(), type: tipo } });
    await cargarCategorias();
    pintarListaCategorias();
    fillCategoriasModal();
    toast('Categoría creada');
  } catch (e) {
    toast(e.message);
  }
}

async function guardarAjustes() {
  const presupuesto = Number($('set-presupuesto').value) || 0;
  const moneda = $('set-moneda').value;
  try {
    await api('/api/settings', { method: 'PUT', body: { monthly_budget: presupuesto, currency: moneda } });
    estado.moneda = moneda;
    cerrarSheet('sheet-ajustes');
    await cargar();
    toast('Ajustes guardados');
  } catch (e) {
    toast(e.message);
  }
}

async function reiniciar() {
  if (!confirm('Esto borra TODAS tus transacciones y categorías. El presupuesto vuelve a 0. ¿Continuar?')) return;
  if (!confirm('¿Seguro? No se puede deshacer.')) return;
  try {
    await api('/api/reset', { method: 'POST' });
    await cargarCategorias();
    await cargar();
    cerrarSheet('sheet-ajustes');
    toast('Datos reiniciados');
  } catch (e) {
    toast(e.message);
  }
}

function moverMes(delta) {
  let m = estado.mes + delta;
  let a = estado.anio;
  if (m < 1) { m = 12; a--; }
  if (m > 12) { m = 1; a++; }
  estado.mes = m;
  estado.anio = a;
  cargar();
}

document.addEventListener('DOMContentLoaded', async () => {
  const ahora = new Date();
  estado.mes = ahora.getMonth() + 1;
  estado.anio = ahora.getFullYear();

  document.querySelectorAll('[data-cerrar]').forEach((b) => {
    b.onclick = () => b.closest('.fixed').classList.add('hidden');
  });

  document.querySelectorAll('.tipo-btn').forEach((b) => {
    b.onclick = () => {
      estado.tipo = b.dataset.tipo;
      marcarTipo();
      fillCategoriasModal();
    };
  });

  document.querySelectorAll('.filtro-btn').forEach((b) => {
    b.onclick = () => {
      estado.filtro = b.dataset.filtro;
      document.querySelectorAll('.filtro-btn').forEach((x) => {
        const activo = x.dataset.filtro === estado.filtro;
        x.className = 'filtro-btn shrink-0 px-3 py-1 rounded-full text-xs ' +
          (activo ? 'bg-slate-800/80 text-slate-100' : 'text-slate-400');
      });
      cargar();
    };
  });

  $('fab').onclick = () => abrirTx('expense');
  $('tx-guardar').onclick = guardarTx;
  $('det-editar').onclick = editarTx;
  $('det-borrar').onclick = borrarTx;
  $('mes-anterior').onclick = () => moverMes(-1);
  $('mes-siguiente').onclick = () => moverMes(1);
  $('set-guardar').onclick = guardarAjustes;
  $('set-reiniciar').onclick = reiniciar;
  $('cat-nueva-gasto').onclick = () => nuevaCategoria('expense');
  $('cat-nueva-ingreso').onclick = () => nuevaCategoria('income');

  $('btn-categorias').onclick = async () => {
    await cargarCategorias();
    pintarListaCategorias();
    abrirSheet('sheet-categorias');
  };

  $('btn-ajustes').onclick = () => abrirSheet('sheet-ajustes');

  $('btn-salir').onclick = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    location.href = '/';
  };

  $('btn-ver-todas').onclick = () => {
    estado.filtro = 'all';
    document.querySelectorAll('.filtro-btn').forEach((x) => {
      const activo = x.dataset.filtro === 'all';
      x.className = 'filtro-btn shrink-0 px-3 py-1 rounded-full text-xs ' +
        (activo ? 'bg-slate-800/80 text-slate-100' : 'text-slate-400');
    });
    cargar();
  };

  $('tx-concepto').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') guardarTx();
  });
  $('tx-monto').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') guardarTx();
  });

  try {
    const me = await fetch('/api/auth/me');
    if (!me.ok) return (location.href = '/');
    const datos = await me.json();
    $('user-name').textContent = datos.username;

    await cargarCategorias();
    fillCategoriasModal();
    await cargar();
  } catch (e) {
    console.error(e);
  }

  setInterval(() => {
    if (document.querySelector('.fixed:not(.hidden)') ) return;
    cargar();
  }, 15000);
});
