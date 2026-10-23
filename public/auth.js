const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
const PHONE_REGEX = /^\+?[1-9]\d{1,14}$/;
const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,}$/;
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/;

const $ = (id) => document.getElementById(id);
const $$ = (sel) => document.querySelectorAll(sel);

const screens = [
  'screen-register',
  'screen-login1',
  'screen-login2',
  'screen-verify',
  'screen-forgot',
  'screen-reset',
];

let estado = {
  pantalla: 'register',
  pendingUser: null,
  identifier: null,
};

function mostrar(pantalla) {
  screens.forEach((s) => {
    const el = $(s);
    if (el) el.classList.toggle('active', s === 'screen-' + pantalla);
  });
  estado.pantalla = pantalla;
  limpiarErrores();
}

function limpiarErrores() {
  $$('[id^="err-"]').forEach((e) => e.classList.add('hidden'));
  $$('input').forEach((i) => i.classList.remove('shake'));
}

function mostrarError(id, msg) {
  const el = $(id);
  if (el) {
    el.textContent = msg;
    el.classList.remove('hidden');
  }
}

function mostrarErrorInput(inputId, msg) {
  const input = $(inputId);
  const errId = 'err-' + inputId;
  if (input) input.classList.add('shake');
  if (msg) mostrarError(errId, msg);
  setTimeout(() => {
    if (input) input.classList.remove('shake');
  }, 400);
}

function validarEmail(email) {
  return EMAIL_REGEX.test(email?.trim());
}

function validarTelefono(phone) {
  if (!phone) return true;
  return PHONE_REGEX.test(phone.trim().replace(/\s/g, '').replace(/^\+?/, '+'));
}

function validarUsername(username) {
  return USERNAME_REGEX.test(username?.trim());
}

function validarPassword(password) {
  return PASSWORD_REGEX.test(password);
}

function normalizarTelefono(phone) {
  if (!phone) return null;
  let p = phone.trim().replace(/\s/g, '');
  if (!p.startsWith('+')) p = '+' + p;
  return p;
}

async function api(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Error del servidor');
  return data;
}

function soloDigitos(input) {
  input.value = input.value.replace(/\D/g, '').slice(0, 1);
  const inputs = $$('.code-input');
  const idx = Array.from(inputs).indexOf(input);
  if (input.value && idx < inputs.length - 1) inputs[idx + 1].focus();
}

function obtenerCodigo() {
  return Array.from($$('.code-input')).map((i) => i.value).join('');
}

function limpiarCodigos() {
  $$('.code-input').forEach((i) => (i.value = ''));
}

async function checkSession() {
  try {
    const res = await fetch('/api/auth/me');
    if (res.ok) {
      const data = await res.json();
      window.location.href = '/app';
    }
  } catch (e) {}
}

async function irRegistro() {
  mostrar('register');
}

async function irLogin1() {
  mostrar('login1');
  limpiarFormulario('register');
}

async function irLogin2(user) {
  estado.pendingUser = user;
  $('login2-welcome-name').textContent = user.username || user.displayName;
  $('login2-password').value = '';
  mostrar('login2');
}

async function irVerify(pending) {
  estado.pendingUser = pending;
  $('verify-email-display').textContent = pending.email;
  limpiarCodigos();
  $$('.code-input')[0].focus();
  mostrar('verify');
}

async function irForgot() {
  mostrar('forgot');
}

async function irReset(token) {
  $('reset-token').value = token;
  $('reset-password').value = '';
  $('reset-confirm').value = '';
  mostrar('reset');
}

async function irLogin1DesdeCualquier() {
  estado.pendingUser = null;
  estado.identifier = null;
  mostrar('login1');
}

function limpiarFormulario(pantalla) {
  const form = $(`screen-${pantalla}`)?.querySelector('form') || $(`screen-${pantalla}`);
  if (form) form.reset();
  $$(`#screen-${pantalla} input`).forEach((i) => i.classList.remove('shake'));
}

function togglePassword(inputId, iconId) {
  const input = $(inputId);
  const icon = $(iconId);
  if (input.type === 'password') {
    input.type = 'text';
    icon.textContent = 'visibility_off';
  } else {
    input.type = 'password';
    icon.textContent = 'visibility';
  }
}

async function handleRegister(e) {
  e.preventDefault();
  limpiarErrores();
  
  const username = $('reg-username').value.trim();
  const email = $('reg-email').value.trim().toLowerCase();
  const phone = $('reg-phone').value.trim();
  const password = $('reg-password').value;
  
  let valido = true;
  
  if (!validarUsername(username)) {
    mostrarErrorInput('reg-username', 'Usuario: 3+ chars, solo letras, números y _');
    valido = false;
  }
  if (!validarEmail(email)) {
    mostrarErrorInput('reg-email', 'Email inválido');
    valido = false;
  }
  if (phone && !validarTelefono(phone)) {
    mostrarErrorInput('reg-phone', 'Formato: +52 1 234 567 8901');
    valido = false;
  }
  if (!validarPassword(password)) {
    mostrarErrorInput('reg-password', '8+ chars, mayúscula, minúscula, número, símbolo');
    valido = false;
  }
  
  if (!valido) return;
  
  try {
    const btn = $('btn-register');
    btn.disabled = true;
    btn.textContent = 'Creando...';
    
    const res = await api('/api/auth/register', {
      username,
      email,
      password,
      phone: phone || undefined,
    });
    
    if (res.needsVerification) {
      await irVerify({ userId: res.userId, email, username });
    } else {
      window.location.href = '/app';
    }
  } catch (err) {
    mostrarError('err-register', err.message);
  } finally {
    const btn = $('btn-register');
    btn.disabled = false;
    btn.textContent = 'Crear cuenta';
  }
}

async function handleLogin1(e) {
  e.preventDefault();
  limpiarErrores();
  
  const identifier = $('login-identifier').value.trim();
  
  if (!identifier) {
    mostrarErrorInput('login-identifier', 'Ingresa email o teléfono');
    return;
  }
  
  try {
    const btn = $('btn-login-continue');
    btn.disabled = true;
    btn.textContent = 'Buscando...';
    
    const res = await api('/api/auth/identify', {
      email: identifier.includes('@') ? identifier : undefined,
      phone: identifier.includes('@') ? undefined : identifier,
    });
    
    if (!res.exists) {
      mostrarError('err-login1', 'No hay cuenta con ese email/teléfono');
      return;
    }
    
    estado.identifier = identifier;
    await irLogin2(res);
  } catch (err) {
    mostrarError('err-login1', err.message);
  } finally {
    const btn = $('btn-login-continue');
    btn.disabled = false;
    btn.textContent = 'Continuar';
  }
}

async function handleLogin2(e) {
  e.preventDefault();
  limpiarErrores();
  
  const password = $('login2-password').value;
  
  if (!password) {
    mostrarErrorInput('login2-password', 'Contraseña requerida');
    return;
  }
  
  const user = estado.pendingUser;
  const identifier = estado.identifier;
  
  try {
    const btn = $('btn-login2-enter');
    btn.disabled = true;
    btn.textContent = 'Entrando...';
    
    const body = { password };
    if (identifier.includes('@')) body.email = identifier;
    else if (identifier.startsWith('+')) body.phone = identifier;
    else body.username = user.username;
    
    await api('/api/auth/login', body);
    window.location.href = '/app';
  } catch (err) {
    mostrarError('err-login2', err.message);
  } finally {
    const btn = $('btn-login2-enter');
    btn.disabled = false;
    btn.textContent = 'Entrar';
  }
}

async function handleVerify(e) {
  e.preventDefault();
  limpiarErrores();
  
  const code = obtenerCodigo();
  
  if (code.length !== 6) {
    $$('.code-input').forEach((i) => i.classList.add('shake'));
    setTimeout(() => $$('.code-input').forEach((i) => i.classList.remove('shake')), 400);
    return;
  }
  
  try {
    const btn = $('btn-verify');
    btn.disabled = true;
    btn.textContent = 'Verificando...';
    
    await api('/api/auth/verify', { code });
    window.location.href = '/app';
  } catch (err) {
    mostrarError('err-verify', err.message);
    limpiarCodigos();
    $$('.code-input')[0].focus();
  } finally {
    const btn = $('btn-verify');
    btn.disabled = false;
    btn.textContent = 'Verificar';
  }
}

async function handleResendVerification() {
  try {
    const btn = $('btn-resend-verification');
    btn.disabled = true;
    btn.textContent = 'Enviando...';
    
    await api('/api/auth/resend-verification', {});
    alert('Código reenviado');
  } catch (err) {
    mostrarError('err-verify', err.message);
  } finally {
    const btn = $('btn-resend-verification');
    btn.disabled = false;
    btn.textContent = 'Reenviar código';
  }
}

async function handleForgot(e) {
  e.preventDefault();
  limpiarErrores();
  
  const identifier = $('forgot-identifier').value.trim();
  
  if (!identifier) {
    mostrarErrorInput('forgot-identifier', 'Ingresa email o teléfono');
    return;
  }
  
  try {
    const btn = $('btn-forgot-send');
    btn.disabled = true;
    btn.textContent = 'Enviando...';
    
    await api('/api/auth/forgot-password', {
      email: identifier.includes('@') ? identifier : undefined,
      phone: identifier.includes('@') ? undefined : identifier,
    });
    
    alert('Si la cuenta existe, recibirás un código por email/SMS');
    await irReset('mock-token');
  } catch (err) {
    mostrarError('err-forgot', err.message);
  } finally {
    const btn = $('btn-forgot-send');
    btn.disabled = false;
    btn.textContent = 'Enviar código';
  }
}

async function handleReset(e) {
  e.preventDefault();
  limpiarErrores();
  
  const password = $('reset-password').value;
  const confirm = $('reset-confirm').value;
  const token = $('reset-token').value || 'mock-token';
  
  if (!validarPassword(password)) {
    mostrarErrorInput('reset-password', '8+ chars, mayúscula, minúscula, número, símbolo');
    return;
  }
  if (password !== confirm) {
    mostrarErrorInput('reset-confirm', 'Las contraseñas no coinciden');
    return;
  }
  
  try {
    const btn = $('btn-reset-save');
    btn.disabled = true;
    btn.textContent = 'Guardando...';
    
    await api('/api/auth/reset-password', { token, password });
    alert('Contraseña cambiada. Ahora inicia sesión.');
    await irLogin1DesdeCualquier();
  } catch (err) {
    mostrarError('err-reset', err.message);
  } finally {
    const btn = $('btn-reset-save');
    btn.disabled = false;
    btn.textContent = 'Guardar nueva contraseña';
  }
}

async function handleTogglePassword() {
  togglePassword('login2-password', 'icon-eye');
}

function setupCodeInputs() {
  $$('.code-input').forEach((input, idx) => {
    input.addEventListener('input', () => soloDigitos(input));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !input.value && idx > 0) {
        $$('.code-input')[idx - 1].focus();
      }
      if (e.key === 'Enter') handleVerify(new Event('submit'));
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  checkSession();
  
  $('form-register')?.addEventListener('submit', handleRegister);
  $('form-login1')?.addEventListener('submit', handleLogin1);
  $('form-login2')?.addEventListener('submit', handleLogin2);
  $('form-verify')?.addEventListener('submit', handleVerify);
  $('form-forgot')?.addEventListener('submit', handleForgot);
  $('form-reset')?.addEventListener('submit', handleReset);
  
  $('#link-to-login')?.addEventListener('click', irLogin1);
  $('#link-to-register')?.addEventListener('click', irRegistro);
  $('#link-login1-forgot')?.addEventListener('click', irForgot);
  $('#link-login2-back')?.addEventListener('click', irLogin1);
  $('#link-login2-forgot')?.addEventListener('click', irForgot);
  $('#link-forgot-back')?.addEventListener('click', irLogin1DesdeCualquier);
  $('#link-reset-back')?.addEventListener('click', irLogin1DesdeCualquier);
  $('#btn-resend-verification')?.addEventListener('click', handleResendVerification);
  $('#btn-toggle-password')?.addEventListener('click', handleTogglePassword);
  
  setupCodeInputs();
  
  if (new URLSearchParams(window.location.search).get('reset')) {
    irReset(new URLSearchParams(window.location.search).get('reset'));
  } else {
    mostrar('register');
  }
});