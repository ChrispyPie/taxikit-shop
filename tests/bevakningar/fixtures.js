// Enbart syntetiska exempel. Alla API-anrop fångas i denna testprofil.
(function () {
  var BaseDate = Date, now = BaseDate.parse('2026-11-06T17:00:00Z');
  window.Date = class extends BaseDate { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } };
  var iso = m => new Date(now + m * 60000).toISOString();
  window.WATCH_TEST = {
    calls: [], empty: false, fail: '',
    watches: [
      { kind: 'tag', ident: '9991', sched: iso(20), label: 'Exempelstad', expires_at: iso(180), state: {} },
      { kind: 'flyg', ident: 'TEST42', sched: iso(35), label: 'Exempelö', expires_at: iso(180), state: { landed: true } }
    ],
    rules: [{ id: 77, name: 'Exempelnotis', enabled: true, origins: ['sthlm'], fast_only: true, train_nos: ['9992'], days: [1,2,3,4,5,6,7], from_min: 0, to_min: 0, lead_min: 20, notify_delay: true, delay_min: 10, notify_cancel: true }],
    flightRules: [{ id: 88, name: 'Exempelflyg', enabled: true, origins: [], airlines: [], flight_nos: ['TEST42'], days: [1,2,3,4,5,6,7], from_min: 0, to_min: 0, lead_min: 20, notify_delay: true, delay_min: 10, notify_cancel: true }],
    trains: [
      { dir: 'ANK', id: '9991', sched: iso(20), est: iso(30), other: 'Exempelstad', track: '5' },
      { dir: 'ANK', id: '9992', sched: iso(60), other: 'Stockholm (exempel)', otherSig: 'Cst', product: 'Snabbtåg', snabb: true }
    ],
    flights: [{ id: 'TEST42', sched: iso(35), act: iso(40), status: 'LAN', other: 'Exempelö', firstBag: iso(45) }],
    event: { id: 99901, title: 'Exempelkonsert', venue: 'Exempelarenan', category: 'konsert', starts_at: iso(80), ends_at: iso(160), subs: [{kind:'before_end',offset:30,channel:'inapp'},{kind:'before_start',offset:0,channel:'inapp'}] }
  };
  var prev = window.fetch;
  window.fetch = function (url, opt) {
    var t = WATCH_TEST, m = /\/rpc\/([\w]+)/.exec(String(url)), a = opt && opt.body ? JSON.parse(opt.body) : {};
    var reply = d => Promise.resolve(new Response(JSON.stringify(d), { status: 200, headers: {'Content-Type':'application/json'} }));
    if (m) {
      var fn = m[1]; t.calls.push({ fn: fn, args: a });
      if (t.fail === fn) return Promise.resolve(new Response('{}',{status:503}));
      if (fn === 'mailbox_v2') return reply(a.p_action === 'contacts_get' ? {cars:[],phone:null,visibility:'owner'} : []);
      if (fn === 'watch_list') return reply(t.empty ? [] : t.watches);
      if (fn === 'train_watch_list') return reply(t.empty ? [] : t.rules);
      if (fn === 'flight_watch_list') return reply(t.empty ? [] : t.flightRules);
      if (fn === 'watch_set') { t.watches = t.watches.filter(w => !(w.kind === a.p_kind && w.ident === a.p_ident)); return reply(t.watches); }
      if (fn === 'train_watch_save') { t.rules.find(w => w.id === a.p_id).enabled = a.p_data.enabled; return reply(t.rules); }
      if (fn === 'flight_watch_save') { t.flightRules.find(w => w.id === a.p_id).enabled = a.p_data.enabled; return reply(t.flightRules); }
      if (fn === 'set_event_subscription') { t.event.subs = t.event.subs.filter(s => !(s.kind === a.p_kind && s.offset === a.p_offset_min)); return reply(t.event.subs); }
      if (fn === 'get_events') return reply({city:{slug:'goteborg',name:'Göteborg',timezone:'Europe/Stockholm'},cities:[{slug:'goteborg',name:'Göteborg'}],events:t.empty?[]:[t.event],venues:[],me:'900001',can_approve:false});
      if (fn === 'get_event_comments') return reply([]);
    }
    if (/api\/trains|feed\/tag.json/.test(String(url))) return reply({updated:iso(0),trains:t.trains});
    if (/feed\/got.json/.test(String(url))) return reply({updated:iso(0),arrivals:t.flights});
    return prev(url,opt);
  };
})();
