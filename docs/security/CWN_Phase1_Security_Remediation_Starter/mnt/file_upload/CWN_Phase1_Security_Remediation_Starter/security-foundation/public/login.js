const form = document.getElementById('loginForm');
const status = document.getElementById('status');

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  status.textContent = 'Signing in…';
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: form.username.value.trim(),
      password: form.password.value
    })
  });
  form.password.value = '';
  if (!response.ok) {
    status.textContent = 'Access denied.';
    return;
  }
  location.assign('/admin/');
});
