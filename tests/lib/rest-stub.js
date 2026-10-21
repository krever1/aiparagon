// A small in-memory stand-in for Supabase's REST API (PostgREST), for the Engine 3 suites.
// It reads the table and the simple filters the dashboard sends (eq, neq, in, is, not.is, ilike), keeps
// writes in memory and logs them, so a test can check what the page saved. Nothing leaves the browser.
function makeStore(tables) {
  const db = JSON.parse(JSON.stringify(tables || {}));
  const writes = [];
  let seq = 1;
  const uid = () => '00000000-0000-4000-9000-' + String(seq++).padStart(12, '0');

  function parse(path) {
    const u = new URL('http://x' + path);
    const table = u.pathname.replace(/^\/rest\/v1\//, '');
    const filters = [];
    let order = null, limit = null;
    for (const [k, v] of u.searchParams) {
      if (k === 'select' || k === 'on_conflict') continue;
      if (k === 'order') { order = v; continue; }
      if (k === 'limit') { limit = +v; continue; }
      if (k === 'offset') continue;
      filters.push([k, v]);
    }
    return { table, filters, order, limit };
  }
  const val = (row, k) => (row[k] === undefined ? null : row[k]);
  function test(row, k, expr) {
    const not = expr.startsWith('not.');
    const e = not ? expr.slice(4) : expr;
    const i = e.indexOf('.');
    const op = e.slice(0, i), arg = decodeURIComponent(e.slice(i + 1));
    const v = val(row, k);
    let ok;
    if (op === 'eq') ok = v != null && String(v) === arg;
    else if (op === 'neq') ok = v == null || String(v) !== arg;
    else if (op === 'is') ok = arg === 'null' ? v == null : String(v) === arg;
    else if (op === 'in') ok = arg.replace(/^\(|\)$/g, '').split(',').map((x) => x.replace(/^"|"$/g, '')).includes(String(v));
    else if (op === 'ilike' || op === 'like') { const re = new RegExp('^' + arg.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$', 'i'); ok = v != null && re.test(String(v)); }
    else if (op === 'gt') ok = v != null && v > arg;
    else if (op === 'gte') ok = v != null && v >= arg;
    else if (op === 'lt') ok = v != null && v < arg;
    else ok = true;
    return not ? !ok : ok;
  }
  function select(q) {
    let rows = (db[q.table] || []).filter((r) => q.filters.every(([k, e]) => test(r, k, e)));
    if (q.order) {
      const [col, dir] = q.order.split(',')[0].split('.');
      rows = rows.slice().sort((a, b) => {
        const x = val(a, col), y = val(b, col);
        if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1;
        return (x < y ? -1 : x > y ? 1 : 0) * (dir === 'desc' ? -1 : 1);
      });
    }
    if (q.limit != null) rows = rows.slice(0, q.limit);
    return rows;
  }
  // returns { status, body } for one request
  function handle(method, path, bodyText, headers) {
    const q = parse(path);
    let body = null;
    try { body = bodyText ? JSON.parse(bodyText) : null; } catch (e) { body = null; }
    if (method === 'GET') return { status: 200, body: select(q) };
    if (method === 'POST') {
      const list = Array.isArray(body) ? body : [body];
      const merge = /merge-duplicates/.test((headers && headers.prefer) || '');
      db[q.table] = db[q.table] || [];
      const out = list.map((b) => {
        if (merge && q.table === 'ai_settings' && b && b.key) {
          const ex = db[q.table].find((r) => r.key === b.key);
          if (ex) { Object.assign(ex, b); return ex; }
        }
        const row = Object.assign({ id: uid(), created_at: new Date().toISOString() }, b);
        db[q.table].push(row);
        return row;
      });
      writes.push({ method, table: q.table, body, filters: q.filters });
      return { status: 201, body: out };
    }
    if (method === 'PATCH') {
      // a table set in db.__lock answers an update with no rows, as Supabase does when a policy refuses it
      if ((q.table === 'creative_briefs' && db.__lockCreative) || (db.__lock && db.__lock[q.table])) { writes.push({ method, table: q.table, body, filters: q.filters, refused: true }); return { status: 200, body: [] }; }
      const rows = select(Object.assign({}, q, { order: null, limit: null }));
      rows.forEach((r) => Object.assign(r, body));
      writes.push({ method, table: q.table, body, filters: q.filters, n: rows.length });
      return { status: 200, body: rows };
    }
    if (method === 'DELETE') {
      const rows = select(Object.assign({}, q, { order: null, limit: null }));
      db[q.table] = (db[q.table] || []).filter((r) => !rows.includes(r));
      writes.push({ method, table: q.table, filters: q.filters, n: rows.length });
      return { status: 200, body: rows };
    }
    return { status: 204, body: null };
  }
  return { db, writes, handle };
}

module.exports = { makeStore };
