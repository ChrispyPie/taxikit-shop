const {boot}=require('./dom.cjs'),assert=require('node:assert/strict');
(async()=>{
 let a=await boot();const p=a.w.LAZY.ensure('kalender'),q=a.w.LAZY.ensure('kalender');assert.equal(p,q);await p;assert.equal(a.js.filter(x=>x==='kalender.js').length,1);a.dom.window.close();
 a=await boot();const append=a.w.document.head.appendChild.bind(a.w.document.head);let fail=true;
 a.w.document.head.appendChild=function(el){if(fail&&el.tagName==='SCRIPT'&&el.src.includes('topplistor.js')){fail=false;queueMicrotask(()=>el.onerror());return el;}return append(el);};
 await assert.rejects(a.w.LAZY.ensure('topplistor'));assert(!a.w.LAZY.ready('topplistor'));await a.w.LAZY.ensure('topplistor');assert(a.w.LAZY.ready('topplistor'));await assert.rejects(a.w.LAZY.ensure('not-a-view'));
 a.w.VIEW_STATE.save('inkorg',{filter:'hours',thread:900});a.w.localStorage.setItem('taxi_driver','different-fixture');assert.equal(a.w.VIEW_STATE.get('inkorg',null),null);a.dom.window.close();
 a=await boot({},'#view=kalender');assert(a.w.LAZY.ready('kalender'));assert(!a.js.includes('script.js'));assert(!a.js.includes('mailbox-ui.js'));a.w.goHome();assert.equal(a.w.location.hash,'');assert.equal(a.w.VIEW_STATE.get('view','missing'),null);a.dom.window.close();
 const storage={'taxi_view_state:fixture:view':JSON.stringify('inkorg'),'taxi_view_state:fixture:inkorg':JSON.stringify({filter:'hours'})};a=await boot(storage);assert(a.w.document.getElementById('content').textContent.includes('Verkstadstimmar'));assert(!a.js.includes('sjuk.js'),'reading inbox does not fetch medical form module');a.dom.window.close();
 console.log('PASS promise/resource dedupe, retry after failed import, unknown-module rejection, per-user state isolation, URL restore, home reset and restored inbox filter.');
})().catch(e=>{console.error(e);process.exitCode=1;});
