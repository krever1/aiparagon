// v12.41.1 test for E-&-G-Home-Inc.html (#2 care portal): the tab and home-screen icon is the AI Paragon logo
// (see lib/icon-check.js). The logo is served by the test, so nothing reaches the real site.
// Usage: node tests/portal-icon.test.js
const { iconSuite } = require('./lib/icon-check');

iconSuite({ url: '/E-&-G-Home-Inc.html', label: 'care portal' }).catch((e) => { console.error(e); process.exit(1); });
