// V2 deliberately retires driver-to-driver sends. Keep the old npm test entry
// pointed at the current Playwright workflow rather than obsolete UI selectors.
// Activate the documented Playwright Python environment, or set PYTHON.
const {spawnSync}=require('node:child_process'),path=require('node:path');
const r=spawnSync(process.env.PYTHON||'python3',[path.join(__dirname,'../inkorg-v2/browser.py')],{stdio:'inherit'});
if(r.error)console.error(r.error.message);
process.exit(r.status===null?1:r.status);
