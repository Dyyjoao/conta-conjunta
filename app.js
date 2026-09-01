import { firebaseConfig } from './firebase-config.js';

const FIREBASE_SDK = '11.10.0';

const DEFAULT_CATEGORIES = [
  ['Moradia','expense'],['Alimentação','expense'],['Transporte','expense'],['Saúde','expense'],
  ['Educação','expense'],['Lazer','expense'],['Assinaturas','expense'],['Pets','expense'],
  ['Compras','expense'],['Impostos e taxas','expense'],['Não categorizado','expense'],
  ['Salário','income'],['Renda extra','income'],['Rendimentos','income'],['Outras receitas','income']
];

const state = {
  firebase: null, auth: null, db: null, user: null, profile: null, household: null,
  accounts: [], categories: [], transactions: [], budgets: [], members: [],
  page: 'dashboard', unsubs: [], registrationInProgress: false
};

const $ = id => document.getElementById(id);
const els = {
  authView:$('authView'), appView:$('appView'), pageContent:$('pageContent'),
  pageTitle:$('pageTitle'), pageEyebrow:$('pageEyebrow'), sidebar:$('sidebar'), toast:$('toast')
};

const money = value => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(value||0));
const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const todayISO = () => new Date().toISOString().slice(0,10);
const monthKey = date => {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
};
const toDate = v => v?.toDate ? v.toDate() : (v instanceof Date ? v : new Date(v));
const monthLabel = d => new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric'}).format(d);

function toast(message, timeout=3200){
  els.toast.textContent = message; els.toast.classList.remove('hidden');
  clearTimeout(toast.t); toast.t = setTimeout(()=>els.toast.classList.add('hidden'), timeout);
}

function setVisible(view){
  [els.authView,els.appView].forEach(v=>v.classList.add('hidden'));
  view.classList.remove('hidden');
}

async function loadFirebase(){
  const appMod = await import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK}/firebase-app.js`);
  const authMod = await import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK}/firebase-auth.js`);
  const fsMod = await import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK}/firebase-firestore.js`);
  return {...appMod,...authMod,...fsMod};
}

async function bootstrap(){
  bindStaticEvents();
  try {
    state.firebase = await loadFirebase();
    const app = state.firebase.initializeApp(firebaseConfig);
    state.auth = state.firebase.getAuth(app);
    state.db = state.firebase.getFirestore(app);
    state.firebase.onAuthStateChanged(state.auth, handleAuthState);
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(()=>{});
  } catch (err) {
    console.error(err);
    setVisible(els.authView);
    $('authError').textContent = 'Não consegui conectar ao Firebase. Verifique a internet e tente novamente.';
  }
}

function bindStaticEvents(){
  document.querySelectorAll('.auth-tab').forEach(btn=>btn.addEventListener('click',()=>switchAuthTab(btn.dataset.authTab)));
  document.querySelectorAll('input[name="registerMode"]').forEach(r=>r.addEventListener('change',toggleRegisterMode));
  $('loginForm').addEventListener('submit',login);
  $('registerForm').addEventListener('submit',register);
  $('logoutBtn').addEventListener('click',()=>state.firebase.signOut(state.auth));
  $('quickAddBtn').addEventListener('click',openTransactionDialog);
  $('menuBtn').addEventListener('click',()=>els.sidebar.classList.toggle('open'));
  $('mainNav').addEventListener('click',e=>{
    const btn=e.target.closest('[data-page]'); if(!btn)return;
    state.page=btn.dataset.page; document.querySelectorAll('.nav-item').forEach(x=>x.classList.toggle('active',x===btn));
    els.sidebar.classList.remove('open'); renderPage();
  });
  document.querySelectorAll('[data-close-dialog]').forEach(btn=>btn.addEventListener('click',()=>btn.closest('dialog').close()));
  $('transactionForm').addEventListener('submit',saveTransaction);
  $('accountForm').addEventListener('submit',saveAccount);
  $('budgetForm').addEventListener('submit',saveBudget);
  els.pageContent.addEventListener('click',handlePageClick);
  els.pageContent.addEventListener('change',handlePageChange);
}

function switchAuthTab(tab){
  document.querySelectorAll('.auth-tab').forEach(x=>x.classList.toggle('active',x.dataset.authTab===tab));
  $('loginForm').classList.toggle('hidden',tab!=='login'); $('registerForm').classList.toggle('hidden',tab!=='register');
  $('authError').textContent='';
}
function toggleRegisterMode(){
  const mode=document.querySelector('input[name="registerMode"]:checked').value;
  $('householdNameWrap').classList.toggle('hidden',mode!=='create'); $('inviteCodeWrap').classList.toggle('hidden',mode!=='join');
}

async function login(e){
  e.preventDefault(); $('authError').textContent='';
  try { await state.firebase.signInWithEmailAndPassword(state.auth,$('loginEmail').value.trim(),$('loginPassword').value); }
  catch(err){ $('authError').textContent = authMessage(err); }
}

async function register(e){
  e.preventDefault(); $('authError').textContent='';
  const name=$('registerName').value.trim(), email=$('registerEmail').value.trim(), password=$('registerPassword').value;
  const mode=document.querySelector('input[name="registerMode"]:checked').value;
  let credential;
  state.registrationInProgress = true;
  try {
    credential=await state.firebase.createUserWithEmailAndPassword(state.auth,email,password);
    if(mode==='create') await createHousehold(credential.user,name,email,$('householdName').value.trim() || 'Nossa casa');
    else await joinHousehold(credential.user,name,email,$('inviteCode').value.trim().toUpperCase());
    state.registrationInProgress = false;
    await handleAuthState(credential.user);
  } catch(err){
    console.error(err); $('authError').textContent = authMessage(err);
    if(credential?.user){ try{await state.firebase.deleteUser(credential.user);}catch(_){} }
    state.registrationInProgress = false;
  }
}

async function createHousehold(user,name,email,householdName){
  const f=state.firebase, db=state.db;
  const hhRef=f.doc(f.collection(db,'households'));
  const batch=f.writeBatch(db), now=f.serverTimestamp();
  batch.set(hhRef,{name:householdName,currency:'BRL',locale:'pt-BR',createdBy:user.uid,createdAt:now,updatedAt:now,members:{[user.uid]:{role:'owner',joinedAt:now}}});
  batch.set(f.doc(db,'users',user.uid),{displayName:name,email,householdId:hhRef.id,createdAt:now,updatedAt:now});
  await batch.commit();
  await seedHouseholdDefaults(hhRef.id,user.uid);
}

async function seedHouseholdDefaults(householdId,userId){
  const f=state.firebase, db=state.db, batch=f.writeBatch(db), now=f.serverTimestamp();
  const accountRef=f.doc(f.collection(db,'households',householdId,'accounts'));
  batch.set(accountRef,{name:'Conta principal',type:'checking',ownership:'joint',initialBalance:0,active:true,createdBy:userId,createdAt:now,updatedAt:now});
  for(const [catName,type] of DEFAULT_CATEGORIES){
    const ref=f.doc(f.collection(db,'households',householdId,'categories'));
    batch.set(ref,{name:catName,type,active:true,systemDefault:true,createdAt:now,updatedAt:now});
  }
  await batch.commit();
}

async function joinHousehold(user,name,email,code){
  if(!code) throw new Error('Informe o código do casal.');
  const f=state.firebase, db=state.db, inviteRef=f.doc(db,'invites',code);
  const inviteSnap=await f.getDoc(inviteRef);
  if(!inviteSnap.exists()) throw new Error('Código do casal não encontrado.');
  const invite=inviteSnap.data(), hhRef=f.doc(db,'households',invite.householdId);
  await f.setDoc(f.doc(db,'joinClaims',user.uid),{code,householdId:invite.householdId,createdAt:f.serverTimestamp()});
  try{
    await f.runTransaction(db,async tx=>{
      const hhSnap=await tx.get(hhRef); if(!hhSnap.exists()) throw new Error('Conta Conjunta não encontrada.');
      const members=hhSnap.data().members||{}; if(Object.keys(members).length>=2) throw new Error('Este casal já possui dois usuários vinculados.');
      tx.update(hhRef,{[`members.${user.uid}`]:{role:'member',joinedAt:f.serverTimestamp()},updatedAt:f.serverTimestamp()});
      tx.set(f.doc(db,'users',user.uid),{displayName:name,email,householdId:invite.householdId,createdAt:f.serverTimestamp(),updatedAt:f.serverTimestamp()});
    });
  } finally { await f.deleteDoc(f.doc(db,'joinClaims',user.uid)).catch(()=>{}); }
}

function authMessage(err){
  const map={
    'auth/invalid-credential':'E-mail ou senha inválidos.','auth/email-already-in-use':'Este e-mail já possui cadastro.',
    'auth/weak-password':'A senha precisa ter pelo menos 6 caracteres.','auth/invalid-email':'E-mail inválido.',
    'auth/too-many-requests':'Muitas tentativas. Aguarde um pouco e tente novamente.'
  };
  return map[err?.code] || err?.message || 'Não foi possível concluir a operação.';
}

async function handleAuthState(user){
  if (user && state.registrationInProgress) return;
  clearListeners(); state.user=user;
  if(!user){ state.profile=null; state.household=null; setVisible(els.authView); return; }
  try{
    const f=state.firebase, profileSnap=await f.getDoc(f.doc(state.db,'users',user.uid));
    if(!profileSnap.exists()) throw new Error('Seu cadastro existe no Authentication, mas o perfil financeiro não foi concluído.');
    state.profile={id:profileSnap.id,...profileSnap.data()};
    const hhSnap=await f.getDoc(f.doc(state.db,'households',state.profile.householdId));
    if(!hhSnap.exists()) throw new Error('Não encontrei a Conta Conjunta vinculada ao seu usuário.');
    state.household={id:hhSnap.id,...hhSnap.data()};
    hydrateHeader(); subscribeData(); setVisible(els.appView); renderPage();
  }catch(err){ console.error(err); await state.firebase.signOut(state.auth); alert(err.message); }
}

function clearListeners(){ state.unsubs.forEach(fn=>{try{fn()}catch(_){}}); state.unsubs=[]; }
function subscribeData(){
  const f=state.firebase, db=state.db, hid=state.household.id;
  const watch=(q,key,sorter)=>state.unsubs.push(f.onSnapshot(q,s=>{state[key]=s.docs.map(d=>({id:d.id,...d.data()})); if(sorter)state[key].sort(sorter); refreshSelects(); renderPage();},err=>{console.error(err); toast('Falha ao sincronizar dados do Firebase.');}));
  watch(f.query(f.collection(db,'households',hid,'accounts')),'accounts',(a,b)=>a.name.localeCompare(b.name));
  watch(f.query(f.collection(db,'households',hid,'categories')),'categories',(a,b)=>a.name.localeCompare(b.name));
  watch(f.query(f.collection(db,'households',hid,'transactions'),f.orderBy('date','desc'),f.limit(1500)),'transactions');
  watch(f.query(f.collection(db,'households',hid,'budgets')),'budgets');
  watch(f.query(f.collection(db,'users'),f.where('householdId','==',hid)),'members',(a,b)=>a.displayName.localeCompare(b.displayName));
}

function hydrateHeader(){
  $('householdNameLabel').textContent=state.household.name; $('userNameLabel').textContent=state.profile.displayName;
  const role=state.household.members?.[state.user.uid]?.role==='owner'?'Administrador':'Membro'; $('userRoleLabel').textContent=role;
  $('userInitials').textContent=state.profile.displayName.split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();
}

function refreshSelects(){
  const accountOptions=state.accounts.filter(a=>a.active!==false).map(a=>`<option value="${a.id}">${esc(a.name)}</option>`).join('');
  const type=$('txType')?.value||'expense';
  const catOptions=state.categories.filter(c=>c.active!==false && c.type===type).map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('');
  if($('txAccount')) $('txAccount').innerHTML=accountOptions;
  if($('txCategory')) $('txCategory').innerHTML=catOptions;
  if($('budgetCategory')) $('budgetCategory').innerHTML=state.categories.filter(c=>c.type==='expense'&&c.active!==false).map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('');
}
$('txType').addEventListener('change',refreshSelects);

function currentMonthTransactions(){ const k=monthKey(new Date()); return state.transactions.filter(t=>monthKey(toDate(t.date))===k); }
function realized(t){return t.status==='paid'}
function accountBalance(account){
  let value=Number(account.initialBalance||0);
  for(const t of state.transactions){ if(t.accountId!==account.id || !realized(t)) continue; value += t.type==='income'?Number(t.amount||0):-Number(t.amount||0); }
  return value;
}
function totalBalance(){return state.accounts.filter(a=>a.active!==false).reduce((s,a)=>s+accountBalance(a),0)}
function categoryName(id){return state.categories.find(c=>c.id===id)?.name||'Sem categoria'}
function accountName(id){return state.accounts.find(a=>a.id===id)?.name||'Conta removida'}
function memberName(uid){return state.members.find(m=>m.id===uid)?.displayName||'Usuário'}

const pageMeta={
  dashboard:['VISÃO GERENCIAL','Visão do mês'],transactions:['MOVIMENTAÇÃO','Lançamentos'],statement:['CONCILIAÇÃO','Extrato'],cashflow:['PROJEÇÃO','Fluxo de caixa'],
  budget:['PLANEJAMENTO','Orçamento'],cards:['CRÉDITO','Cartões'],investments:['PATRIMÔNIO','Investimentos'],reserves:['OBJETIVOS','Reservas'],settings:['ADMINISTRAÇÃO','Configurações']
};
function renderPage(){
  if(!state.household||!els.pageContent)return; const [eye,title]=pageMeta[state.page]||pageMeta.dashboard; els.pageEyebrow.textContent=eye; els.pageTitle.textContent=title;
  const renderers={dashboard:renderDashboard,transactions:renderTransactions,statement:renderStatement,cashflow:renderCashflow,budget:renderBudget,cards:()=>renderFuture('Cartões','A estrutura segura já está reservada no Firestore. O próximo bloco implementa fatura, fechamento, vencimento e vínculo automático de compras.'),investments:()=>renderFuture('Investimentos','A coleção já está isolada por casal. A próxima etapa implementa posição, aportes, rentabilidade e consolidação patrimonial.'),reserves:()=>renderFuture('Reservas','A coleção já está isolada por casal. A próxima etapa transforma metas e reservas em objetivos com prazo, aporte e progresso.'),settings:renderSettings};
  els.pageContent.innerHTML=renderers[state.page]();
}

function renderDashboard(){
  const tx=currentMonthTransactions(), paid=tx.filter(realized), incomes=paid.filter(t=>t.type==='income').reduce((s,t)=>s+Number(t.amount),0), expenses=paid.filter(t=>t.type==='expense').reduce((s,t)=>s+Number(t.amount),0), result=incomes-expenses;
  const planned=tx.filter(t=>t.status==='planned').reduce((s,t)=>s+(t.type==='income'?Number(t.amount):-Number(t.amount)),0);
  const recent=state.transactions.slice(0,7);
  const budgetRows=budgetProgressRows();
  return `<div class="kpi-grid">
    ${kpi('Saldo total',money(totalBalance()),'Soma das contas realizadas')}
    ${kpi('Receitas do mês',money(incomes),monthLabel(new Date()))}
    ${kpi('Despesas do mês',money(expenses),`${paid.filter(t=>t.type==='expense').length} lançamentos`)}
    ${kpi('Resultado do mês',money(result),`Previstos líquidos: ${money(planned)}`)}
  </div>
  <div class="grid-2"><section class="panel"><div class="panel-header"><h2>Movimentações recentes</h2><button class="btn ghost" data-go="transactions">Ver todas</button></div>${transactionTable(recent)}</section>
  <section class="panel"><div class="panel-header"><h2>Orçamento do mês</h2><button class="btn ghost" data-go="budget">Planejar</button></div>${budgetRows.length?budgetRows.slice(0,6).map(progressHtml).join(''):'<div class="empty-state"><strong>Orçamento ainda não definido</strong>Crie limites por categoria para acompanhar o consumo do mês.</div>'}</section></div>`;
}
function kpi(label,value,delta){return `<article class="kpi-card"><div class="label">${esc(label)}</div><div class="value">${esc(value)}</div><div class="delta">${esc(delta)}</div></article>`}

function transactionTable(list){
  if(!list.length)return '<div class="empty-state"><strong>Nenhum lançamento</strong>Cadastre a primeira receita ou despesa do casal.</div>';
  return `<div class="table-wrap"><table class="data-table"><thead><tr><th>Data</th><th>Descrição</th><th>Conta</th><th>Categoria</th><th>Escopo</th><th>Status</th><th>Valor</th><th></th></tr></thead><tbody>${list.map(t=>`<tr>
    <td>${toDate(t.date).toLocaleDateString('pt-BR')}</td><td><strong>${esc(t.description)}</strong>${t.source==='ofx'?'<br><span class="badge">OFX</span>':''}</td><td>${esc(accountName(t.accountId))}</td><td>${esc(categoryName(t.categoryId))}</td>
    <td><span class="badge ${t.scope||'shared'}">${t.scope==='personal'?'Pessoal':'Compartilhada'}</span></td><td><span class="badge">${t.status==='planned'?'Previsto':'Realizado'}</span></td>
    <td class="money ${t.type}">${t.type==='expense'?'- ':'+ '}${money(t.amount)}</td><td><button class="icon-btn" data-delete-tx="${t.id}" title="Excluir">×</button></td></tr>`).join('')}</tbody></table></div>`;
}

function renderTransactions(){
  return `<section class="panel"><div class="panel-header"><div><h2>Lançamentos</h2><div class="muted">Receitas e despesas do casal em tempo real.</div></div><div class="panel-actions"><button class="btn ghost" data-action="import-ofx">Importar OFX</button><button class="btn primary" data-action="new-tx">+ Lançamento</button></div></div>${transactionTable(state.transactions)}</section>
  <input id="ofxFileInput" class="hidden" type="file" accept=".ofx,.qfx,text/plain" />`;
}

function renderStatement(){
  const paid=state.transactions.filter(realized), income=paid.filter(t=>t.type==='income').reduce((s,t)=>s+Number(t.amount),0), expense=paid.filter(t=>t.type==='expense').reduce((s,t)=>s+Number(t.amount),0);
  return `<section class="panel"><div class="panel-header"><div><h2>Extrato consolidado</h2><div class="muted">Somente movimentações realizadas.</div></div></div><div class="summary-strip"><span>Entradas <strong>${money(income)}</strong></span><span>Saídas <strong>${money(expense)}</strong></span><span>Saldo movimentado <strong>${money(income-expense)}</strong></span></div><div style="height:14px"></div>${transactionTable(paid)}</section>`;
}

function renderCashflow(){
  const now=new Date(); now.setHours(0,0,0,0); const horizon=new Date(now); horizon.setDate(horizon.getDate()+30);
  const upcoming=state.transactions.filter(t=>t.status==='planned'&&toDate(t.date)>=now&&toDate(t.date)<=horizon).sort((a,b)=>toDate(a.date)-toDate(b.date));
  let projected=totalBalance(), rows=[];
  for(const t of upcoming){projected+=t.type==='income'?Number(t.amount):-Number(t.amount);rows.push({...t,projected});}
  return `<div class="kpi-grid">${kpi('Saldo realizado',money(totalBalance()),'Base atual')}${kpi('Saldo projetado D+30',money(projected),'Realizado + previstos')}${kpi('Entradas previstas',money(upcoming.filter(t=>t.type==='income').reduce((s,t)=>s+Number(t.amount),0)),'Próximos 30 dias')}${kpi('Saídas previstas',money(upcoming.filter(t=>t.type==='expense').reduce((s,t)=>s+Number(t.amount),0)),'Próximos 30 dias')}</div><section class="panel"><div class="panel-header"><h2>Agenda financeira D+30</h2></div>${upcoming.length?`<div class="table-wrap"><table class="data-table"><thead><tr><th>Data</th><th>Descrição</th><th>Tipo</th><th>Valor</th><th>Saldo projetado</th></tr></thead><tbody>${rows.map(t=>`<tr><td>${toDate(t.date).toLocaleDateString('pt-BR')}</td><td>${esc(t.description)}</td><td>${t.type==='income'?'Entrada':'Saída'}</td><td class="money ${t.type}">${money(t.amount)}</td><td class="money">${money(t.projected)}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty-state"><strong>Sem previsões nos próximos 30 dias</strong>Lançamentos com status Previsto aparecerão aqui automaticamente.</div>'}</section>`;
}

function budgetProgressRows(){
  const k=monthKey(new Date()), tx=currentMonthTransactions().filter(t=>realized(t)&&t.type==='expense');
  return state.budgets.filter(b=>b.month===k).map(b=>{
    const spent=tx.filter(t=>t.categoryId===b.categoryId).reduce((s,t)=>s+Number(t.amount),0), limit=Number(b.amount||0), pct=limit?spent/limit*100:0;
    return {categoryId:b.categoryId,name:categoryName(b.categoryId),spent,limit,pct};
  }).sort((a,b)=>b.pct-a.pct);
}
function progressHtml(r){return `<div class="progress-row"><div class="progress-meta"><span>${esc(r.name)}</span><strong>${money(r.spent)} / ${money(r.limit)}</strong></div><div class="progress ${r.pct>100?'over':''}"><span style="width:${Math.min(100,r.pct)}%"></span></div><div class="muted">${r.pct.toFixed(0)}% utilizado</div></div>`}
function renderBudget(){
  const rows=budgetProgressRows();
  return `<section class="panel"><div class="panel-header"><div><h2>Orçamento · ${esc(monthLabel(new Date()))}</h2><div class="muted">Limites por categoria comparados ao realizado.</div></div><button class="btn primary" data-action="new-budget">+ Definir limite</button></div>${rows.length?rows.map(progressHtml).join(''):'<div class="empty-state"><strong>Nenhum limite cadastrado</strong>Comece pelas categorias que mais pressionam o orçamento do casal.</div>'}</section>`;
}

function renderFuture(title,text){return `<section class="panel"><div class="panel-header"><h2>${esc(title)}</h2></div><div class="feature-note">${esc(text)}</div></section>`}

function renderSettings(){
  const accounts=state.accounts.map(a=>`<article class="account-card"><h3>${esc(a.name)}</h3><div class="muted">${a.ownership==='personal'?'Pessoal':'Conjunta'} · ${esc(a.type)}</div><div class="balance">${money(accountBalance(a))}</div></article>`).join('');
  const people=state.members.map(m=>`<div class="progress-meta"><span>${esc(m.displayName)}</span><span class="badge">${state.household.members?.[m.id]?.role==='owner'?'Administrador':'Membro'}</span></div>`).join('');
  return `<div class="settings-grid">
    <section class="panel"><div class="panel-header"><div><h2>Contas financeiras</h2><div class="muted">Saldos são calculados pelos lançamentos realizados.</div></div><button class="btn primary" data-action="new-account">+ Conta</button></div><div class="account-list">${accounts||'<div class="empty-state"><strong>Sem contas</strong>Cadastre uma conta financeira.</div>'}</div></section>
    <section class="panel"><div class="panel-header"><h2>Pessoas vinculadas</h2></div><div style="display:grid;gap:12px">${people}</div><div style="height:18px"></div>${Object.keys(state.household.members||{}).length<2?'<button class="btn primary full" data-action="create-invite">Gerar código para meu par</button>':'<div class="feature-note">O casal já possui dois usuários vinculados.</div>'}<div id="inviteResult"></div></section>
    <section class="panel"><div class="panel-header"><h2>Firebase</h2></div><p class="muted">Projeto conectado: <strong>${esc(firebaseConfig.projectId)}</strong></p><p class="muted">Integração nativa do Conta Conjunta. A proteção dos dados é controlada pelo Authentication e pelas regras do Firestore.</p></section>
    <section class="panel"><div class="panel-header"><h2>Base do casal</h2></div><p><strong>${esc(state.household.name)}</strong></p><p class="muted">Moeda: BRL · Localidade: pt-BR</p><p class="muted">ID interno: ${esc(state.household.id)}</p></section>
  </div>`;
}

async function handlePageClick(e){
  const go=e.target.closest('[data-go]'); if(go){state.page=go.dataset.go;document.querySelectorAll('.nav-item').forEach(x=>x.classList.toggle('active',x.dataset.page===state.page));renderPage();return;}
  const action=e.target.closest('[data-action]')?.dataset.action;
  if(action==='new-tx')openTransactionDialog();
  if(action==='new-account')openAccountDialog();
  if(action==='new-budget')openBudgetDialog();
  if(action==='create-invite')createInvite();
  if(action==='import-ofx') $('ofxFileInput')?.click();
  const del=e.target.closest('[data-delete-tx]')?.dataset.deleteTx;
  if(del) deleteTransaction(del);
}
function handlePageChange(e){ if(e.target?.id==='ofxFileInput'&&e.target.files?.[0]) importOfx(e.target.files[0]); }

function openTransactionDialog(){
  if(!state.accounts.length){toast('Cadastre uma conta financeira antes do primeiro lançamento.'); state.page='settings';renderPage();return;}
  $('transactionForm').reset(); $('transactionId').value=''; $('txDate').value=todayISO(); $('txStatus').value='paid'; $('txType').value='expense'; $('transactionError').textContent=''; refreshSelects(); $('transactionDialog').showModal();
}
async function saveTransaction(e){
  e.preventDefault(); const f=state.firebase, hid=state.household.id;
  try{
    const data={type:$('txType').value,date:f.Timestamp.fromDate(new Date(`${$('txDate').value}T12:00:00`)),description:$('txDescription').value.trim(),amount:Number($('txAmount').value),status:$('txStatus').value,accountId:$('txAccount').value,categoryId:$('txCategory').value,scope:$('txScope').value,notes:$('txNotes').value.trim(),createdBy:state.user.uid,updatedAt:f.serverTimestamp()};
    if(!data.description||data.amount<=0||!data.accountId||!data.categoryId)throw new Error('Preencha descrição, valor, conta e categoria.');
    await f.addDoc(f.collection(state.db,'households',hid,'transactions'),{...data,createdAt:f.serverTimestamp(),source:'manual'});
    $('transactionDialog').close(); toast('Lançamento salvo.');
  }catch(err){$('transactionError').textContent=err.message;}
}
async function deleteTransaction(id){
  if(!confirm('Excluir este lançamento?'))return;
  try{await state.firebase.deleteDoc(state.firebase.doc(state.db,'households',state.household.id,'transactions',id));toast('Lançamento excluído.');}catch(err){toast('Não foi possível excluir o lançamento.');}
}

function openAccountDialog(){ $('accountForm').reset(); $('accountInitialBalance').value='0'; $('accountDialog').showModal(); }
async function saveAccount(e){
  e.preventDefault(); const f=state.firebase;
  await f.addDoc(f.collection(state.db,'households',state.household.id,'accounts'),{name:$('accountName').value.trim(),type:$('accountType').value,ownership:$('accountOwnership').value,initialBalance:Number($('accountInitialBalance').value||0),active:true,createdBy:state.user.uid,createdAt:f.serverTimestamp(),updatedAt:f.serverTimestamp()});
  $('accountDialog').close(); toast('Conta criada.');
}
function openBudgetDialog(){ $('budgetForm').reset(); refreshSelects(); $('budgetDialog').showModal(); }
async function saveBudget(e){
  e.preventDefault(); const f=state.firebase, categoryId=$('budgetCategory').value, month=monthKey(new Date()), id=`${month}_${categoryId}`;
  await f.setDoc(f.doc(state.db,'households',state.household.id,'budgets',id),{month,categoryId,amount:Number($('budgetAmount').value),updatedBy:state.user.uid,updatedAt:f.serverTimestamp(),createdAt:f.serverTimestamp()},{merge:true});
  $('budgetDialog').close();toast('Orçamento atualizado.');
}

async function createInvite(){
  const f=state.firebase, code=randomCode(8), ref=f.doc(state.db,'invites',code), expires=new Date(Date.now()+7*24*60*60*1000);
  try{
    await f.setDoc(ref,{householdId:state.household.id,createdBy:state.user.uid,createdAt:f.serverTimestamp(),expiresAt:f.Timestamp.fromDate(expires)});
    const box=$('inviteResult'); if(box)box.innerHTML=`<div style="height:14px"></div><div class="code-box">${code}</div><p class="muted">Válido por 7 dias. Seu par cria o próprio login e escolhe “Entrar com código do casal”.</p>`;
  }catch(err){console.error(err);toast('Somente o administrador pode gerar o código do casal.');}
}
function randomCode(size){const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';const bytes=new Uint8Array(size);crypto.getRandomValues(bytes);return [...bytes].map(b=>chars[b%chars.length]).join('');}

function parseOfx(text){
  const blocks=text.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi)||[];
  const val=(block,tag)=>{const m=block.match(new RegExp(`<${tag}>([^<\\r\\n]+)`,'i'));return m?m[1].trim():''};
  return blocks.map(b=>{
    const amount=Number(val(b,'TRNAMT').replace(',','.')), raw=val(b,'DTPOSTED'), y=raw.slice(0,4),m=raw.slice(4,6),d=raw.slice(6,8);
    return {fitid:val(b,'FITID'),date:new Date(`${y}-${m}-${d}T12:00:00`),amount:Math.abs(amount),type:amount>=0?'income':'expense',description:val(b,'MEMO')||val(b,'NAME')||'Movimentação OFX'};
  }).filter(x=>x.amount>0&&!Number.isNaN(x.date.getTime()));
}
async function sha256(text){const data=new TextEncoder().encode(text),hash=await crypto.subtle.digest('SHA-256',data);return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('');}
async function importOfx(file){
  if(!state.accounts.length){toast('Cadastre a conta bancária antes de importar OFX.');return;}
  let account=state.accounts[0];
  if(state.accounts.length>1){
    const options=state.accounts.map((a,i)=>`${i+1} - ${a.name}`).join('\n');
    const chosen=Number(prompt(`Em qual conta este OFX deve ser lançado?\n\n${options}`, '1'));
    if(!Number.isInteger(chosen)||chosen<1||chosen>state.accounts.length){toast('Importação cancelada: selecione uma conta válida.');return;}
    account=state.accounts[chosen-1];
  }
  const content=await file.text(), rows=parseOfx(content);
  if(!rows.length){toast('Não encontrei lançamentos válidos nesse OFX.');return;}
  if(rows.length>200){toast('Por segurança, importe arquivos com até 200 movimentações por vez.');return;}
  const f=state.firebase, hid=state.household.id, expenseCat=state.categories.find(c=>c.type==='expense'&&c.name==='Não categorizado')||state.categories.find(c=>c.type==='expense'), incomeCat=state.categories.find(c=>c.type==='income');
  let imported=0, skipped=0;
  for(const row of rows){
    const key=await sha256(`${account.id}|${row.fitid||''}|${row.date.toISOString().slice(0,10)}|${row.amount}|${row.description}`), marker=f.doc(state.db,'households',hid,'ofxImports',key);
    if((await f.getDoc(marker)).exists()){skipped++;continue;}
    const batch=f.writeBatch(state.db), txRef=f.doc(f.collection(state.db,'households',hid,'transactions'));
    batch.set(txRef,{type:row.type,date:f.Timestamp.fromDate(row.date),description:row.description,amount:row.amount,status:'paid',accountId:account.id,categoryId:row.type==='income'?incomeCat?.id:expenseCat?.id,scope:'shared',notes:'',createdBy:state.user.uid,source:'ofx',fitid:row.fitid||'',createdAt:f.serverTimestamp(),updatedAt:f.serverTimestamp()});
    batch.set(marker,{transactionId:txRef.id,fitid:row.fitid||'',accountId:account.id,importedBy:state.user.uid,createdAt:f.serverTimestamp()}); await batch.commit(); imported++;
  }
  toast(`OFX concluído: ${imported} importados, ${skipped} duplicados ignorados.`,5000);
}

bootstrap();
