// v10: Erica's "Two growth engines" graphic rebuilt as 1920 x 1080 layers, so its parts can come in one at a time and
// each system can be lit on its own for the section cards. g_bg is opaque; the rest are transparent layers on it.
// Usage: node graphic10.cjs -> cards/g_*.png (LOOK=1 also writes cards/g_all.png, everything at once)
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const V = require('../lib/vharness.cjs');
const OUT = path.join(__dirname, 'cards');
const fontCss = (u) => V.cached(u).toString().replace(/url\((https:[^)]+)\)/g, (m, x) => 'url(data:font/woff2;base64,' + V.cached(x).toString('base64') + ')');
const TEAL = '#3FD6C6', GOLD = '#E3B341';
const CSS = `body{margin:0;width:1920px;height:1080px;overflow:hidden;background:transparent;font-family:"Plus Jakarta Sans",sans-serif;color:#fff}
.bg{position:absolute;inset:0;background:radial-gradient(900px 520px at -60px -40px,rgba(214,140,48,.42),transparent 70%),radial-gradient(760px 520px at 1990px 1110px,rgba(214,140,48,.38),transparent 70%),linear-gradient(180deg,#0B1B36 0%,#0A1730 55%,#0A1832 100%)}
.arc{position:absolute;border:1.6px solid rgba(227,179,65,.55);border-radius:50%}
.eyebrow{position:absolute;left:112px;top:30px;font-weight:700;font-size:31px;letter-spacing:7px;color:${GOLD}}
h1{position:absolute;left:108px;top:82px;margin:0;font-family:"Playfair Display",serif;font-weight:700;font-size:104px;line-height:1.0;letter-spacing:-1px;text-shadow:0 2px 18px rgba(0,0,0,.35)}
.sub{position:absolute;left:114px;top:300px;font-weight:500;font-size:43px;color:#EEF2F8}
.box{position:absolute;top:412px;width:668px;height:515px;border-radius:30px;box-sizing:border-box;text-align:center}
.org{left:76px;border:2.5px solid ${TEAL};background:linear-gradient(160deg,rgba(63,214,198,.30),rgba(20,80,90,.22) 60%,rgba(12,40,60,.3));box-shadow:0 0 34px rgba(63,214,198,.45),inset 0 0 40px rgba(63,214,198,.18)}
.mkt{left:1176px;border:2.5px solid ${GOLD};background:linear-gradient(160deg,rgba(227,179,65,.16),rgba(60,50,20,.18) 60%,rgba(12,30,50,.3));box-shadow:0 0 34px rgba(227,179,65,.40),inset 0 0 40px rgba(227,179,65,.12)}
.box h2{position:absolute;left:0;right:0;top:250px;margin:0;font-family:"Playfair Display",serif;font-weight:700;font-size:57px;letter-spacing:-.5px;text-shadow:0 2px 14px rgba(0,0,0,.4)}
.box .items{position:absolute;left:0;right:0;top:350px;font-size:29px;font-weight:500;color:#F0F3F8}
.box .goal{position:absolute;left:0;right:0;top:432px;font-weight:800;font-size:31px;letter-spacing:7px;color:${GOLD}}
.ill{position:absolute;left:50%;top:30px;width:340px;height:210px;transform:translateX(-50%)}
.doc{position:absolute;border-radius:14px;border:2px solid rgba(63,214,198,.75)}
.bar{position:absolute;height:9px;border-radius:5px}
.win{position:absolute;border-radius:14px;border:2px solid rgba(227,179,65,.8)}
.pill{position:absolute;left:818px;top:592px;width:284px;height:112px;border-radius:22px;border:2.5px solid #F2CC63;background:linear-gradient(180deg,#C79A2B,#8E6A14);box-shadow:0 0 50px 8px rgba(242,190,70,.55),0 0 120px 20px rgba(242,190,70,.22);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:46px;letter-spacing:4px;color:#fff;text-shadow:0 2px 8px rgba(0,0,0,.35)}
.foot{position:absolute;left:0;right:0;top:965px;text-align:center;font-style:italic;font-weight:500;font-size:38px;color:#EEF2F8}
.rule{position:absolute;top:991px;height:2px;width:535px;background:linear-gradient(90deg,transparent,rgba(227,179,65,.8) 15%,rgba(227,179,65,.8) 85%,transparent)}`;
const ORG_ILL = `<div class="ill">
  <div class="doc" style="left:-4px;top:40px;width:120px;height:160px;background:rgba(63,214,198,.18);transform:skewY(-4deg)"></div>
  <div class="doc" style="left:230px;top:40px;width:120px;height:160px;background:rgba(63,214,198,.18);transform:skewY(4deg)"></div>
  <div class="doc" style="left:60px;top:0;width:230px;height:205px;background:linear-gradient(160deg,rgba(90,225,210,.85),rgba(40,150,150,.85));box-shadow:0 10px 30px rgba(0,0,0,.35)">
    <div class="bar" style="left:22px;top:22px;width:160px;background:#EFFFFD"></div><div class="bar" style="left:22px;top:42px;width:110px;background:#EFFFFD"></div>
    <div style="position:absolute;left:22px;top:68px;width:110px;height:66px;border-radius:8px;background:rgba(20,90,95,.55);overflow:hidden">
      <div style="position:absolute;left:8px;bottom:-30px;width:70px;height:70px;background:#5FEBDC;transform:rotate(45deg)"></div>
      <div style="position:absolute;left:52px;bottom:-24px;width:56px;height:56px;background:#4FD9CB;transform:rotate(45deg)"></div>
      <div style="position:absolute;left:22px;top:10px;width:14px;height:14px;border-radius:50%;background:#B9FFF7"></div></div>
    <div style="position:absolute;left:146px;top:68px;width:64px;height:66px;border-radius:8px;background:rgba(20,90,95,.45)"></div>
    <div class="bar" style="left:22px;top:150px;width:186px;background:rgba(230,255,252,.8)"></div><div class="bar" style="left:22px;top:168px;width:186px;background:rgba(230,255,252,.8)"></div><div class="bar" style="left:22px;top:186px;width:120px;background:rgba(230,255,252,.8)"></div>
  </div></div>`;
const MKT_ILL = `<div class="ill">
  <div class="win" style="left:262px;top:34px;width:84px;height:170px;background:rgba(227,179,65,.25)"></div>
  <div class="win" style="left:10px;top:0;width:290px;height:200px;background:linear-gradient(160deg,rgba(227,179,65,.75),rgba(150,110,30,.75));box-shadow:0 10px 30px rgba(0,0,0,.35)">
    <div style="position:absolute;left:0;right:0;top:0;height:34px;border-bottom:2px solid rgba(255,230,160,.6)"></div>
    <div style="position:absolute;left:14px;top:10px;width:13px;height:13px;border-radius:50%;background:#FFE08A"></div><div style="position:absolute;left:34px;top:10px;width:13px;height:13px;border-radius:50%;background:#FFE08A"></div><div style="position:absolute;left:54px;top:10px;width:13px;height:13px;border-radius:50%;background:#FFE08A"></div>
    <div class="bar" style="left:18px;top:62px;width:110px;background:rgba(255,245,220,.8)"></div><div class="bar" style="left:18px;top:82px;width:110px;background:rgba(255,245,220,.8)"></div><div class="bar" style="left:18px;top:102px;width:90px;background:rgba(255,245,220,.8)"></div>
    <div style="position:absolute;left:18px;top:140px;width:82px;height:22px;border-radius:11px;background:#FFD666"></div>
    <div style="position:absolute;left:146px;top:54px;width:124px;height:106px;border-radius:10px;background:rgba(230,175,60,.9);border:2px solid rgba(255,230,160,.7);display:flex;align-items:center;justify-content:center">
      <div style="width:0;height:0;border-left:30px solid #fff;border-top:19px solid transparent;border-bottom:19px solid transparent;margin-left:8px"></div></div>
  </div></div>`;
const box = (cls, ill, h, items, goal) => `<div class="box ${cls}">${ill}<h2>${h}</h2><div class="items">${items}</div><div class="goal">${goal}</div></div>`;
const ORG = box('org', ORG_ILL, 'Organic content', 'White papers · Industry updates · Articles', 'BUILD AUTHORITY');
const MKT = box('mkt', MKT_ILL, 'Marketing campaigns', 'Ads · Email campaigns · Landing pages', 'GENERATE LEADS');
const WIRES = `<svg width="1920" height="1080" style="position:absolute;left:0;top:0"><defs>
  <filter id="gl" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
  <path d="M744 600 C 780 600, 780 648, 818 648" stroke="${TEAL}" stroke-width="3.5" fill="none" filter="url(#gl)"/>
  <path d="M1102 648 C 1140 648, 1140 600, 1176 600" stroke="#F0A84A" stroke-width="3.5" fill="none" filter="url(#gl)"/>
  <circle cx="744" cy="600" r="6" fill="#CFFFF9" filter="url(#gl)"/><circle cx="1176" cy="600" r="6" fill="#FFE2A8" filter="url(#gl)"/></svg>`;
const LAYERS = {
  g_bg: `<div class="bg"></div><div class="arc" style="left:1560px;top:-460px;width:820px;height:820px"></div><div class="arc" style="left:1720px;top:-300px;width:560px;height:760px;transform:rotate(-20deg)"></div>`,
  g_title: `<div class="eyebrow">AI PARAGON · PIPELINE</div><h1>Two growth engines.<br>One smarter pipeline.</h1><div class="sub">AI-powered content and campaigns, in one workspace.</div>`,
  g_org: ORG,
  g_org_dim: `<div style="opacity:.28;filter:saturate(.4)">${ORG}</div>`,
  g_pipe: `${WIRES}<div class="pill">PIPELINE</div>`,
  g_mkt: MKT,
  g_mkt_dim: `<div style="opacity:.28;filter:saturate(.4)">${MKT}</div>`,
  g_foot: `<div class="rule" style="left:96px"></div><div class="rule" style="left:1289px"></div><div class="foot">Your lead generation workspace</div>`,
};
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const css = fontCss('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Plus+Jakarta+Sans:ital,wght@0,500;0,600;0,700;0,800;1,500&display=swap');
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  const shot = async (k, html) => { await p.setContent('<html><head><style>' + css + CSS + '</style></head><body>' + html + '</body></html>'); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(150); await p.screenshot({ path: path.join(OUT, k + '.png'), omitBackground: true }); };
  for (const [k, html] of Object.entries(LAYERS)) await shot(k, html);
  if (process.env.LOOK) { await shot('g_all', LAYERS.g_bg + LAYERS.g_title + LAYERS.g_org + LAYERS.g_pipe + LAYERS.g_mkt + LAYERS.g_foot); await shot('g_org_lit', LAYERS.g_bg + LAYERS.g_title + LAYERS.g_org + LAYERS.g_pipe + LAYERS.g_mkt_dim + LAYERS.g_foot); }
  await b.close(); console.log('graphic layers', Object.keys(LAYERS).length);
})().catch((e) => { console.error(e); process.exit(1); });
