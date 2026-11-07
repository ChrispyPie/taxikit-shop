/* Verified quick-pick/fallback names, NOT the API whitelist. The full whitelist comes from advertised TrainStation data. Source/verification: docs/TRAIN-STATIONS-20261108.md. */
(function(root){'use strict';var stations=[
 {id:'G',label:'Göteborg C'}, {id:'Mdn',label:'Mölndal'}, {id:'Gas',label:'Gamlestaden'},
 {id:'Kb',label:'Kungsbacka'}, {id:'Khe',label:'Kungsbacka Hede'}, {id:'Krd',label:'Kållered'},
 {id:'Ldo',label:'Lindome'}, {id:'P',label:'Partille'}, {id:'Lr',label:'Lerum'},
 {id:'Fd',label:'Floda'}, {id:'A',label:'Alingsås'}, {id:'Yb',label:'Ytterby (Kungälv)'}, {id:'Än',label:'Älvängen'}
];if(typeof module!=='undefined'&&module.exports)module.exports=stations;else root.TRAIN_STATIONS=stations;
})(typeof window!=='undefined'?window:globalThis);
