// Home page tests for E-&-G-Home-Inc.html (#2, the care portal), v12.24: the home page in Erica's two looks
// (A, clear agenda; B, bold overview), today's schedule as a list, a timeline or the month, the numbers at the
// top, Next up, the sections and their order, and Customize your home page: saved per person, an agency
// default per role set by a director, and the same for staff and families. The clock is fixed so the
// schedule is the same on every run. Most checks run in the demo view (nothing saved); the saving checks sign
// in to a stub account (lib/portal-harness.js), so no real account or agency is touched. See tests/README.md.
// Usage: node tests/portal-home.test.js [baseline.html]
const H = require('./lib/portal-harness');

let pass = 0, fail = 0;
const failures = [];
function check(label, ok, detail) {
  if (ok) pass++; else { fail++; failures.push(label + (detail ? ' :: ' + detail : '')); }
  console.log((ok ? 'PASS ' : 'FAIL ') + label + (ok || !detail ? '' : '   [' + detail + ']'));
}
const DAY = '2026-10-21';                                         // a Wednesday; the sample data is relative to today
const at = (hm) => new Date(DAY + 'T' + hm + ':00');

(async () => {
  const env = await H.start(process.argv[2]);
  const errors = [];
  async function demo(hm, viewport, role) {
    const { ctx, page } = await H.newPage(env, { viewport, bucket: errors });
    await page.clock.setFixedTime(at(hm || '10:00'));
    await page.goto(env.BASE + '/portal.html?demo=1', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof state !== 'undefined' && document.querySelector('#view .hm'), null, { timeout: 15000 });
    if (role) { await page.evaluate((r) => signIn(r), role); await page.waitForFunction(() => document.querySelector('#view .hm'), null, { timeout: 8000 }); }
    await page.waitForTimeout(300);
    return { ctx, page };
  }
  // what the home page shows right now
  const home = (page) => page.evaluate(() => {
    const t = (e) => (e ? e.textContent : '').replace(/\s+/g, ' ').trim();
    const q = (s) => document.querySelector('#view ' + s);
    return {
      look: q('.hm') ? q('.hm').className : '', h1: t(q('h1')), eyebrow: t(q('.hm-eyebrow')), sum: t(q('.hm-sum')),
      next: t(q('.hm-next')), tiles: [...document.querySelectorAll('#view .hm-tile-h span:last-child, #view .hm-bt-l')].map(t),
      rows: [...document.querySelectorAll('#view .hm-list > li')].map((li) => li.classList.contains('hm-now') ? 'NOW' : t(li.querySelector('.hm-time')) + ' | ' + t(li.querySelector('.hm-what b')) + ' | ' + t(li.querySelector('.hm-pill'))),
      chips: [...document.querySelectorAll('#view .hm-chip')].map(t), secs: [...document.querySelectorAll('#view [data-hm]')].map((x) => x.dataset.hm),
      sched: q('.hm-sched') ? q('.hm-sched').dataset.sched : '',
      acts: [...document.querySelectorAll('#view .hm-acts button')].map((b) => b.getAttribute('aria-label') || t(b)), sw: document.documentElement.scrollWidth, vw: innerWidth,
    };
  });
  const modalOn = (page) => page.evaluate(() => el('modal').classList.contains('on') ? el('mdTitle').textContent.trim() : '');
  const shut = (page) => page.evaluate(() => { HM.edit = null; closeAll(); render(); });

  // ---------------- 1. look A, the list, at 10:00 AM ----------------
  {
    const { ctx, page } = await demo('10:00');
    const s = await home(page);
    check('home: look A (clear agenda) is the standard look', /\bhm-a\b/.test(s.look), s.look);
    check('home: greeting, date and time in the header', /^Good morning, \w+\.$/.test(s.h1) && /Wednesday, October 21/.test(s.eyebrow) && /10:00 AM/.test(s.eyebrow), s.h1 + ' | ' + s.eyebrow);
    check('home: the header counts what needs attention', /\d+ items? needs? your attention/.test(s.sum), s.sum);
    check('home: Add appointment, Add shift, Show me around and Customize in the header',
      s.acts.some((a) => /Add appointment/.test(a)) && s.acts.some((a) => /Add shift/.test(a)) && s.acts.some((a) => /Show me around/.test(a)) && s.acts.includes('Customize your home page'), s.acts.join(', '));
    check('home: the director’s standard numbers', JSON.stringify(s.tiles) === JSON.stringify(['Open tasks', 'Staff on shift now', 'Appointments today', 'Open incidents']), s.tiles.join(', '));
    check('home: Next up is the 10:30 appointment, in 30 min', /Next up · in 30 min/i.test(s.next) && /Neurology follow-up/.test(s.next) && /10:30 AM to 11:30 AM/.test(s.next), s.next);
    check('home: today’s schedule is a list', s.sched === 'list');
    check('home: the day shift is on now, first in the list', /^6:30 AM \| Day shift \| On now$/.test(s.rows[0]), s.rows[0]);
    check('home: the Now line sits between what has started and what has not', s.rows[1] === 'NOW', s.rows.slice(0, 3).join(' / '));
    check('home: the next appointment is marked, In 30 min', /^10:30 AM \| Neurology follow-up \| In 30 min$/.test(s.rows[2]) && await page.evaluate(() => document.querySelectorAll('#view .hm-row.next').length === 1), s.rows[2]);
    check('home: the rest of the day in time order, reminders last', s.rows.indexOf('2:00 PM | Evening shift | Scheduled') > s.rows.findIndex((r) => /Dentist/.test(r)) && /^Today \| .* \| Due today$/.test(s.rows[s.rows.length - 1]), s.rows.join(' / '));
    check('home: the day shift groups everyone on it', await page.evaluate(() => /4 staff · Until 5:00 PM/.test(document.querySelector('#view .hm-row .hm-what span').textContent)));
    const all = s.chips[0], n = +(all.match(/(\d+)$/) || [])[1], parts = s.chips.slice(1).reduce((a, c) => a + +(c.match(/(\d+)$/) || [])[1], 0);
    check('home: the filter chips add up to All', n === parts && n === s.rows.filter((r) => r !== 'NOW').length, s.chips.join(', '));
    await page.click('#view .hm-chip:has-text("Shifts")');
    const f = await home(page);
    check('home: the Shifts chip shows only the shifts', f.rows.filter((r) => r !== 'NOW').every((r) => /shift/i.test(r)) && f.rows.filter((r) => r !== 'NOW').length === 2, f.rows.join(' / '));
    await page.click('#view .hm-chip:has-text("All")');
    check('home: the sections, in the standard order (Ask Spectrum off)', JSON.stringify(s.secs) === JSON.stringify(['schedule', 'attention', 'week', 'working', 'coming']), s.secs.join(', '));
    check('home: nothing from the old page editor lands on the home page', await page.evaluate(() => !document.querySelector('#view .lay-bar, #view .add-sec-tile, #layFab')));
    // clicks go where they say
    await page.click('#view .hm-row.next');
    check('home: a schedule row opens the appointment', /Neurology/.test(await page.evaluate(() => document.getElementById('drawer').classList.contains('on') ? document.getElementById('drawer').textContent : el('modal').classList.contains('on') ? el('mdBody').textContent : '')));
    await page.evaluate(() => closeAll());
    await page.click('#view .hm-tile:has-text("Open tasks")');
    check('home: the Open tasks tile opens Tasks', (await page.evaluate(() => state.view)) === 'tasks');
    await page.evaluate(() => go('home'));
    await page.click('#view .hm-week .hm-wrow');
    check('home: a weekly progress row opens its page', (await page.evaluate(() => state.view)) !== 'home');
    await page.evaluate(() => go('home'));
    // the clock moves the page along by itself
    await page.clock.setFixedTime(at('10:05'));
    await page.evaluate(() => clockTick());
    const m = await home(page);
    check('home: a minute later the page has moved on by itself (In 25 min)', /in 25 min/i.test(m.next) && m.rows.some((r) => /Neurology follow-up \| In 25 min/.test(r)) && /10:05 AM/.test(m.eyebrow), m.next);
    check('home: no sideways scrolling', s.sw <= s.vw, s.sw + ' > ' + s.vw);
    await ctx.close();
  }

  // ---------------- 2. later in the day ----------------
  {
    const { ctx, page } = await demo('15:30');
    const s = await home(page);
    check('afternoon: past appointments say Done', s.rows.some((r) => /Neurology follow-up \| Done/.test(r)) && s.rows.some((r) => /Dentist.* \| Done/.test(r)), s.rows.join(' / '));
    check('afternoon: the evening shift is on now', s.rows.some((r) => /Evening shift \| On now/.test(r)), s.rows.join(' / '));
    check('afternoon: Next up moved to the 4:00 PM appointment', /in 30 min/i.test(s.next) && /Physio/.test(s.next), s.next);
    await ctx.close();
  }

  // ---------------- 3. Customize your home page ----------------
  {
    const { ctx, page } = await demo('10:00');
    await page.click('#view button[aria-label="Customize your home page"]');
    check('customize: the cog opens Customize your home page', (await modalOn(page)) === 'Customize your home page');
    check('customize: a director can also set the agency default for each role', await page.evaluate(() => [...document.querySelectorAll('.hm-tgt .set-tab')].map((b) => b.textContent).join(',')) === 'Your home page,Directors,Staff,Families');
    await page.click('.hm-opt:has-text("Bold overview")');
    let s = await home(page);
    check('customize: Bold overview shows behind the window at once', /\bhm-b\b/.test(s.look) && await page.evaluate(() => !!document.querySelector('#view .hm-hero-b .hm-hb-tiles')), s.look);
    await page.click('.hm-opt:has-text("Timeline")');
    s = await home(page);
    check('customize: Timeline switches today to the timeline', s.sched === 'timeline');
    await page.click('.hm-opt:has-text("Month")');
    check('customize: Month switches today to the month', (await home(page)).sched === 'month');
    await page.click('.hm-opt:has-text("List")');
    // numbers at the top: four at most
    await page.click('.hm-tpick label:has-text("Open incidents") input');
    await page.click('.hm-tpick label:has-text("Certifications to renew") input');
    s = await home(page);
    check('customize: swapping a number shows straight away', s.tiles.includes('Certifications to renew') && !s.tiles.includes('Open incidents'), s.tiles.join(', '));
    check('customize: with four chosen, the others wait (no fifth)', await page.evaluate(() => [...document.querySelectorAll('.hm-tpick input')].filter((i) => !i.checked).every((i) => i.disabled)));
    // Next up off
    await page.click('.hm-switch input');
    check('customize: Next up can be turned off', await page.evaluate(() => !document.querySelector('#view .hm-next')));
    // sections: hide one, move one
    await page.click('.hm-secs li[data-sec="working"] label input');
    await page.click('.hm-secs li[data-sec="coming"] button[aria-label^="Move Coming up up"]');
    await page.click('.hm-secs li[data-sec="coming"] button[aria-label^="Move Coming up up"]');   // past the hidden one too
    await page.click('.hm-secs li[data-sec="ask"] label input');
    s = await home(page);
    check('customize: hiding Who’s working and showing Ask Spectrum, moving Coming up', JSON.stringify(s.secs) === JSON.stringify(['schedule', 'attention', 'coming', 'week', 'ask']), s.secs.join(', '));
    // Ask Spectrum on the page hands the question to the Ask panel
    await page.fill('#hmAskQ', 'What is still due before inspection?');
    await page.press('#hmAskQ', 'Enter');
    await page.waitForTimeout(300);
    check('customize: Ask Spectrum on the page asks in the Ask panel', await page.evaluate(() => el('askPanel').classList.contains('on') && /What is still due before inspection\?/.test(el('askLog').textContent)));
    await page.evaluate(() => { if (el('askPanel').classList.contains('on')) toggleAsk(); });
    await page.click('#view button[aria-label="Customize your home page"]').catch(() => {});
    if (!(await modalOn(page))) await page.evaluate(() => { if (!el('modal').classList.contains('on')) hmCustDraw(); });
    // Cancel puts it all back
    await page.click('#mdFoot button:has-text("Cancel")');
    s = await home(page);
    check('customize: Cancel puts the page back as it was', /\bhm-a\b/.test(s.look) && s.sched === 'list' && s.tiles.includes('Open incidents') && JSON.stringify(s.secs) === JSON.stringify(['schedule', 'attention', 'week', 'working', 'coming']) && !!(await page.$('#view .hm-next')), JSON.stringify(s));
    // and Save keeps it
    await page.click('#view button[aria-label="Customize your home page"]');
    await page.click('.hm-opt:has-text("Bold overview")');
    await page.click('.hm-opt:has-text("Timeline")');
    await page.click('.hm-secs li[data-sec="week"] button[aria-label^="Move This week"][aria-label$="up"]');
    await page.click('#mdFoot button:has-text("Save")');
    s = await home(page);
    const saved = await page.evaluate(() => (USER_SET[userKey()].home || {}).director);
    check('customize: Save keeps the new layout and closes the window', !(await modalOn(page)) && /\bhm-b\b/.test(s.look) && s.sched === 'timeline' && JSON.stringify(s.secs) === JSON.stringify(['schedule', 'week', 'attention', 'working', 'coming']), JSON.stringify(s.secs));
    check('customize: it is saved with this person’s settings, for this role', saved && saved.look === 'b' && saved.sched === 'timeline' && saved.order[0] === 'week', JSON.stringify(saved));
    await page.evaluate(() => render());
    check('customize: still there after the page redraws', /\bhm-b\b/.test((await home(page)).look));
    // the timeline: every bar inside its lane, none on top of another
    const tl = await page.evaluate(() => [...document.querySelectorAll('#view .hm-tl-row')].map((row) => {
      const rb = row.getBoundingClientRect(), bars = [...row.querySelectorAll('.hm-bar')].map((b) => b.getBoundingClientRect());
      const overlap = bars.some((a, i) => bars.some((b, j) => j > i && a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1));
      const inside = bars.every((b) => b.top >= rb.top - 1 && b.bottom <= rb.bottom + 1 && b.left >= rb.left - 1 && b.right <= rb.right + 1);
      return { n: bars.length, overlap, inside };
    }));
    check('timeline: four lanes, appointments, shifts, meetings and reminders', tl.length === 4, JSON.stringify(tl));
    check('timeline: no bar sits on another, and each stays in its lane', tl.every((r) => !r.overlap && r.inside), JSON.stringify(tl));
    check('timeline: the gold Now line is drawn', await page.evaluate(() => /Now 10:00 AM/.test((document.querySelector('#view .hm-tl-nowlab') || {}).textContent || '')));
    await page.click('#view .hm-tl-row .hm-bar:has-text("Neurology")');
    check('timeline: a bar opens its appointment', await page.evaluate(() => document.getElementById('drawer').classList.contains('on') || el('modal').classList.contains('on')));
    await shut(page);
    // the month
    await page.evaluate(() => { HM.edit = Object.assign(hmDraft(hmCfg(true)), { sched: 'month' }); hmCustSave(); });
    const tomorrow = await page.evaluate(() => iso(addDays(TODAY, 1)));
    check('month: today is marked and days with appointments have dots', await page.evaluate((d) => !!document.querySelector('#view .hm-day.today') && !!document.querySelector(`#view .hm-day[onclick*="${d}"] .hm-dots i`), tomorrow));
    await page.click(`#view .hm-day[onclick*="${tomorrow}"]`);
    check('month: clicking a day lists what is on it', /Care plan review/.test(await page.evaluate(() => document.querySelector('#view .hm-mon-day').textContent)));
    await page.click('#view button[aria-label="Next month"]');
    check('month: the arrows move a month', /November 2026/.test(await page.evaluate(() => document.querySelector('#view .hm-mon-h b').textContent)));
    await page.evaluate(() => { HM.month = 0; HM.day = null; });
    // your own section
    await page.evaluate(() => { HM.edit = Object.assign(hmDraft(hmCfg(true)), { sched: 'list', look: 'a' }); hmCustSave(); });
    await page.click('#view button[aria-label="Customize your home page"]');
    await page.click('.hm-cust button:has-text("Add your own section")');
    await page.click('#mdBody button:has-text("Notes")');
    await page.fill('#csTitle', 'Phone tree');
    await page.fill('#csText', 'Call the house lead first.');
    await page.click('#mdFoot button:has-text("Save")');
    s = await home(page);
    check('own section: added, it shows last on the home page, once', s.secs[s.secs.length - 1].startsWith('cs:') && await page.evaluate(() => document.querySelectorAll('#view [data-cs]').length === 1 && /Phone tree/.test(document.querySelector('#view [data-cs]').textContent)), s.secs.join(', '));
    await page.click('#view button[aria-label="Customize your home page"]');
    check('own section: listed in Customize as your own', await page.evaluate(() => /Phone tree\s*your own/.test([...document.querySelectorAll('.hm-secs li')].map((l) => l.textContent).join('|'))));
    await page.click('.hm-secs li[data-sec^="cs:"] .hm-secdel');
    await page.click('#mdFoot button.danger');
    check('own section: Remove takes it off', await page.evaluate(() => !document.querySelector('#view [data-cs]')));
    // the old ways in now open Customize
    await page.evaluate(() => pageEditStart());
    check('customize: Edit this page on the home page opens Customize', (await modalOn(page)) === 'Customize your home page' && !(await page.evaluate(() => state.layoutEdit)));
    await shut(page);
    await page.evaluate(() => settingsHub('edit', 'home'));
    check('customize: the settings window offers Customize your home page', await page.evaluate(() => /Customize your home page/.test(el('mdBody').textContent)));
    await shut(page);
    // the tour skips what someone hid
    await page.evaluate(() => { HM.edit = Object.assign(hmDraft(hmCfg(true)), { hidden: ['attention', 'ask'] }); hmCustSave(); tourStart(); });
    const t1 = await page.evaluate(() => document.getElementById('tourCard').textContent);
    await page.click('#tourCard button:has-text("Next")');
    const t2 = await page.evaluate(() => document.getElementById('tourCard').textContent);
    check('tour: starts on today’s schedule and skips the hidden attention list', /The day at a glance/.test(t1) && /Step 3 of/.test(t2) && /One place per job/.test(t2), t1.slice(0, 60) + ' / ' + t2.slice(0, 60));
    await page.evaluate(() => tourEnd());
    await ctx.close();
  }

  // ---------------- 4. staff and family ----------------
  {
    const { ctx, page } = await demo('10:00', null, 'staff');
    const s = await home(page);
    check('staff: their own numbers (Your shift, Clients today, Open tasks, Appointments today)', JSON.stringify(s.tiles) === JSON.stringify(['Your shift', 'Clients today', 'Open tasks', 'Appointments today']), s.tiles.join(', '));
    check('staff: Your tasks and Your training are among the sections', s.secs.includes('mytasks') && s.secs.includes('training'), s.secs.join(', '));
    check('staff: the three quick buttons stay', await page.evaluate(() => !!document.querySelector('#view .act-strip')));
    check('staff: no Add shift', !s.acts.some((a) => /Add shift/.test(a)), s.acts.join(', '));
    await page.click('#view button[aria-label="Customize your home page"]');
    check('staff: can customize their own page, but not the agency default', (await modalOn(page)) === 'Customize your home page' && !(await page.$('.hm-tgt')));
    await page.click('.hm-opt:has-text("Bold overview")');
    await page.click('#mdFoot button:has-text("Save")');
    check('staff: their own look is saved for them', /\bhm-b\b/.test((await home(page)).look) && await page.evaluate(() => USER_SET[userKey()].home.staff.look === 'b'));
    await ctx.close();
  }
  {
    const { ctx, page } = await demo('15:30', null, 'family');
    const s = await home(page);
    check('family: their numbers (documents, next appointment, who is on shift, messages)', JSON.stringify(s.tiles) === JSON.stringify(['Shared documents', 'Next appointment', 'On shift with 4023180', 'Unread messages']), s.tiles.join(', '));
    const nx = await page.evaluate(() => document.querySelector('#view .hm-tile:nth-child(2)').textContent.replace(/\s+/g, ' '));
    check('family: Next appointment is one still to come, not one already over today', !/Dentist/.test(nx) && /Guardian check-in call/.test(nx), nx);
    check('family: no shifts in their schedule, and no Add buttons', !s.chips.some((c) => /Shifts/.test(c)) && !s.acts.some((a) => /Add /.test(a)), s.chips.join(', ') + ' | ' + s.acts.join(', '));
    check('family: Needs your attention and Coming up', JSON.stringify(s.secs) === JSON.stringify(['schedule', 'attention', 'coming']), s.secs.join(', '));
    await ctx.close();
  }

  // ---------------- 5. phone ----------------
  {
    const { ctx, page } = await demo('10:00', { width: 390, height: 844 });
    let s = await home(page);
    check('phone: no sideways scrolling in look A', s.sw <= 390, s.sw);
    check('phone: the numbers sit two to a row', await page.evaluate(() => { const t = [...document.querySelectorAll('#view .hm-tile')].map((x) => Math.round(x.getBoundingClientRect().top)); return t[0] === t[1] && t[2] === t[3] && t[0] !== t[2]; }));
    await page.evaluate(() => { HM.edit = Object.assign(hmDraft(hmCfg(true)), { look: 'b', sched: 'timeline' }); hmCustSave(); });
    s = await home(page);
    const tw = await page.evaluate(() => { const w = document.querySelector('#view .hm-tl-wrap'); return [w.scrollWidth, w.clientWidth]; });
    check('phone: look B and the timeline, no sideways scrolling of the page', s.sw <= 390, s.sw);
    check('phone: the timeline scrolls inside its card instead', tw[0] > tw[1], tw.join('/'));
    await page.click('#view button[aria-label="Customize your home page"]');
    const md = await page.evaluate(() => { const b = el('modal').getBoundingClientRect(); return [Math.round(b.left), Math.round(b.width), Math.round(b.bottom)]; });
    check('phone: Customize opens as a sheet across the screen', md[0] === 0 && md[1] >= 388 && md[2] >= 840, md.join('/'));
    await ctx.close();
  }

  // ---------------- 6. saved to the account (a stub sign-in) ----------------
  {
    const dir = 'dana@maple.test', stf = 'sam@maple.test';
    const program = [
      { key: 'users', value: { map: { [dir]: { name: 'Dana Director', role: 'director', title: 'Executive Director' }, [stf]: { name: 'Sam Staff', role: 'staff', title: 'Direct Support Professional' } } } },
      { key: 'pilot', value: { signatures: { ['u:' + dir]: { by: 'Dana Director', at: 'Oct 1, 2026', role: 'Director' }, ['u:' + stf]: { by: 'Sam Staff', at: 'Oct 2, 2026', role: 'Staff' } } } },
      { key: 'usersettings', value: { map: { [dir]: { home: { director: { look: 'b', sched: 'timeline', next: true, tiles: ['tasks', 'certs'], order: ['week', 'attention', 'working', 'coming', 'ask'], hidden: ['ask', 'coming'] } } }, [stf]: { tourSeen: { staff: 1 } } } } },
    ];
    const D = { email: dir, password: 'qa-pass-1234', role: 'director', program };
    const signin = async (S) => {
      const { ctx, page } = await H.newPage(env, { session: S, bucket: errors });
      await page.clock.setFixedTime(at('10:00'));
      await page.goto(env.BASE + '/portal.html', { waitUntil: 'load' });
      await page.waitForFunction(() => !document.documentElement.classList.contains('np-boot'), null, { timeout: 15000 });
      await page.fill('#liEmail', S.email); await page.fill('#liPw', S.password); await page.click('#liGo');
      await page.waitForFunction(() => typeof realSession === 'function' && realSession() && document.querySelector('#view .hm'), null, { timeout: 15000 });
      await page.waitForTimeout(1500);
      return { ctx, page };
    };
    let { ctx, page } = await signin(D);
    let s = await home(page);
    check('account: the saved home page comes back on sign-in (look B, timeline)', /\bhm-b\b/.test(s.look) && s.sched === 'timeline', s.look + ' ' + s.sched);
    check('account: with the saved numbers and sections', JSON.stringify(s.tiles) === JSON.stringify(['Open tasks', 'Certifications to renew']) && JSON.stringify(s.secs) === JSON.stringify(['schedule', 'week', 'attention', 'working']), s.tiles.join(', ') + ' | ' + s.secs.join(', '));
    // change it and save
    D.writes = [];
    await page.click('#view button[aria-label="Customize your home page"]');
    await page.click('.hm-opt:has-text("Clear agenda")');
    await page.click('.hm-opt:has-text("Month")');
    await page.click('#mdFoot button:has-text("Save")');
    await page.waitForTimeout(1200);
    const w = D.writes.filter((x) => x.key === 'usersettings').pop();
    const mine = w && w.value.map[dir] && w.value.map[dir].home && w.value.map[dir].home.director;
    check('account: Save writes this person’s home page to the agency’s settings', mine && mine.look === 'a' && mine.sched === 'month', JSON.stringify(mine));
    check('account: and leaves everyone else’s settings as they were', w && JSON.stringify(w.value.map[stf]) === JSON.stringify({ tourSeen: { staff: 1 } }), JSON.stringify(w && w.value.map[stf]));
    // the agency default for staff
    D.writes = [];
    await page.click('#view button[aria-label="Customize your home page"]');
    await page.click('.hm-tgt .set-tab:has-text("Staff")');
    check('default: the staff tab lists the staff numbers and sections', await page.evaluate(() => /Your shift/.test(document.querySelector('.hm-tpick').textContent) && !!document.querySelector('.hm-secs li[data-sec="mytasks"]')));
    check('default: setting it does not change the director’s own page behind', /\bhm-a\b/.test((await home(page)).look));
    await page.click('.hm-opt:has-text("Bold overview")');
    await page.click('.hm-opt:has-text("Timeline")');
    await page.click('#mdFoot button:has-text("Save the default for staff")');
    await page.waitForTimeout(1200);
    const dw = D.writes.filter((x) => x.key === 'homedefault').pop();
    check('default: saved as the agency’s home page default for staff', dw && dw.value.staff && dw.value.staff.look === 'b' && dw.value.staff.sched === 'timeline', JSON.stringify(dw));
    check('default: the director’s own page is untouched', /\bhm-a\b/.test((await home(page)).look) && (await home(page)).sched === 'month');
    await ctx.close();
    // the same director on another device
    ({ ctx, page } = await signin(D));
    s = await home(page);
    check('account: on another device the home page is the one saved last', /\bhm-a\b/.test(s.look) && s.sched === 'month', s.look + ' ' + s.sched);
    await ctx.close();
    // a staff member who never set up their own gets the agency default
    const St = { email: stf, password: 'qa-pass-5678', role: 'staff', program };
    ({ ctx, page } = await signin(St));
    s = await home(page);
    check('default: staff with no home page of their own get the agency default', await page.evaluate(() => state.role) === 'staff' && /\bhm-b\b/.test(s.look) && s.sched === 'timeline', s.look + ' ' + s.sched);
    St.writes = [];
    await page.click('#view button[aria-label="Customize your home page"]');
    check('default: staff cannot change the agency default', !(await page.$('.hm-tgt')));
    await page.click('.hm-opt:has-text("Clear agenda")');
    await page.click('#mdFoot button:has-text("Save")');
    await page.waitForTimeout(1200);
    s = await home(page);
    check('staff: their own choice wins over the default', /\bhm-a\b/.test(s.look) && St.writes.some((x) => x.key === 'usersettings' && x.value.map[stf].home && x.value.map[stf].home.staff.look === 'a') && !St.writes.some((x) => x.key === 'homedefault'), JSON.stringify(St.writes.map((x) => x.key)));
    await page.click('#view button[aria-label="Customize your home page"]');
    await page.click('#mdFoot button:has-text("Use the agency default")');
    await page.waitForTimeout(800);
    check('staff: Use the agency default goes back to it', /\bhm-b\b/.test((await home(page)).look));
    await ctx.close();
  }

  // ---------------- 7. a new agency with nothing in it yet ----------------
  {
    const email = 'nia@new-agency.test';
    const S = { email, password: 'qa-pass-0000', role: 'director', program: [
      { key: 'users', value: { map: { [email]: { name: 'Nia New', role: 'director' } } } },
      { key: 'pilot', value: { signatures: { ['u:' + email]: { by: 'Nia New', at: 'Oct 1, 2026', role: 'Director' } } } },
      { key: 'hidesample', value: { v: true } }] };
    const { ctx, page } = await H.newPage(env, { session: S, bucket: errors });
    await page.clock.setFixedTime(at('10:00'));
    await page.goto(env.BASE + '/portal.html', { waitUntil: 'load' });
    await page.waitForFunction(() => !document.documentElement.classList.contains('np-boot'), null, { timeout: 15000 });
    await page.fill('#liEmail', email); await page.fill('#liPw', S.password); await page.click('#liGo');
    await page.waitForFunction(() => typeof realSession === 'function' && realSession() && document.querySelector('#view .hm'), null, { timeout: 15000 });
    await page.waitForTimeout(1200);
    const s = await home(page);
    check('empty agency: every number reads 0 with a plain line under it', await page.evaluate(() => [...document.querySelectorAll('#view .hm-tile-v')].every((v) => v.textContent.trim() === '0')), s.tiles.join(', '));
    check('empty agency: the header says nothing needs them', /Nothing needs you right now/.test(s.sum), s.sum);
    check('empty agency: Needs your attention says so instead of an empty card', /Nothing needs you right now\./.test(await page.evaluate(() => document.querySelector('#view .hm-attn').textContent)));
    check('empty agency: no stray dot on a 0% progress ring', await page.evaluate(() => document.querySelectorAll('#view .hm-ring circle').length === 1));
    check('empty agency: "0 of 0" rows show an empty bar, not a full one', await page.evaluate(() => [...document.querySelectorAll('#view .hm-wrow')].filter((r) => /0 of 0/.test(r.textContent)).every((r) => r.querySelector('i em').style.width === '0%')));
    check('empty agency: Who’s working and Coming up say there is nothing yet', await page.evaluate(() => /No one is on shift right now/.test(document.querySelector('#view .hm-work').textContent) && /Nothing coming up/.test(document.querySelector('#view .hm-coming').textContent)));
    await ctx.close();
  }

  check('no page errors in the whole run', !errors.length, errors.slice(0, 5).join(' | '));
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (failures.length) console.log('Failures:\n  ' + failures.join('\n  '));
  await env.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
