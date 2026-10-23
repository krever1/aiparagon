// A stand-in for the care portal's Supabase, for suites that reload: np_demo_* tables kept in memory with PostgREST-style
// filters (eq, is, like, in, not), and a storage bucket that keeps uploaded files and serves them back through signed links.
// Pass store.rest to the harness as opts.rest and call store.route(ctx) after newPage; np_demo_program and sign-in stay
// with the harness's own session stub.
function parseFilters(qs) {
  const out = [];
  for (const [k, v0] of new URLSearchParams(qs)) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict'].includes(k) || k === 'org_id') continue;
    let v = v0, neg = false;
    if (v.startsWith('not.')) { neg = true; v = v.slice(4); }
    const dot = v.indexOf('.'); const op = v.slice(0, dot), arg = v.slice(dot + 1);
    out.push({ k, op, arg, neg });
  }
  return out;
}
function test(row, f) {
  const val = row[f.k];
  let ok;
  if (f.op === 'eq') ok = String(val) === f.arg && val != null;
  else if (f.op === 'is') ok = f.arg === 'null' ? val == null : String(val) === f.arg;
  else if (f.op === 'like' || f.op === 'ilike') {
    const re = new RegExp('^' + f.arg.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/%/g, '.*') + '$', f.op === 'ilike' ? 'i' : '');
    ok = val != null && re.test(String(val));
  } else if (f.op === 'in') ok = f.arg.replace(/^\(|\)$/g, '').split(',').map((x) => x.replace(/^"|"$/g, '')).includes(String(val));
  else if (f.op === 'gt') ok = val > f.arg; else if (f.op === 'lt') ok = val < f.arg;
  else if (f.op === 'gte') ok = val >= f.arg; else if (f.op === 'lte') ok = val <= f.arg;
  else ok = true;
  return f.neg ? !ok : ok;
}
function makeStore(seed) {
  const T = Object.assign({}, seed || {});           // table -> rows
  const files = {};                                  // storage path -> Buffer
  const log = [];                                    // every write, for checks
  let n = 1000;
  const rows = (t) => (T[t] = T[t] || []);
  const rest = async ({ method, path: p, body, headers }) => {
    let m;
    m = p.match(/^\/rest\/v1\/(np_demo_[a-z_]+)(?:\?(.*))?$/);
    if (!m || m[1] === 'np_demo_program') return undefined;
    const t = m[1], qs = m[2] || '', fl = parseFilters(qs);
    if (t === 'np_demo_presence' || p.includes('/rpc/')) return undefined;
    if (method === 'GET') {
      let r = rows(t).filter((x) => fl.every((f) => test(x, f)));
      const ord = new URLSearchParams(qs).get('order');
      if (ord) { const [c, dir] = ord.split('.'); r = r.slice().sort((a, b) => (String(a[c]) < String(b[c]) ? -1 : String(a[c]) > String(b[c]) ? 1 : 0) * (dir === 'desc' ? -1 : 1)); }
      return { status: 200, body: r };
    }
    if (method === 'POST') {
      let b = []; try { b = [].concat(JSON.parse(body || '[]')); } catch (e) {}
      const upsert = /merge-duplicates/.test((headers && (headers.prefer || headers.Prefer)) || '');
      const made = b.map((row) => {
        const r = Object.assign({}, row);
        if (r.id == null) r.id = n++;
        if (!r.created_at) r.created_at = new Date(Date.now() + n).toISOString();
        const i = upsert ? rows(t).findIndex((x) => String(x.id) === String(r.id)) : -1;
        if (i >= 0) rows(t)[i] = Object.assign({}, rows(t)[i], r); else rows(t).push(r);
        log.push({ t, op: upsert ? 'upsert' : 'insert', row: r });
        return r;
      });
      return { status: 201, body: made };
    }
    if (method === 'PATCH') {
      let b = {}; try { b = JSON.parse(body || '{}'); } catch (e) {}
      const hit = rows(t).filter((x) => fl.every((f) => test(x, f)));
      hit.forEach((x) => Object.assign(x, b));
      log.push({ t, op: 'patch', q: qs, set: b, n: hit.length });
      return { status: 200, body: hit };
    }
    if (method === 'DELETE') {
      const keep = rows(t).filter((x) => !fl.every((f) => test(x, f)));
      const gone = rows(t).length - keep.length; T[t] = keep;
      log.push({ t, op: 'delete', q: qs, n: gone });
      return { status: 200, body: [] };
    }
    return undefined;
  };
  // storage, with the file bytes: registered on the context after the harness's own route, so it is asked first
  const route = async (ctx) => {
    await ctx.route(/\/storage\/v1\/object\//, async (r) => {
      const req = r.request(), u = new URL(req.url()), meth = req.method();
      const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
      if (meth === 'OPTIONS') return r.fulfill({ status: 204, headers: cors });
      let m = u.pathname.match(/\/storage\/v1\/object\/sign\/np-demo-docs\/(.+)$/);
      if (m && meth === 'POST') { const k = decodeURIComponent(m[1]); return files[k] ? r.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ signedURL: `/object/sign/np-demo-docs/${m[1]}?token=qa` }) }) : r.fulfill({ status: 400, headers: cors, contentType: 'application/json', body: '{"error":"Object not found"}' }); }
      if (m && meth === 'GET') { const k = decodeURIComponent(m[1]); return files[k] ? r.fulfill({ status: 200, headers: cors, contentType: files[k].type || 'application/octet-stream', body: files[k].buf }) : r.fulfill({ status: 404, headers: cors, body: 'not found' }); }
      m = u.pathname.match(/\/storage\/v1\/object\/np-demo-docs\/(.+)$/);
      if (m && meth === 'POST') { files[decodeURIComponent(m[1])] = { buf: req.postDataBuffer() || Buffer.alloc(0), type: req.headers()['content-type'] }; log.push({ t: 'storage', op: 'put', k: decodeURIComponent(m[1]) }); return r.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ Key: m[1] }) }); }
      if (m && meth === 'DELETE') { delete files[decodeURIComponent(m[1])]; log.push({ t: 'storage', op: 'del', k: decodeURIComponent(m[1]) }); return r.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: '{}' }); }
      if (m && meth === 'GET') { const k = decodeURIComponent(m[1]); return files[k] ? r.fulfill({ status: 200, headers: cors, body: files[k].buf }) : r.fulfill({ status: 404, headers: cors, body: 'not found' }); }
      return r.fulfill({ status: 404, headers: cors, body: 'not found' });
    });
  };
  return { T, files, log, rest, rows, route };
}
module.exports = { makeStore };
