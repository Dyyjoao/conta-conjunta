import { firebaseConfig } from './firebase-config.js';
const SDK='11.10.0';
let f,db,auth,user,hid,accounts=[],categories=[],transactions=[],unsubs=[];

const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9 ]+/g,' ').replace(/\s+/g,' ').trim();
const merchantKey=v=>norm(v).replace(/\b(pix|compra|debito|credito|pagamento|pgto|transacao|transferencia|ted|doc|cartao|elo|visa|mastercard)\b/g,' ').replace(/\b\d+\b/g,' ').replace(/\s+/g,' ').trim();
function toast(message,timeout=5200){const el=document.getElementById('toast');if(!el)return alert(message);el.textContent=message;el.classList.remove('hidden');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.add('hidden'),timeout)}

async function start(){
  const [a,b,c]=await Promise.all([
    import(`https://www.gstatic.com/firebasejs/${SDK}/firebase-app.js`),
    import(`https://www.gstatic.com/firebasejs/${SDK}/firebase-auth.js`),
    import(`https://www.gstatic.com/firebasejs/${SDK}/firebase-firestore.js`)
  ]);
  f={...a,...b,...c};const app=f.getApps().length?f.getApp():f.initializeApp(firebaseConfig);auth=f.getAuth(app);db=f.getFirestore(app);
  document.getElementById('pageContent')?.addEventListener('change',captureOfx,true);
  f.onAuthStateChanged(auth,async u=>{unsubs.forEach(x=>x());unsubs=[];user=u;hid=null;accounts=[];categories=[];transactions=[];if(!u)return;const p=await f.getDoc(f.doc(db,'users',u.uid));if(!p.exists())return;hid=p.data().householdId;watch();});
}
function watch(){
  unsubs.push(f.onSnapshot(f.collection(db,'households',hid,'accounts'),s=>accounts=s.docs.map(d=>({id:d.id,...d.data()}))));
  unsubs.push(f.onSnapshot(f.collection(db,'households',hid,'categories'),s=>categories=s.docs.map(d=>({id:d.id,...d.data()}))));
  unsubs.push(f.onSnapshot(f.collection(db,'households',hid,'transactions'),s=>transactions=s.docs.map(d=>({id:d.id,...d.data()}))));
}
function captureOfx(e){
  if(e.target?.id!=='ofxFileInput'||!e.target.files?.[0]||!hid)return;
  e.stopImmediatePropagation();e.preventDefault();const file=e.target.files[0];e.target.value='';importOfx(file).catch(err=>{console.error(err);toast(`Falha ao importar OFX: ${err.message||'erro desconhecido'}`)});
}
function parseOfx(text){
  const parts=text.split(/<STMTTRN>/i).slice(1);const val=(block,tag)=>{const m=block.match(new RegExp(`<${tag}>([^<\\r\\n]+)`,'i'));return m?m[1].trim():''};
  return parts.map(part=>{const block=part.split(/<\/STMTTRN>/i)[0],rawAmount=val(block,'TRNAMT').replace(',','.'),amount=Number(rawAmount),raw=(val(block,'DTPOSTED')||val(block,'DTUSER')).replace(/\D/g,'').slice(0,8);if(raw.length<8)return null;const y=raw.slice(0,4),m=raw.slice(4,6),d=raw.slice(6,8),date=new Date(`${y}-${m}-${d}T12:00:00`);return {fitid:val(block,'FITID'),date,amount:Math.abs(amount),type:amount>=0?'income':'expense',description:val(block,'MEMO')||val(block,'NAME')||val(block,'CHECKNUM')||'Movimentação OFX'};}).filter(x=>x&&x.amount>0&&!Number.isNaN(x.date.getTime()));
}
function classify(row){
  const desc=norm(row.description),available=categories.filter(c=>c.active!==false&&c.type===row.type);
  let bestKeyword=null;
  for(const c of available){for(const keyword of (c.ofxKeywords||[])){const k=norm(keyword);if(k&&desc.includes(k)&&(!bestKeyword||k.length>bestKeyword.keyword.length))bestKeyword={category:c,keyword:k};}}
  if(bestKeyword)return {categoryId:bestKeyword.category.id,method:'keyword'};
  const key=merchantKey(row.description);if(key){const votes=new Map();for(const t of transactions){if(t.type!==row.type||!t.categoryId)continue;const cat=available.find(c=>c.id===t.categoryId);if(!cat)continue;const oldKey=merchantKey(t.description);if(!oldKey)continue;const same=oldKey===key||(key.length>=6&&oldKey.includes(key))||(oldKey.length>=6&&key.includes(oldKey));if(same)votes.set(t.categoryId,(votes.get(t.categoryId)||0)+1);}let winner=null;for(const [categoryId,count] of votes){if(!winner||count>winner.count)winner={categoryId,count};}if(winner)return {categoryId:winner.categoryId,method:'history'};}
  const fallback=row.type==='expense'?(available.find(c=>norm(c.name)==='nao categorizado')||available[0]):available[0];return {categoryId:fallback?.id||'',method:'fallback'};
}
async function sha256(text){const data=new TextEncoder().encode(text),hash=await crypto.subtle.digest('SHA-256',data);return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('')}
async function importOfx(file){
  const active=accounts.filter(a=>a.active!==false);if(!active.length){toast('Cadastre uma conta financeira antes de importar o OFX.');return}
  let account=active[0];if(active.length>1){const options=active.map((a,i)=>`${i+1} - ${a.name}`).join('\n'),chosen=Number(prompt(`Em qual conta este OFX deve ser lançado?\n\n${options}`,'1'));if(!Number.isInteger(chosen)||chosen<1||chosen>active.length){toast('Importação cancelada.');return}account=active[chosen-1];}
  const rows=parseOfx(await file.text());if(!rows.length){toast('Não encontrei movimentações válidas nesse OFX.');return}if(rows.length>200){toast('Por segurança, importe até 200 movimentações por arquivo.');return}
  let imported=0,skipped=0,keyword=0,history=0,fallback=0;
  for(const row of rows){
    const key=await sha256(`${account.id}|${row.fitid||''}|${row.date.toISOString().slice(0,10)}|${row.amount}|${row.description}`),marker=f.doc(db,'households',hid,'ofxImports',key);if((await f.getDoc(marker)).exists()){skipped++;continue}
    const cls=classify(row);if(!cls.categoryId)throw new Error(`Não há categoria ativa para ${row.type==='income'?'receita':'despesa'}.`);
    const txRef=f.doc(f.collection(db,'households',hid,'transactions')),batch=f.writeBatch(db);batch.set(txRef,{type:row.type,date:f.Timestamp.fromDate(row.date),description:row.description,amount:row.amount,status:'paid',accountId:account.id,categoryId:cls.categoryId,scope:'shared',notes:'',createdBy:user.uid,source:'ofx',fitid:row.fitid||'',ofxClassification:cls.method,createdAt:f.serverTimestamp(),updatedAt:f.serverTimestamp()});batch.set(marker,{transactionId:txRef.id,fitid:row.fitid||'',accountId:account.id,classification:cls.method,importedBy:user.uid,createdAt:f.serverTimestamp()});await batch.commit();imported++;if(cls.method==='keyword')keyword++;else if(cls.method==='history')history++;else fallback++;
  }
  toast(`OFX concluído: ${imported} importados · ${keyword} por regra · ${history} pelo histórico · ${fallback} sem regra · ${skipped} duplicados ignorados.`);
}
start().catch(console.error);
