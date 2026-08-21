const form = qs('#loginForm');
const passwordInput = qs('#password');
const errorMsg = qs('#errorMsg');
const accessBtn = qs('#accessBtn');
const togglePassword = qs('#togglePassword');

(async () => {
  try {
    await api('session');
    location.replace('/vault.html');
  } catch(_) {}
})();

togglePassword.addEventListener('click', () => {
  const reveal = passwordInput.type === 'password';
  passwordInput.type = reveal ? 'text' : 'password';
  togglePassword.setAttribute('aria-label', reveal ? 'Hide password' : 'Show password');
});

form.addEventListener('submit', async e => {
  e.preventDefault();
  errorMsg.textContent = '';
  const password = passwordInput.value;
  if(!password){ passwordInput.focus(); return; }
  accessBtn.disabled = true;
  accessBtn.querySelector('span').textContent = 'Checking access';
  try{
    await api('login', { method:'POST', body:JSON.stringify({password}) });
    accessBtn.querySelector('span').textContent = 'Access granted';
    setTimeout(() => location.replace('/vault.html'), 220);
  }catch(err){
    form.classList.remove('shake');
    void form.offsetWidth;
    form.classList.add('shake');
    errorMsg.innerHTML = `<span aria-hidden="true">×</span> Access denied. Check the password and try again.`;
    passwordInput.select();
    accessBtn.disabled = false;
    accessBtn.querySelector('span').textContent = 'Get access';
  }
});
