const tabLogin = document.getElementById('tab-login');
const tabRegister = document.getElementById('tab-register');
const formLogin = document.getElementById('form-login');
const formRegister = document.getElementById('form-register');
const authCard = document.getElementById('auth-card');
const onboarding = document.getElementById('onboarding');
const loginErr = document.getElementById('login-err');
const regErr = document.getElementById('reg-err');

tabLogin.onclick = () => {
  tabLogin.classList.add('bg-slate-800','text-slate-100');
  tabRegister.classList.remove('bg-slate-800','text-slate-100');
  tabRegister.classList.add('text-slate-400');
  formLogin.classList.remove('hidden');
  formRegister.classList.add('hidden');
};
tabRegister.onclick = () => {
  tabRegister.classList.add('bg-slate-800','text-slate-100');
  tabLogin.classList.remove('bg-slate-800','text-slate-100');
  tabLogin.classList.add('text-slate-400');
  formRegister.classList.remove('hidden');
  formLogin.classList.add('hidden');
};

formLogin.onsubmit = async (e) => {
  e.preventDefault();
  const username = document.getElementById('login-user').value.trim();
  const password = document.getElementById('login-pass').value;
  const res = await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password})});
  const data = await res.json();
  if(!res.ok){loginErr.textContent=data.error;loginErr.classList.remove('hidden');return;}
  window.location.href='/app';
};

formRegister.onsubmit = async (e) => {
  e.preventDefault();
  const username = document.getElementById('reg-user').value.trim();
  const password = document.getElementById('reg-pass').value;
  const res = await fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password})});
  const data = await res.json();
  if(!res.ok){regErr.textContent=data.error;regErr.classList.remove('hidden');return;}
  authCard.classList.add('hidden');
  onboarding.classList.remove('hidden');
};

document.getElementById('btn-continue').onclick = async () => {
  const budget = parseFloat(document.getElementById('budget-input').value) || 0;
  await fetch('/api/settings',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({monthly_budget:budget,currency:'MXN',theme:'dark'})});
  window.location.href='/app';
};

(async()=>{
  try{
    const me=await fetch('/api/auth/me');
    if(me.ok){window.location.href='/app';}
  }catch(e){}
})();
