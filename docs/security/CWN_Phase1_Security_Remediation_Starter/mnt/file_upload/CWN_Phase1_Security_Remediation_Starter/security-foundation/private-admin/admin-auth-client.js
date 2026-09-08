let csrfToken = '';

async function requireSession() {
  const response = await fetch('/api/auth/session', { credentials: 'same-origin', cache: 'no-store' });
  if (!response.ok) {
    location.replace('/login.html');
    return null;
  }
  const session = await response.json();
  csrfToken = session.csrf;
  const target = document.getElementById('identity');
  if (target) target.textContent = `Signed in as ${session.user.username} (${session.user.role})`;
  return session;
}

async function logout() {
  await fetch('/api/auth/logout', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'X-CWN-CSRF': csrfToken }
  });
  location.replace('/login.html');
}

document.getElementById('logout')?.addEventListener('click', logout);

export const session = await requireSession();
export { requireSession, logout };
