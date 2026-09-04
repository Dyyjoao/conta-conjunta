import { firebaseConfig } from './firebase-config.js';
const SDK='11.10.0';
const money=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v||0));
const toDate=v=>v?.toDate?v.toDate():(v instanceof Date?v:new Date(v));
const mk=v=>{const d=toDate(v);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`};
const kpi=(label,value,delta)=>`<article class="kpi-card"><div class="label">${label}</div><div class="value">${value}</div><div class="delta">${delta}</div></article>`;
let f,db,auth,hid,accounts=[],transactions=[],investments=[],unsubs=[];

async function start(){
  const [a,b,c]=await Promise.all([
    import(`https://www.gstatic.com/firebasejs/${SDK}/firebase-app.js`),
    import(`https://www.gstatic.com/firebasejs/${SDK}/firebase-auth.js`),
    import(`https://www.gstatic.com/firebasejs/${SDK}/firebase-firestore.js`)
  ]);
  f={...a,...b,...c}; const app=f.getApps().length?f.getApp():f.initializeApp(firebaseConfig); auth=f.getAuth(app); db=f.getFirestore(app);
  new MutationObserver(()=>queueMicrotask(render)).observe(document.body,{childList:true,subtree:true});
  f.onAuthStateChanged(auth,async user=>{
    unsubs.forEach(x=>x());unsubs=[];hid=null;if(!user)return;
    const p=await f.getDoc(f.doc(db,'users',user.uid));if(!p.exists())return;hid=p.data().householdId;
    unsubs.push(f.onSnapshot(f.collection(db,'households',hid,'accounts'),s=>{accounts=s.docs.map(d=>({id:d.id,...d.data()}));render();}));
    unsubs.push(f.onSnapshot(f.collection(db,'households',hid,'transactions'),s=>{transactions=s.docs.map(d=>({id:d.id,...d.data()}));render();}));
    unsubs.push(f.onSnapshot(f.collection(db,'households',hid,'investments'),s=>{investments=s.docs.map(d=>({id:d.id,...d.data()}));render();}));
  });
}
function balance(a){let v=Number(a.initialBalance||0);for(const t of transactions){if(t.accountId!==a.id||t.status!=='paid')continue;v+=t.type==='income'?Number(t.amount||0):-Number(t.amount||0)}return v}
function render(){
  if(!hid||document.getElementById('pageTitle')?.textContent.trim()!=='Visão do mês')return;
  const page=document.getElementById('pageContent'),base=page?.querySelector(':scope > .kpi-grid');if(!base)return;page.querySelector('#ccProjection')?.remove();
  const key=mk(new Date()),month=transactions.filter(t=>mk(t.date)===key),paid=month.filter(t=>t.status==='paid'),planned=month.filter(t=>t.status==='planned');
  const ri=paid.filter(t=>t.type==='income').reduce((s,t)=>s+Number(t.amount||0),0),re=paid.filter(t=>t.type==='expense').reduce((s,t)=>s+Number(t.amount||0),0);
  const pi=planned.filter(t=>t.type==='income').reduce((s,t)=>s+Number(t.amount||0),0),pe=planned.filter(t=>t.type==='expense').reduce((s,t)=>s+Number(t.amount||0),0);
  const active=accounts.filter(a=>a.active!==false),available=active.filter(a=>a.type!=='investment').reduce((s,a)=>s+balance(a),0),investmentAccounts=active.filter(a=>a.type==='investment').reduce((s,a)=>s+balance(a),0),portfolio=investments.filter(x=>x.active!==false).reduce((s,x)=>s+Number(x.currentValue||0),0),invested=portfolio>0?portfolio:investmentAccounts,total=available+invested;
  const first=base.querySelector('.kpi-card');if(first){first.querySelector('.label').textContent='Saldo em contas';first.querySelector('.value').textContent=money(active.reduce((s,a)=>s+balance(a),0));first.querySelector('.delta').textContent='Saldos realizados das contas financeiras';}
  const block=document.createElement('div');block.id='ccProjection';block.innerHTML=`
  <section class="cc-enh-block"><div class="cc-section-title"><div><div class="eyebrow">FECHAMENTO DO MÊS</div><h2>Realizado + previsto</h2></div></div><div class="kpi-grid">
  ${kpi('Receitas projetadas',money(ri+pi),`Realizado ${money(ri)} + previsto ${money(pi)}`)}
  ${kpi('Despesas projetadas',money(re+pe),`Realizado ${money(re)} + previsto ${money(pe)}`)}
  ${kpi('Resultado projetado',money((ri+pi)-(re+pe)),'Receitas − despesas')}
  ${kpi('Disponível projetado',money(available+pi-pe),'Saldo líquido + previsões do mês')}</div></section>
  <section class="cc-enh-block"><div class="cc-section-title"><div><div class="eyebrow">POSIÇÃO FINANCEIRA</div><h2>Patrimônio e liquidez</h2></div></div><div class="kpi-grid">
  ${kpi('Patrimônio financeiro',money(total),'Disponível + investimentos')}
  ${kpi('Saldo disponível',money(available),'Líquido de investimentos')}
  ${kpi('Investimentos',money(invested),portfolio>0?'Carteira cadastrada':'Contas tipo investimento')}
  ${kpi('% investido',`${total?((invested/total)*100).toFixed(1):'0.0'}%`,'Participação no patrimônio')}</div></section>`;
  base.insertAdjacentElement('afterend',block);
}
start().catch(console.error);
