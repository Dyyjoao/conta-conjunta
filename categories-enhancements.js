import { firebaseConfig } from './firebase-config.js';
const SDK='11.10.0';
let f,db,auth,hid,user,categories=[],transactions=[],budgets=[],unsubs=[];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

async function start(){
  const [a,b,c]=await Promise.all([
    import(`https://www.gstatic.com/firebasejs/${SDK}/firebase-app.js`),
    import(`https://www.gstatic.com/firebasejs/${SDK}/firebase-auth.js`),
    import(`https://www.gstatic.com/firebasejs/${SDK}/firebase-firestore.js`)
  ]);
  f={...a,...b,...c};const app=f.getApps().length?f.getApp():f.initializeApp(firebaseConfig);auth=f.getAuth(app);db=f.getFirestore(app);
  ensureDialog();new MutationObserver(()=>queueMicrotask(render)).observe(document.body,{childList:true,subtree:true});
  f.onAuthStateChanged(auth,async u=>{unsubs.forEach(x=>x());unsubs=[];user=u;hid=null;if(!u)return;const p=await f.getDoc(f.doc(db,'users',u.uid));if(!p.exists())return;hid=p.data().householdId;watch();});
}
function watch(){
  const sub=(name,key)=>unsubs.push(f.onSnapshot(f.collection(db,'households',hid,name),s=>{if(key==='categories')categories=s.docs.map(d=>({id:d.id,...d.data()}));if(key==='transactions')transactions=s.docs.map(d=>({id:d.id,...d.data()}));if(key==='budgets')budgets=s.docs.map(d=>({id:d.id,...d.data()}));render();}));
  sub('categories','categories');sub('transactions','transactions');sub('budgets','budgets');
}
function usage(id){return transactions.filter(t=>t.categoryId===id).length+budgets.filter(b=>b.categoryId===id).length}
function rows(type){
  const list=categories.filter(c=>c.type===type).sort((a,b)=>String(a.name).localeCompare(String(b.name),'pt-BR'));
  if(!list.length)return '<div class="empty-state"><strong>Nenhuma categoria</strong>Cadastre uma nova categoria.</div>';
  return list.map(c=>{const used=usage(c.id);return `<div class="cc-category-row ${c.active===false?'is-inactive':''}"><div><strong>${esc(c.name)}</strong><div class="muted">${c.active===false?'Inativa':'Ativa'}${used?` · em uso`:''}</div></div><div class="cc-category-actions"><button class="btn ghost" data-edit="${c.id}">Editar</button><button class="btn ghost" data-toggle="${c.id}">${c.active===false?'Ativar':'Desativar'}</button><button class="btn ghost danger" data-delete="${c.id}" ${used?'disabled':''}>Excluir</button></div></div>`}).join('');
}
function render(){
  if(!hid||document.getElementById('pageTitle')?.textContent.trim()!=='Configurações')return;
  const grid=document.querySelector('#pageContent .settings-grid');if(!grid||grid.querySelector('#ccCategoriesPanel'))return;
  const panel=document.createElement('section');panel.id='ccCategoriesPanel';panel.className='panel cc-categories-panel';panel.innerHTML=`<div class="panel-header"><div><h2>Categorias</h2><div class="muted">Cadastre, edite ou desative categorias. Categorias já utilizadas não podem ser excluídas.</div></div><button class="btn primary" data-new>+ Categoria</button></div><div class="cc-category-columns"><div><h3>Despesas</h3>${rows('expense')}</div><div><h3>Receitas</h3>${rows('income')}</div></div>`;grid.appendChild(panel);panel.addEventListener('click',click);
}
function ensureDialog(){
  if(document.getElementById('ccCategoryDialog'))return;const d=document.createElement('dialog');d.id='ccCategoryDialog';d.className='modal';d.innerHTML=`<form id="ccCategoryForm" class="modal-card"><div class="modal-header"><div><div class="eyebrow">CATEGORIA</div><h2 id="ccCategoryTitle">Nova categoria</h2></div><button type="button" class="icon-btn" data-close>×</button></div><input id="ccCategoryId" type="hidden"><label>Nome<input id="ccCategoryName" maxlength="60" required></label><label>Tipo<select id="ccCategoryType"><option value="expense">Despesa</option><option value="income">Receita</option></select></label><label class="radio-row"><input id="ccCategoryActive" type="checkbox" checked> Categoria ativa</label><p id="ccCategoryError" class="form-error"></p><div class="modal-actions"><button type="button" class="btn ghost" data-close>Cancelar</button><button type="submit" class="btn primary">Salvar</button></div></form>`;document.body.appendChild(d);d.querySelectorAll('[data-close]').forEach(x=>x.addEventListener('click',()=>d.close()));d.querySelector('#ccCategoryForm').addEventListener('submit',save);
}
function click(e){const n=e.target.closest('[data-new]'),ed=e.target.closest('[data-edit]')?.dataset.edit,tg=e.target.closest('[data-toggle]')?.dataset.toggle,dl=e.target.closest('[data-delete]')?.dataset.delete;if(n)open();if(ed)open(ed);if(tg)toggle(tg);if(dl)remove(dl)}
function open(id=''){const c=categories.find(x=>x.id===id);document.getElementById('ccCategoryForm').reset();document.getElementById('ccCategoryId').value=c?.id||'';document.getElementById('ccCategoryName').value=c?.name||'';document.getElementById('ccCategoryType').value=c?.type||'expense';document.getElementById('ccCategoryActive').checked=c?.active!==false;document.getElementById('ccCategoryTitle').textContent=c?'Editar categoria':'Nova categoria';document.getElementById('ccCategoryError').textContent='';document.getElementById('ccCategoryDialog').showModal()}
async function save(e){e.preventDefault();const id=document.getElementById('ccCategoryId').value,name=document.getElementById('ccCategoryName').value.trim(),type=document.getElementById('ccCategoryType').value,active=document.getElementById('ccCategoryActive').checked,error=document.getElementById('ccCategoryError');error.textContent='';if(!name){error.textContent='Informe o nome.';return}if(categories.some(c=>c.id!==id&&c.type===type&&String(c.name).trim().toLowerCase()===name.toLowerCase())){error.textContent='Já existe uma categoria com esse nome e tipo.';return}try{if(id)await f.updateDoc(f.doc(db,'households',hid,'categories',id),{name,type,active,updatedAt:f.serverTimestamp()});else await f.addDoc(f.collection(db,'households',hid,'categories'),{name,type,active,systemDefault:false,createdBy:user.uid,createdAt:f.serverTimestamp(),updatedAt:f.serverTimestamp()});document.getElementById('ccCategoryDialog').close()}catch(err){console.error(err);error.textContent='Não foi possível salvar a categoria.'}}
async function toggle(id){const c=categories.find(x=>x.id===id);if(!c)return;await f.updateDoc(f.doc(db,'households',hid,'categories',id),{active:c.active===false,updatedAt:f.serverTimestamp()})}
async function remove(id){const c=categories.find(x=>x.id===id);if(!c)return;if(usage(id)){alert('Essa categoria já está em uso. Desative-a em vez de excluir.');return}if(confirm(`Excluir a categoria “${c.name}”?`))await f.deleteDoc(f.doc(db,'households',hid,'categories',id))}
start().catch(console.error);
