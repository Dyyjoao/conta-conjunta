let queued=false;
function schedule(){if(queued)return;queued=true;queueMicrotask(()=>{queued=false;apply()})}
function lockSelect(id,value,labelText){const el=document.getElementById(id);if(!el)return;el.value=value;el.disabled=true;const label=el.closest('label');if(label&&labelText&&!label.dataset.ccPrivacyLabel){label.dataset.ccPrivacyLabel='1';const small=document.createElement('small');small.className='muted';small.textContent=labelText;label.appendChild(small)}}
function apply(){
  // Tudo que é criado/editado na base compartilhada permanece compartilhado.
  lockSelect('txScope','shared','Lançamentos pessoais devem ser feitos em “Minhas finanças”.');
  lockSelect('ccTxEditScope','shared','A base do casal é compartilhada.');
  lockSelect('ccForecastScope','shared','Previsões pessoais ficam em “Minhas finanças”.');

  // Contas da coleção compartilhada não podem virar pessoais no mesmo documento.
  // Uma conta pessoal nova é criada na área privada, com responsável definido.
  lockSelect('accountOwnership','joint','Para conta pessoal, use “Minhas finanças” ou + Conta em Configurações.');
  lockSelect('ccAccountOwnership','joint','Contas compartilhadas permanecem na base do casal.');
}
new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true,attributes:true});
apply();
