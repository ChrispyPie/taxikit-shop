/* Neutral boot state. Never interpret a transport failure as a permission decision. */
(function(){
 'use strict';
 var B=window.SESSION_READY={},metrics=window.TAXI_BOOT_METRICS={};
 function now(){return window.performance?performance.now():Date.now();}
 B.begin=function(){document.documentElement.classList.add('session-loading');var e=document.getElementById('session-status');if(e)e.innerHTML='<p role="status">Kontrollerar inloggning…</p>';};
 B.finish=function(){document.documentElement.classList.remove('session-loading');};
 B.fail=function(retry){B.begin();var e=document.getElementById('session-status');if(!e)return;e.innerHTML='<p role="alert">Kunde inte kontrollera inloggningen just nu. Prova igen.</p><button type="button">Försök igen</button><p><a href="index.html">Tillbaka</a></p>';e.querySelector('button').onclick=retry;};
 B.resolve=async function(load,accept){var start=now();for(var i=0;i<2;i++){var t=now();metrics.attempts=i+1;try{var me=await load();if(!me||!me.id||typeof me.category!=='string')throw new Error('invalid_identity');metrics.roleRequestMs=now()-t;metrics.attempts=i+1;if(!accept||accept(me)||i===1){metrics.sessionReadyMs=now()-start;return me;}}catch(e){if(e.code==='28000'||i===1){metrics.sessionReadyMs=now()-start;throw e;}}await new Promise(function(r){setTimeout(r,250);});}};
 try{if(localStorage.getItem('taxi_session')||/\/admin\.html$/.test(location.pathname))document.documentElement.classList.add('session-loading');}catch(e){}
})();
