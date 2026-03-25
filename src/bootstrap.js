function renderStaticServerMessage() {
  const root = document.getElementById('root');

  if (!root) {
    return;
  }

  root.innerHTML = `
    <main style="font-family: sans-serif; max-width: 720px; margin: 4rem auto; padding: 0 1.5rem; line-height: 1.5;">
      <h1>Jumpchain Tracker</h1>
      <p>This source entry needs the Vite dev server or a built app bundle.</p>
      <p>Run <code>npm run dev</code> for development, or <code>npm run build</code> and serve <code>dist/index.html</code>.</p>
    </main>
  `;
}

async function redirectToBuiltApp() {
  const candidateUrls = [
    new URL('./dist/index.html', window.location.href),
    new URL('./docs/index.html', window.location.href),
  ];

  for (const candidateUrl of candidateUrls) {
    try {
      const response = await fetch(candidateUrl, { cache: 'no-store' });

      if (response.ok) {
        window.location.replace(candidateUrl.href);
        return true;
      }
    } catch {
      // Ignore and continue to the next candidate.
    }
  }

  return false;
}

async function start() {
  if (import.meta.env?.DEV || import.meta.env?.PROD) {
    await import('./main.tsx');
    return;
  }

  const redirected = await redirectToBuiltApp();

  if (!redirected) {
    renderStaticServerMessage();
  }
}

void start();
