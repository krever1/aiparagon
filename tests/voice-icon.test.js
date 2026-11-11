// Test for voice-agent-client.html (#4 Command Center): the tab and home-screen icon is the AI Paragon logo
// (see lib/icon-check.js). The logo is served by the test, so nothing reaches the real site.
// Since Nov 11 vercel.json sends /voice to the Next.js app (krever1/aiparagon-voice, which checks its own icon);
// this file is kept for reference and served at /voice here, as before the switch-over.
// Usage: node tests/voice-icon.test.js
const { iconSuite } = require('./lib/icon-check');

iconSuite({ url: '/voice/overview', label: 'Command Center', rewrites: [{ re: /^\/voice(?:\/.*)?$/, dest: '/voice-agent-client.html' }] }).catch((e) => { console.error(e); process.exit(1); });
