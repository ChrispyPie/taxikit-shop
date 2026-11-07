/* Wage data only: no Kördata UI, tabs, calendar dialogs or click handlers. Memory only. */
(function(){'use strict';if(window.taxiPayData)return;
 const COMPANY=false;let data={},currentDriver='',viewDriver='',tripsByDriver=null,orphanTrips=null,session='',at=0,pending=null;
function defForar() { return (data && data.forar) || currentDriver || ''; }
function matchDriver(rec) {
  return COMPANY || (rec.forar || defForar()) === viewDriver;
}
function getShiftsInRange(start, end) {
  return (data.shifts || []).filter(s => {
    if (!matchDriver(s)) return false;
    const shiftStart = parseShiftTime(s.start);
    return shiftStart && shiftStart >= start && shiftStart <= end;
  });
}
function getTripsForShift(shift) {
  if (!shift) return [];
  const shiftStart = parseShiftTime(shift.start);
  const shiftEnd = parseShiftTime(shift.slut);
  if (!shiftStart || !shiftEnd) return [];

  // Resorna kopplas till skiftets egen förare (fungerar både för en förare och hela åkeriet)
  const shiftDriver = shift.forar || defForar();
  if (!tripsByDriver) {
    tripsByDriver = {};
    (data.trips || []).forEach(t => { const f = t.forar || defForar(); (tripsByDriver[f] = tripsByDriver[f] || []).push(t); });
  }
  return (tripsByDriver[shiftDriver] || []).filter(t => {
    const tripDate = t.startdatum;
    const tripTime = t.starttid;
    if (!tripDate || !tripTime) return false;
    const tripDt = new Date(tripDate + 'T' + tripTime);
    return tripDt >= shiftStart && tripDt <= shiftEnd;
  });
}
function tripTime(t) {
  if (!t.startdatum || !t.starttid) return null;
  const d = new Date(t.startdatum + 'T' + t.starttid);
  return isNaN(d) ? null : d;
}
function getOrphanTripsInRange(start, end) {
  if (!orphanTrips) {
    const byDriver = {};
    (data.shifts || []).forEach(s => {
      const a = parseShiftTime(s.start), b = parseShiftTime(s.slut);
      if (a && b && !isNaN(a) && !isNaN(b)) (byDriver[s.forar || defForar()] = byDriver[s.forar || defForar()] || []).push([a, b]);
    });
    orphanTrips = (data.trips || []).filter(t => {
      const ts = tripTime(t);
      return ts && !(byDriver[t.forar || defForar()] || []).some(r => ts >= r[0] && ts <= r[1]);
    });
  }
  return orphanTrips.filter(t => {
    if (!matchDriver(t)) return false;
    const ts = tripTime(t);
    return ts >= start && ts <= end;
  });
}
function parseShiftTime(str) {
  const parts = (str || '').split(' ');
  if (parts.length < 2) return null;
  const d = parts[0];
  const t = parts[1].replace(/ /g, '');
  return new Date(d.slice(0,4) + '-' + d.slice(4,6) + '-' + d.slice(6,8) + 'T' + t);
}
function dedupData(d) {
  const seenShifts = new Set();
  d.shifts = (d.shifts || []).filter(s => {
    const key = (s.passnr || '') + '|' + (s.forar || defForar()) + '|' + String(s.start || '').replace(/\D/g, '').slice(0, 8); // passnr återanvänds
    if (seenShifts.has(key)) return false;
    seenShifts.add(key);
    return true;
  });
  const seenTrips = new Set();
  d.trips = (d.trips || []).filter(t => {
    const key = (t.kvittonr || '') + '|' + (t.forar || defForar()) + '|' + (t.startdatum || '');
    if (seenTrips.has(key)) return false;
    seenTrips.add(key);
    return true;
  });
}
 window.taxiEnsureData=function(){var token=localStorage.getItem('taxi_session')||'',who=localStorage.getItem('taxi_driver')||'';if(session===token&&data.shifts&&Date.now()-at<60000)return Promise.resolve();if(pending)return pending;
 pending=(async function(){var args={p_token:token,p_dataset:'current'},r;try{r=await rpc('get_my_trip_data',args,20000);}catch(e){if(e.code==='PGRST202'||e.message==='HTTP 404')r=await rpc('get_trip_data',args,20000);else throw e;}if(token!==(localStorage.getItem('taxi_session')||''))throw new Error('session_changed');currentDriver=who;viewDriver=who;data=r||{};dedupData(data);tripsByDriver=null;orphanTrips=null;session=token;at=Date.now();})().finally(function(){pending=null;});return pending;};
 window.taxiPayData=function(from,to){if(session!==(localStorage.getItem('taxi_session')||'')||!data.shifts)return null;var shifts=getShiftsInRange(from,to),trips=[];shifts.forEach(function(s){trips=trips.concat(getTripsForShift(s));});trips=trips.concat(getOrphanTripsInRange(from,to));return {driver:viewDriver,own:true,shifts:shifts,trips:trips,last_updated:data.last_updated||null};};
 window.PAY_DATA={snapshot:function(){return session===(localStorage.getItem('taxi_session')||'')&&Date.now()-at<60000&&data.shifts?data:null;}};
})();
