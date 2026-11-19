// Minimal WebdriverIO project with the Native Mobile Selector Performance Optimizer of @wdio/appium-service 10.2.0.
// The service starts its own Appium 3.9.0 (this folder) on port 4724 with the xcuitest driver of audit/device
// (APPIUM_HOME), against the LocatorLab simulator. The UDID is read from audit/device/env.json or UDID.
//
//   npm test                      reportPath set: the optimizer runs and writes its report to out/report
//   npm run test:strict-off       the same with strictSelectors: false (`$` as in WebdriverIO 9)
//   npm run test:no-report-path   only outputDir set, as the docs allow (webdriverio #16311)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEVICE = path.resolve(HERE, '../../device');
const UDID = process.env.UDID || JSON.parse(fs.readFileSync(path.join(DEVICE, 'env.json'), 'utf8')).udid;
process.env.APPIUM_HOME = path.join(DEVICE, '.appium');

const track = { pageObjectPaths: ['./test'], enableCliReport: true };
if (!process.env.NO_REPORT_PATH) track.reportPath = './out/report';

export const config = {
  runner: 'local',
  specs: ['./test/*.e2e.js'],
  maxInstances: 1,
  outputDir: './out/logs',
  logLevel: 'info',
  // 10.0 made `$` strict (throws on several matches); 9.x returned the first match
  strictSelectors: !process.env.STRICT_OFF,
  framework: 'mocha',
  mochaOpts: { timeout: 600000 },
  reporters: ['spec'],
  services: [['appium', { args: { port: 4724 }, trackSelectorPerformance: track }]],
  capabilities: [{
    platformName: 'iOS',
    'appium:automationName': 'XCUITest',
    'appium:udid': UDID,
    'appium:app': path.join(DEVICE, 'DerivedData/Build/Products/Debug-iphonesimulator/LocatorLab.app'),
    'appium:processArguments': { args: ['-screen', 'states'] },
    'appium:derivedDataPath': path.join(DEVICE, 'DerivedData/WDA'),
    'appium:wdaLaunchTimeout': 600000,
    'appium:newCommandTimeout': 600,
  }],
};
