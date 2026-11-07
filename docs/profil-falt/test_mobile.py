import asyncio,json
from pathlib import Path
from playwright.async_api import async_playwright
BASE=Path(__file__).resolve().parents[2]/'TaxiData'; OUT=Path('/workspace/taxidata-cleanup/screenshots/profil-falt')
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True,args=['--no-sandbox'])
  page=await browser.new_page(viewport={'width':390,'height':844},device_scale_factor=1)
  errors=[]; page.on('pageerror',lambda e:errors.append(str(e)))
  await page.route('https://profile.test/**',lambda r:r.fulfill(body='<html></html>',content_type='text/html'))
  await page.goto('https://profile.test/')
  await page.set_content('''<meta name="viewport" content="width=device-width, initial-scale=1"><style>:root{--primary:#186450;--on-primary:white;--surface:#fff;--border:#d3ddd9;--text:#152c24;--text-soft:#52665e;--bg:#f5f7f6}*{box-sizing:border-box}body{background:var(--bg);color:var(--text);font:16px system-ui;margin:0;padding:14px}button{touch-action:manipulation}</style><div id="root"></div>''')
  await page.evaluate('''() => {window.showToast = x => window.lastToast = x; window.saved=[]; window.mock={mine:true,can_edit:true,name:'Testprofil',taxi_start_year:2023,home_zone:'103',fav_zone:'103',languages:'svenska, engelska',permits:'B, Taxiförarlegitimation, Äldre erfarenhet',visibility:{languages:'akeri'}}; window.fetch=async (url,opts)=>{let args=JSON.parse(opts.body); if(url.endsWith('/profile_save')) {saved.push(args.p_data); if(window.failSave) return {ok:false,statusText:'error',json:async()=>({message:'forbidden'})}; Object.assign(mock,args.p_data);} return {ok:true,json:async()=>mock}; };}''')
  await page.add_script_tag(path=str(BASE/'profil-sprak.js')); await page.add_script_tag(path=str(BASE/'profil-sida.js'))
  await page.evaluate("PROFIL_SIDA.render(document.getElementById('root'))")
  assert 'sedan 2023' in await page.locator('#root').inner_text()
  await page.locator('[data-a=edit]').click()
  assert await page.locator('#ps-month').input_value()==''
  assert await page.locator('.ps-language').count()==2
  await page.locator('#ps-month').select_option('3'); await page.locator('#ps-year').select_option('2020')
  await page.locator('#ps-home').fill('999'); await page.locator('#ps-fav').fill('1')
  await page.locator('.ps-language-level').nth(0).select_option('Modersmål');await page.locator('.ps-language-level').nth(1).select_option('Flytande')
  await page.screenshot(path=str(OUT/'01-start-zoner.png'))
  await page.locator('[data-a=lang-add]').click()
  row=page.locator('.ps-language').nth(2); await row.locator('input').fill('somaliska');await row.locator('.ps-language-name').select_option('so');await row.locator('.ps-language-level').select_option('Grundläggande')
  await page.locator('#ps-languages').scroll_into_view_if_needed(); await page.screenshot(path=str(OUT/'02-sprak.png'))
  await page.locator('[data-permit="Serviceresor"]').check();await page.locator('[data-permit="BE"]').check()
  await page.locator('.ps-permit-chips').scroll_into_view_if_needed(); await page.screenshot(path=str(OUT/'03-behorigheter.png'))
  await page.locator('[data-a=save]').click()
  data=await page.evaluate('saved.at(-1)')
  assert data['taxi_start_year']=='2020' and data['taxi_start_month']=='3',data
  assert data['home_zone']=='999' and data['fav_zone']=='1'
  assert 'Modersmål' in data['languages'] and 'Grundläggande' in data['languages']
  assert 'Serviceresor' in data['permits'] and 'Äldre erfarenhet' in data['permits']
  assert data['visibility']['languages']=='akeri'
  assert 'mars 2020' in await page.locator('#root').inner_text()
  await page.evaluate('window.scrollTo(0,0)'); await page.screenshot(path=str(OUT/'04-profil.png'))
  await page.locator('[data-a=edit]').click();await page.locator('#ps-home').fill('1000');await page.locator('[data-a=save]').click()
  assert await page.evaluate('saved.length')==1
  assert '1 och 999' in await page.evaluate('lastToast')
  await page.locator('#ps-home').fill('25');await page.evaluate('window.failSave=true');await page.locator('[data-a=save]').click()
  assert await page.locator('#ps-home').input_value()=='25'
  assert not await page.locator('[data-a=save]').is_disabled()
  await page.evaluate("mock.languages='Okänt testspråk'; mock.home_zone='Tidigare område'; failSave=false")
  await page.evaluate("PROFIL_SIDA.render(document.getElementById('root'))");await page.locator('[data-a=edit]').click();await page.locator('[data-a=save]').click()
  data=await page.evaluate('saved.at(-1)')
  assert data['languages']=='Okänt testspråk',data
  assert data['home_zone']=='Tidigare område',data
  assert not errors,errors
  assert await page.evaluate('document.documentElement.scrollWidth <= 390')
  print('PASS: month/year roundtrip, legacy year, zones 1/999 and invalid 1000, languages + levels, visibility, permits + legacy, unknown language and legacy zone retained, failed save retains draft, mobile overflow; screenshots 390x844')
  await browser.close()
asyncio.run(main())
