(() => {
  const ready = () => {
    const auth = document.getElementById('authView');
    const app = document.getElementById('appView');
    return (auth && !auth.classList.contains('hidden')) || (app && !app.classList.contains('hidden'));
  };

  const revealFallback = (message) => {
    if (ready()) return;
    const auth = document.getElementById('authView');
    const app = document.getElementById('appView');
    if (app) app.classList.add('hidden');
    if (auth) auth.classList.remove('hidden');
    const error = document.getElementById('authError');
    if (error && !error.textContent) error.textContent = message;
  };

  window.addEventListener('error', event => {
    console.error('Conta Conjunta: erro de inicialização', event.error || event.message);
    revealFallback('O aplicativo encontrou um erro ao iniciar. Atualize a página; se persistir, o erro já está sendo tratado.');
  });

  window.addEventListener('unhandledrejection', event => {
    console.error('Conta Conjunta: promessa rejeitada', event.reason);
    revealFallback('O aplicativo encontrou um erro ao iniciar. Atualize a página; se persistir, o erro já está sendo tratado.');
  });

  window.setTimeout(() => {
    if (!ready()) {
      revealFallback('A inicialização demorou mais que o esperado. Verifique a conexão e atualize a página.');
    }
  }, 5000);
})();
