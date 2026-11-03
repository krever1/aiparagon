// Test for voice-agent-client.html (#4 Command Center): the tab and home-screen icon is the AI Paragon logo
// (see lib/icon-check.js). The logo is served by the test, so nothing reaches the real site.
// Usage: node tests/voice-icon.test.js
const { iconSuite } = require('./lib/icon-check');

iconSuite({ url: '/voice/overview', label: 'Command Center' }).catch((e) => { console.error(e); process.exit(1); });
