let loaded = false;

async function loadEnhancements() {
  if (loaded) return;
  const app = document.getElementById('appView');
  if (!app || app.classList.contains('hidden')) return;

  loaded = true;
  const results = await Promise.allSettled([
    import('./dashboard-enhancements.js'),
    import('./categories-enhancements.js'),
    import('./features-loader.js')
  ]);

  const failed = results.filter(r => r.status === 'rejected');
  if (failed.length) {
    console.error('Conta Conjunta: alguns módulos extras falharam', failed.map(x => x.reason));
    const toast = document.getElementById('toast');
    if (toast) {
      toast.textContent = 'O app abriu, mas alguns recursos extras não carregaram. Atualize a página.';
      toast.classList.remove('hidden');
      setTimeout(() => toast.classList.add('hidden'), 5000);
    }
  }
}

const app = document.getElementById('appView');
if (app) {
  new MutationObserver(loadEnhancements).observe(app, { attributes: true, attributeFilter: ['class'] });
}
loadEnhancements();
