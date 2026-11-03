// Test for mhwp-dashboard.html (#3 Advisory OS demo): the tab and home-screen icon is the AI Paragon logo
// (see lib/icon-check.js). The logo is served by the test, so nothing reaches the real site.
// Usage: node tests/advisory-icon.test.js
const { iconSuite } = require('./lib/icon-check');

iconSuite({ url: '/advisory/touchpoint', label: 'Advisory demo' }).catch((e) => { console.error(e); process.exit(1); });
