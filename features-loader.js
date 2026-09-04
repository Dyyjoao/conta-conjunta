const style=document.createElement('link');style.rel='stylesheet';style.href='./features.css';style.dataset.ccFeatures='1';if(!document.querySelector('link[data-cc-features]'))document.head.appendChild(style);
Promise.all([
 import('./ofx-enhancements.js'),
 import('./cards-enhancements.js'),
 import('./investments-enhancements.js'),
 import('./reserves-enhancements.js'),
 import('./accounts-enhancements.js'),
 import('./transactions-enhancements.js'),
 import('./income-expense-pages.js')
]).catch(err=>console.error('Falha ao carregar módulos do Conta Conjunta',err));
