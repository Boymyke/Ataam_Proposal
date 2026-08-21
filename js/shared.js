const API = '/api/vault';

function qs(selector, scope = document){ return scope.querySelector(selector); }
function qsa(selector, scope = document){ return [...scope.querySelectorAll(selector)]; }

async function api(op, options = {}){
  const res = await fetch(`${API}?op=${encodeURIComponent(op)}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  const data = await res.json().catch(() => ({}));
  if(!res.ok){
    const err = new Error(data.error || 'Something went wrong.');
    err.status = res.status;
    throw err;
  }
  return data;
}

function showToast(message){
  const toast = qs('#toast');
  if(!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => toast.classList.remove('show'), 2400);
}

async function logout(){
  try { await api('logout', { method:'POST', body:'{}' }); } catch(_) {}
  location.replace('/');
}

function initCursorGlow(){
  const glow = qs('#cursorGlow');
  if(!glow || matchMedia('(pointer:coarse)').matches) return;
  window.addEventListener('pointermove', e => {
    glow.style.left = `${e.clientX}px`;
    glow.style.top = `${e.clientY}px`;
  }, {passive:true});
}

function escapeHTML(value=''){
  return String(value).replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
}

function safeUrl(value=''){
  try{
    const u = new URL(value);
    return ['http:','https:'].includes(u.protocol) ? u.href : '#';
  }catch(_){ return '#'; }
}

initCursorGlow();
qs('#logoutBtn')?.addEventListener('click', logout);
