'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const trains = require(path.join(__dirname, '../../api/trains.js'));
const { codesText, reasonParts, slimTrain } = trains._internal;
let n = 0;
function check(ok, msg) { assert.ok(ok, msg); n++; }

check(codesText([{ Description: 'Banarbete' }, { Description: 'Buss ersätter' }]).join('. ') === 'Banarbete. Buss ersätter');
check(codesText([{ Description: 'Inställt' }, { Description: 'Banarbete' }]).join() === 'Banarbete');
check(codesText(['  ', null, { Code: 'X' }]).join() === 'X');
check(reasonParts({ Deviation: [{ Description: 'Banarbete' }], OtherInformation: [{ Description: 'Buss ersätter' }] }).reason === 'Banarbete');
check(reasonParts({ Deviation: [{ Description: 'Banarbete' }], OtherInformation: [{ Description: 'Buss ersätter' }] }).info === 'Buss ersätter');
check(reasonParts({ Deviation: [{ Description: 'Inställt' }] }).reason === '');

const slim = slimTrain({
  ActivityType: 'Ankomst',
  AdvertisedTrainIdent: '3089',
  AdvertisedTimeAtLocation: '2026-11-06T22:15:00.000+01:00',
  Canceled: true,
  FromLocation: [{ LocationName: 'Kb' }],
  ToLocation: [{ LocationName: 'G' }],
  ProductInformation: [{ Description: 'Västtågen' }],
  TypeOfTraffic: 'Pendeltåg',
  Deviation: [{ Code: 'ANA002', Description: 'Banarbete' }, { Description: 'Buss ersätter' }],
  OtherInformation: [{ Description: 'Ersättningsbuss från Mölndal' }],
  Booking: [],
});
check(slim.canceled === true);
check(slim.reason === 'Banarbete. Buss ersätter');
check(slim.info === 'Ersättningsbuss från Mölndal');
check(slim.id === '3089');

console.log(n + ' orsak/trains assertions passed');
