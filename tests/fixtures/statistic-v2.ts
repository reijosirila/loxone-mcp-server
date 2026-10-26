// Captured from a live Miniserver (firmware with StatisticV2 meters), Europe/Tallinn.

export const meterStatisticV2 = {
  groups: [
    { id: '1', mode: 10, dataPoints: [{ title: 'Power', format: '0,000kW', output: 'actual' }] },
    { id: '2', mode: 11, accumulated: true, dataPoints: [{ title: 'Meter Reading', format: '0,0kWh', output: 'total' }] },
  ],
};

export const energyFlowMonitorStatisticV2 = {
  groups: [
    { id: '3', mode: 10, dataPoints: [] },
    { id: '1', mode: 11, accumulated: true, dataPoints: [{ title: 'Meter Reading', format: '0,0kWh', output: 'totalSelfConsumption' }] },
    { id: '2', mode: 11, accumulated: true, dataPoints: [{ title: 'Yield total', format: '0,00€', output: 'OYt' }] },
  ],
};

/** getStatistic/raw/{2026-10-20 00:00+03}/{03:00+03}/all/1/actual: 30-minute power samples in kW. */
export const rawPowerHex =
  'd084d66ab81e85eb51b8ae3fd88bd66ab81e85eb51b8ae3fe092d66aec51b81e85ebb13fe899d66aec51b81e85ebb13f' +
  'f0a0d66aec51b81e85ebb13ff8a7d66a295c8fc2f528bc3f00afd66ab81e85eb51b8be3f';

/** getStatistic/diff/{2026-10-20 00:00+03}/{03:00+03}/hour/2/total: kWh used per hour. */
export const hourlyDiffHex =
  'd084d66a000024704bf2af3fe092d66a0000ba026a09b13ff0a0d66a000048b53589bd3f';

/** getStatistic/diff/{2026-03-27 00:00+02}/{2026-03-31 23:59:59+03}/day/2/total: spans the switch to summer time on 2026-03-29. */
export const dailyDiffAcrossDstHex =
  '60acc5690080073f4b960d40e0fdc6690028bacda9551140604fc86900280772a55d1040d092c96900d057916910104050e4ca69009006a468431040';

/** Body of an HTTP 200 response for an unknown group or output. */
export const rejectedRequestBody =
  '{"LL": { "control": "dev/sps/getStatistic/00000000-0000-0000-ffff000000000000/raw/1792498593/1792757793/all/3", "value": "raw/1792498593/1792757793/all/3", "Code": "400"}}\r\n';
