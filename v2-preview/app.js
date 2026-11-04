/* TaxiKit v2 – prototyp. Ingen riktig kassa, inga riktiga priser. */
(function(){
const D = window.TK_DATA;
const LS = 'tk2_';
const get = (k,d)=>{try{const v=localStorage.getItem(LS+k);return v===null?d:JSON.parse(v)}catch(e){return d}};
const set = (k,v)=>localStorage.setItem(LS+k,JSON.stringify(v));
const qs = new URLSearchParams(location.search);
['theme','car','lang','vat'].forEach(k=>{ if(qs.get(k)) set(k,qs.get(k)); });

const S = {
  get car(){return get('car','alla')}, get theme(){return get('theme','auto')},
  get lang(){return get('lang','sv')}, get vat(){return get('vat','inkl')},
  get cart(){return get('cart',[])}, get kit(){return get('kit',{shift:null,car:null,pains:[]})}
};

const T = {
  sv:{home:'Hem',cats:'Kategorier',kit:'Mitt kit',bag:'Bagaget',tune:'Anpassa',search:'Sök bland allt för skiftet…',
      yourcar:'Din bil',pickcar:'Välj din bil så visar vi bara det som passar',change:'Ändra',
      add:'Lägg i bagaget',added:'Lagd i bagaget',fits:'Passar din',nofit:'Passar inte din',allcars:'Passar alla bilar',
      buyagain:'Köp igen',popular:'Populärt bland nattförare',all:'Visa alla',onlymine:'Bara för min bil',
      example:'exempel',checkout:'Till kassan',total:'Totalt',ship:'Frakt',
      settitle:'Anpassa TaxiKit',setlead:'Butiken funkar direkt. Här kan du ställa in den efter dig.',
      theme:'Läge',themeh:'Auto = mörkt på natten, ljust på dagen',lang:'Språk',vat:'Priser',vath:'Exkl. moms om du köper via firma',
      car:'Min bil',carh:'Allt filtreras efter din bil'},
  en:{home:'Home',cats:'Shop',kit:'My kit',bag:'Trunk',tune:'Customize',search:'Search everything for your shift…',
      yourcar:'Your car',pickcar:'Pick your car and we only show what fits',change:'Change',
      add:'Add to trunk',added:'Added to trunk',fits:'Fits your',nofit:'Does not fit your',allcars:'Fits all cars',
      buyagain:'Buy again',popular:'Popular with night drivers',all:'See all',onlymine:'Only for my car',
      example:'example',checkout:'Checkout',total:'Total',ship:'Shipping',
      settitle:'Customize TaxiKit',setlead:'The shop just works. Tune it to you here.',
      theme:'Mode',themeh:'Auto = dark at night, light by day',lang:'Language',vat:'Prices',vath:'Excl. VAT if you buy as a company',
      car:'My car',carh:'Everything is filtered to your car'}
};
const t = k => (T[S.lang]||T.sv)[k] || T.sv[k] || k;
window.TK = {S,get,set,t,D};

function applyTheme(){
  let th = S.theme;
  if(th==='auto'){ const h=new Date().getHours(); th = (h>=18||h<7)?'natt':'dag'; }
  document.documentElement.dataset.theme = th;
  const m=document.querySelector('meta[name=theme-color]'); if(m) m.content = th==='dag'?'#EEF1F4':'#0E1114';
}
applyTheme();

const carName = id => (D.cars.find(c=>c.id===id)||D.cars[0]).name;
const prod = id => D.products.find(p=>p.id===id);
const fitsCar = (p,car) => car==='alla' || p.fits.includes('alla') || p.fits.includes(car);
const kr = n => {
  const v = S.vat==='exkl' ? n/1.25 : n;
  return Math.round(v).toLocaleString('sv-SE')+' kr';
};
const priceHTML = n => `<span class="price">${kr(n)}</span><span class="ex">${t('example')}</span>`;
const cartCount = () => S.cart.reduce((a,l)=>a+l.qty,0);

function addToCart(id,qty=1,every=0){
  const c=S.cart; const ex=c.find(l=>l.id===id && (l.every||0)===every);
  if(ex) ex.qty+=qty; else c.push({id,qty,every});
  set('cart',c); toast('✓ '+t('added')); refreshBadges();
}
function toast(msg){
  let el=document.querySelector('.toast'); if(!el){el=document.createElement('div');el.className='toast';document.body.appendChild(el);}
  el.textContent=msg; el.classList.add('show'); clearTimeout(el._t); el._t=setTimeout(()=>el.classList.remove('show'),1600);
}
function refreshBadges(){ document.querySelectorAll('[data-count]').forEach(b=>{const n=cartCount(); b.textContent=n; b.style.display=n?'grid':'none';}); }

function card(p,opts={}){
  const car=S.car; const f=fitsCar(p,car);
  const fit = car==='alla' ? '' : `<span class="fit ${f?'':'no'}">${f?'✓ '+t('fits')+' '+carName(car).split(' (')[0]:'✕ '+t('nofit')+' bil'}</span>`;
  return `<a class="card" href="produkt.html?id=${p.id}">
    ${p.consumable?'<span class="tag">↻ Påfyllning</span>':''}
    <div class="img">${p.icon}</div>
    <div class="body"><div class="nm">${p.name}</div>${fit}
      <div class="ft"><div>${priceHTML(p.price)}</div>
      <button class="add" aria-label="${t('add')}" data-add="${p.id}">+</button></div></div></a>`;
}

function shell(page){
  const tabs=[['index.html','home','🏠'],['kategori.html','cats','🗂️'],['kit.html','kit','🧰'],['bagage.html','bag','🧳']];
  document.body.insertAdjacentHTML('afterbegin',`
  <div class="proto">PROTOTYP · exempelprodukter och exempelpriser, inget går att köpa</div>
  <header class="top"><div class="wrap bar">
    <a class="logo" href="index.html"><span class="dot">🚖</span>Taxi<b>Kit</b></a><span class="sp"></span>
    <button class="iconbtn" data-open-set aria-label="${t('tune')}">⚙️</button>
    <a class="iconbtn" href="bagage.html" aria-label="${t('bag')}">🧳<span class="badge" data-count></span></a>
  </div><div class="checker"></div></header>`);
  document.body.insertAdjacentHTML('beforeend',`
  <nav class="tabs">${tabs.map(([h,k,i])=>`<a href="${h}" class="${page===k?'on':''}"><span class="i">${i}</span>${t(k)}${k==='bag'?'<span class="badge" data-count></span>':''}</a>`).join('')}
    <a href="#" data-open-set><span class="i">🎛️</span>${t('tune')}</a></nav>
  <div class="scrim"></div>
  <div class="sheet" role="dialog" aria-label="${t('settitle')}"><div class="grab"></div>
    <h2>${t('settitle')}</h2><p class="lead">${t('setlead')}</p>
    <div class="set"><div class="l"><b>${t('car')}</b><small>${t('carh')}</small></div>
      <select data-set="car">${D.cars.map(c=>`<option value="${c.id}" ${c.id===S.car?'selected':''}>${c.name}</option>`).join('')}</select></div>
    <div class="set"><div class="l"><b>${t('theme')}</b><small>${t('themeh')}</small></div>
      <div class="seg" data-seg="theme">${[['auto','Auto'],['natt','🌙'],['dag','☀️']].map(([v,l])=>`<button data-v="${v}" class="${S.theme===v?'on':''}">${l}</button>`).join('')}</div></div>
    <div class="set"><div class="l"><b>${t('lang')}</b><small>Svenska / English</small></div>
      <div class="seg" data-seg="lang">${[['sv','SV'],['en','EN']].map(([v,l])=>`<button data-v="${v}" class="${S.lang===v?'on':''}">${l}</button>`).join('')}</div></div>
    <div class="set"><div class="l"><b>${t('vat')}</b><small>${t('vath')}</small></div>
      <div class="seg" data-seg="vat">${[['inkl','Inkl.'],['exkl','Exkl.']].map(([v,l])=>`<button data-v="${v}" class="${S.vat===v?'on':''}">${l}</button>`).join('')}</div></div>
    <div class="set"><div class="l"><b>Påminnelser</b><small>Sms när påfyllning är på väg (kommer senare)</small></div>
      <label class="sw"><input type="checkbox" checked disabled><i></i></label></div>
    <button class="btn go block" style="margin-top:16px" data-close-set>Klar</button>
  </div>`);
  refreshBadges();
  const sheet=document.querySelector('.sheet'), scrim=document.querySelector('.scrim');
  const open=()=>{sheet.classList.add('open');scrim.classList.add('open')}, close=()=>{sheet.classList.remove('open');scrim.classList.remove('open')};
  document.querySelectorAll('[data-open-set]').forEach(b=>b.addEventListener('click',e=>{e.preventDefault();open()}));
  scrim.addEventListener('click',close); document.querySelector('[data-close-set]').addEventListener('click',()=>{close();location.reload()});
  document.querySelector('[data-set=car]').addEventListener('change',e=>{set('car',e.target.value)});
  document.querySelectorAll('[data-seg]').forEach(seg=>seg.addEventListener('click',e=>{
    const b=e.target.closest('button'); if(!b) return; set(seg.dataset.seg,b.dataset.v);
    seg.querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===b)); applyTheme();
  }));
  document.addEventListener('click',e=>{
    const a=e.target.closest('[data-add]'); if(a){e.preventDefault();e.stopPropagation();addToCart(a.dataset.add);}
  });
  if(qs.get('settings')==='1') open();
}
Object.assign(window.TK,{carName,prod,fitsCar,kr,priceHTML,card,addToCart,toast,refreshBadges,shell,cartCount});
})();
