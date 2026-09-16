let queued=false;

function schedule(){
  if(queued)return;
  queued=true;
  queueMicrotask(()=>{
    queued=false;
    apply();
  });
}

function lockSelect(id,value,labelText){
  const el=document.getElementById(id);
  if(!el)return;

  if(el.value!==value) el.value=value;
  if(!el.disabled) el.disabled=true;

  const label=el.closest('label');
  if(label&&labelText&&!label.dataset.ccPrivacyLabel){
    label.dataset.ccPrivacyLabel='1';
    const small=document.createElement('small');
    small.className='muted';
    small.textContent=labelText;
    label.appendChild(small);
  }
}

function apply(){
  // A base compartilhada do casal permanece compartilhada.
  lockSelect('txScope','shared','Lançamentos pessoais devem ser feitos em “Minhas finanças”.');
  lockSelect('ccTxEditScope','shared','A base do casal é compartilhada.');
  lockSelect('ccForecastScope','shared','Previsões pessoais ficam em “Minhas finanças”.');

  // Contas compartilhadas não podem ser convertidas em pessoais no mesmo documento.
  lockSelect('accountOwnership','joint','Para conta pessoal, use “Minhas finanças”.');
  lockSelect('ccAccountOwnership','joint','Contas compartilhadas permanecem na base do casal.');
}

// Observa somente inclusão/remoção de elementos. Não observa atributos,
// evitando que as próprias alterações deste módulo alimentem um loop de MutationObserver.
new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});
apply();
