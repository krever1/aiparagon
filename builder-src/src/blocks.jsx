// The sections a page is made of: the fields the editor shows for each one, and how each renders.
// One config drives both the editor canvas (<Puck>) and the published page (<Render>).
// Motion rules: entrance animations only run on the published page (never while editing), everything
// holds still for prefers-reduced-motion, and the particle canvas pauses when it is out of view.
// Puck renders the editor canvas in an iframe, so window work goes through the element's own window.
import { useEffect, useRef } from 'react';

export const ACCENTS = {
  cyan: { label: 'Cyan', dark: '#37E2D5', light: '#0B7380' },
  amber: { label: 'Amber', dark: '#FFB547', light: '#9A5800' },
  lime: { label: 'Lime', dark: '#B6F25A', light: '#4A7A0C' },
  coral: { label: 'Coral', dark: '#FF7A66', light: '#B03A28' },
  blue: { label: 'Blue', dark: '#7AB0FF', light: '#1F4FD1' },
};

export const FONTS = {
  grotesk: { label: 'Modern', head: '"Space Grotesk", "Instrument Sans", system-ui, sans-serif' },
  editorial: { label: 'Editorial', head: '"Newsreader", Georgia, "Times New Roman", serif' },
  mono: { label: 'Technical', head: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace' },
};

const toOptions = (obj) => Object.entries(obj).map(([value, v]) => ({ label: v.label, value }));
const arr = (v) => (Array.isArray(v) ? v : []);

function winOf(el) {
  return (el && el.ownerDocument && el.ownerDocument.defaultView) || window;
}
function prefersReduced(win) {
  try {
    return !!(win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch (e) {
    return false;
  }
}
function isEditing(puck) {
  return !!(puck && puck.isEditing);
}

// Links typed into the editor: web, mail, phone, on-page (#) and relative links pass; any other
// scheme (javascript: and the like) becomes "#"
export function safeHref(h) {
  const s = String(h == null ? '' : h).trim();
  if (!s) return '#';
  if (/^(https?:|mailto:|tel:|#|\/|\.)/i.test(s)) return s;
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return '#';
  return s;
}
function safeSrc(h) {
  const s = String(h == null ? '' : h).trim();
  if (/^(https?:|\/|\.|blob:|data:image\/|data:video\/)/i.test(s)) return s;
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return '';
  return s;
}

// Adds .is-in to a section once it scrolls into view, so its .sb-reveal children fade up
function useReveal(editing) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const win = winOf(el);
    if (editing || prefersReduced(win) || !win.IntersectionObserver) {
      el.classList.add('is-in');
      return undefined;
    }
    const io = new win.IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          el.classList.add('is-in');
          io.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -6% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [editing]);
  return ref;
}

const ICON_PATHS = {
  spark: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M18 6l-2.5 2.5M8.5 15.5L6 18" />,
  film: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4" /></>,
  cursor: <path d="M5 3l14 7-6.5 1.8L10 18z" />,
  search: <><circle cx="11" cy="11" r="6" /><path d="M20 20l-4.5-4.5" /></>,
  layers: <><path d="M12 3l9 5-9 5-9-5z" /><path d="M3 13l9 5 9-5" /></>,
  bolt: <path d="M13 2L4 14h7l-1 8 9-12h-7z" />,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 3 2.5 15 0 18M12 3c-2.5 3-2.5 15 0 18" /></>,
  shield: <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />,
  phone: <><rect x="7" y="2" width="10" height="20" rx="2" /><path d="M11 18h2" /></>,
};
const ICON_OPTIONS = [
  { label: 'Spark', value: 'spark' },
  { label: 'Film', value: 'film' },
  { label: 'Pointer', value: 'cursor' },
  { label: 'Search', value: 'search' },
  { label: 'Layers', value: 'layers' },
  { label: 'Bolt', value: 'bolt' },
  { label: 'Globe', value: 'globe' },
  { label: 'Shield', value: 'shield' },
  { label: 'Phone', value: 'phone' },
];
function Icon({ name }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {ICON_PATHS[name] || ICON_PATHS.spark}
    </svg>
  );
}

// A copy of a field set without the keys a choice makes irrelevant (a video link when the
// background is not a video)
function without(fields, keys) {
  const out = {};
  for (const k of Object.keys(fields)) if (!keys.includes(k)) out[k] = fields[k];
  return out;
}

const anchorField = { type: 'text', label: 'Section ID (for menu links, e.g. faq)' };
const linkList = (label, max) => ({
  type: 'array',
  label,
  max,
  arrayFields: { label: { type: 'text', label: 'Label' }, href: { type: 'text', label: 'Link (#section, /page or https://...)' } },
  defaultItemProps: { label: 'New link', href: '#' },
  getItemSummary: (it) => it.label || 'Link',
});

/* ---------- Backgrounds ---------- */

function Particles() {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    const win = winOf(canvas);
    const ctx = canvas.getContext && canvas.getContext('2d');
    if (!ctx) return undefined;
    const still = prefersReduced(win);
    const host = canvas.parentElement;
    const pts = [];
    const mouse = { x: -1e4, y: -1e4 };
    let w = 1;
    let h = 1;
    let raf = 0;
    let visible = true;
    let tick = 0;
    let color = '#37E2D5';
    const readColor = () => {
      const c = win.getComputedStyle(canvas).getPropertyValue('--accent').trim();
      if (c) color = c;
    };
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = color;
      ctx.strokeStyle = color;
      ctx.lineWidth = 0.6;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        if (!still) {
          const dx = mouse.x - p.x;
          const dy = mouse.y - p.y;
          if (dx * dx + dy * dy < 30000) {
            p.vx += dx * 0.00003;
            p.vy += dy * 0.00003;
          }
          p.vx *= 0.994;
          p.vy *= 0.994;
          if (Math.abs(p.vx) < 0.04) p.vx += (Math.random() - 0.5) * 0.02;
          if (Math.abs(p.vy) < 0.04) p.vy += (Math.random() - 0.5) * 0.02;
          p.x += p.vx;
          p.y += p.vy;
          if (p.x < -10) p.x = w + 10;
          else if (p.x > w + 10) p.x = -10;
          if (p.y < -10) p.y = h + 10;
          else if (p.y > h + 10) p.y = -10;
        }
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
        for (let j = i + 1; j < pts.length; j++) {
          const q = pts[j];
          const ex = p.x - q.x;
          const ey = p.y - q.y;
          const d2 = ex * ex + ey * ey;
          if (d2 < 12000) {
            ctx.globalAlpha = (1 - d2 / 12000) * 0.32;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(q.x, q.y);
            ctx.stroke();
          }
        }
      }
      ctx.globalAlpha = 1;
    };
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(2, win.devicePixelRatio || 1);
      const ow = w;
      const oh = h;
      w = Math.max(1, r.width);
      h = Math.max(1, r.height);
      // Spread the points already placed over the new size (the first measure can be tiny)
      for (const p of pts) {
        p.x *= w / ow;
        p.y *= h / oh;
      }
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.round(Math.min(140, Math.max(36, (w * h) / 9500)));
      while (pts.length < n) pts.push({ x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3, r: Math.random() * 1.5 + 0.5 });
      pts.length = n;
      readColor();
      if (still) draw();
    };
    const loop = () => {
      raf = 0;
      if (!visible) return;
      tick += 1;
      if (tick % 90 === 0) readColor();
      draw();
      raf = win.requestAnimationFrame(loop);
    };
    const start = () => {
      if (!still && !raf && visible) raf = win.requestAnimationFrame(loop);
    };
    const onMove = (e) => {
      const r = canvas.getBoundingClientRect();
      mouse.x = e.clientX - r.left;
      mouse.y = e.clientY - r.top;
    };
    const onLeave = () => {
      mouse.x = -1e4;
      mouse.y = -1e4;
    };
    resize();
    const ro = win.ResizeObserver ? new win.ResizeObserver(resize) : null;
    if (ro) ro.observe(canvas);
    else win.addEventListener('resize', resize);
    const io = win.IntersectionObserver
      ? new win.IntersectionObserver((entries) => {
          visible = entries[entries.length - 1].isIntersecting;
          if (visible) start();
        })
      : null;
    if (io) io.observe(canvas);
    if (host) {
      host.addEventListener('pointermove', onMove);
      host.addEventListener('pointerleave', onLeave);
    }
    start();
    return () => {
      if (raf) win.cancelAnimationFrame(raf);
      if (ro) ro.disconnect();
      else win.removeEventListener('resize', resize);
      if (io) io.disconnect();
      if (host) {
        host.removeEventListener('pointermove', onMove);
        host.removeEventListener('pointerleave', onLeave);
      }
    };
  }, []);
  return <canvas ref={ref} className="sb-bg sb-particles" aria-hidden="true" />;
}

function BgVideo({ src }) {
  const ref = useRef(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (prefersReduced(winOf(v))) {
      v.pause();
      return;
    }
    const p = v.play && v.play();
    if (p && p.catch) p.catch(() => {});
  }, [src]);
  return <video ref={ref} className="sb-bg sb-bgvideo" src={safeSrc(src)} muted loop playsInline preload="metadata" aria-hidden="true" tabIndex={-1} />;
}

function HeroBackground({ kind, videoUrl, imageUrl, imageAlt }) {
  if (kind === 'particles') return <Particles />;
  if (kind === 'aurora') return <div className="sb-bg sb-aurora" aria-hidden="true"><i /><i /><i /></div>;
  if (kind === 'grid') return <div className="sb-bg sb-gridbg" aria-hidden="true"><i /></div>;
  if (kind === 'video' && videoUrl) return <BgVideo src={videoUrl} />;
  if (kind === 'image' && imageUrl) return <img className="sb-bg sb-bgimg" src={safeSrc(imageUrl)} alt={imageAlt || ''} />;
  return <div className="sb-bg sb-plain" aria-hidden="true" />;
}

/* ---------- Scroll story scenes (all drawn in CSS, driven by --p, the scroll progress 0 to 1) ---------- */

function makeSkyline(seed, minH, maxH, lit) {
  let s = seed >>> 0;
  const rnd = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const blds = [];
  const wins = [];
  let x = -20;
  while (x < 1620) {
    const w = 46 + rnd() * 96;
    const h = minH + rnd() * (maxH - minH);
    blds.push([Math.round(x), Math.round(600 - h), Math.round(w), Math.round(h)]);
    if (lit) {
      for (let wy = 600 - h + 14; wy < 588; wy += 18) {
        for (let wx = x + 8; wx < x + w - 10; wx += 14) if (rnd() > 0.8) wins.push([Math.round(wx), Math.round(wy)]);
      }
    }
    x += w + 2 + rnd() * 10;
  }
  return { blds, wins };
}
const SKYLINES = [makeSkyline(7, 220, 430, false), makeSkyline(19, 140, 340, false), makeSkyline(41, 80, 260, true)];

function SpaceScene() {
  return (
    <>
      <div className="sb-l sb-sky" />
      <div className="sb-l sb-stars sb-stars-far" />
      <div className="sb-l sb-stars sb-stars-near" />
      <div className="sb-l sb-nebula"><i /><i /></div>
      <div className="sb-l sb-planet"><i /></div>
    </>
  );
}

function CityScene() {
  return (
    <>
      <div className="sb-l sb-sky" />
      <div className="sb-l sb-horizon" />
      {SKYLINES.map((sk, i) => (
        <svg key={i} className={'sb-l sb-skyline sb-skyline-' + i} viewBox="0 0 1600 600" preserveAspectRatio="xMidYMax slice" focusable="false">
          {sk.blds.map((b, j) => (
            <rect key={j} x={b[0]} y={b[1]} width={b[2]} height={b[3]} />
          ))}
          {sk.wins.map((wv, j) => (
            <rect key={'w' + j} className="sb-win" x={wv[0]} y={wv[1]} width="6" height="8" />
          ))}
        </svg>
      ))}
      <div className="sb-l sb-fog" />
    </>
  );
}

function TunnelScene() {
  return (
    <>
      <div className="sb-l sb-sky" />
      <div className="sb-l sb-tunnel"><i className="sb-rings" /><i className="sb-spokes" /></div>
      <div className="sb-l sb-core" />
    </>
  );
}

function ScrollStory({ anchor, scene, videoUrl, layout, chapters, puck }) {
  const editing = isEditing(puck);
  const ref = useRef(null);
  const videoRef = useRef(null);
  const list = arr(chapters);
  const useVideo = scene === 'video' && !!videoUrl;
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const win = winOf(el);
    if (prefersReduced(win)) {
      el.setAttribute('data-still', '');
      el.style.setProperty('--p', '0.35');
      return undefined;
    }
    el.removeAttribute('data-still');
    let raf = 0;
    const update = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const vh = win.innerHeight || 1;
      const total = r.height - vh;
      const p = total > 0 ? Math.min(1, Math.max(0, -r.top / total)) : 0;
      el.style.setProperty('--p', p.toFixed(4));
      if (!editing) {
        el.querySelectorAll('.sb-chapter-card').forEach((c) => {
          const cr = c.getBoundingClientRect();
          const mid = cr.top + cr.height / 2;
          const vis = Math.max(0, Math.min(1, 1 - Math.abs(mid - vh / 2) / (vh * 0.55)));
          c.style.setProperty('--vis', vis.toFixed(3));
        });
      }
      const v = videoRef.current;
      if (v && v.duration && isFinite(v.duration)) {
        const t = p * Math.max(0, v.duration - 0.05);
        if (Math.abs(v.currentTime - t) > 0.04) {
          try {
            v.currentTime = t;
          } catch (e) {
            /* not seekable yet */
          }
        }
      }
    };
    const onScroll = () => {
      if (!raf) raf = win.requestAnimationFrame(update);
    };
    win.addEventListener('scroll', onScroll, { passive: true });
    win.addEventListener('resize', onScroll);
    const v = videoRef.current;
    if (v) v.addEventListener('loadedmetadata', onScroll);
    update();
    return () => {
      win.removeEventListener('scroll', onScroll);
      win.removeEventListener('resize', onScroll);
      if (v) v.removeEventListener('loadedmetadata', onScroll);
      if (raf) win.cancelAnimationFrame(raf);
    };
  }, [editing, list.length, useVideo, videoUrl]);

  let stage;
  if (useVideo) stage = <video ref={videoRef} className="sb-l sb-video" src={safeSrc(videoUrl)} muted playsInline preload="auto" tabIndex={-1} />;
  else if (scene === 'city') stage = <CityScene />;
  else if (scene === 'tunnel') stage = <TunnelScene />;
  else stage = <SpaceScene />;

  return (
    <section id={anchor || undefined} ref={ref} className={'sb-story sb-scene-' + (useVideo ? 'video' : scene === 'city' || scene === 'tunnel' ? scene : 'space')} data-layout={layout || 'alternate'}>
      <div className="sb-story-stage" aria-hidden="true">
        {stage}
        <div className="sb-l sb-story-shade" />
        <div className="sb-story-bar"><i /></div>
      </div>
      <div className="sb-story-chapters">
        {list.length === 0 && editing ? (
          <div className="sb-chapter"><div className="sb-chapter-card"><p className="sb-chapter-p">Add chapters in the panel on the right.</p></div></div>
        ) : null}
        {list.map((c, i) => (
          <article className="sb-chapter" key={i}>
            <div className="sb-chapter-card">
              {c.kicker ? <p className="sb-kicker">{c.kicker}</p> : null}
              <h2 className="sb-chapter-h">{c.heading}</h2>
              {c.text ? <p className="sb-chapter-p">{c.text}</p> : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

/* ---------- Sections ---------- */

function Navbar({ brand, links, ctaLabel, ctaHref }) {
  const list = arr(links);
  return (
    <header className="sb-nav">
      <div className="sb-wrap sb-nav-in">
        <a className="sb-brand" href="#top">
          <span className="sb-brand-mark" aria-hidden="true" />
          <span>{brand}</span>
        </a>
        {list.length ? (
          <nav className="sb-nav-links" aria-label="Main">
            <ul>
              {list.map((l, i) => (
                <li key={i}><a href={safeHref(l.href)}>{l.label}</a></li>
              ))}
            </ul>
          </nav>
        ) : null}
        {ctaLabel ? <a className="sb-btn sb-btn-sm" href={safeHref(ctaHref)}>{ctaLabel}</a> : null}
      </div>
    </header>
  );
}

function Hero({ anchor, eyebrow, headline, subhead, primaryLabel, primaryHref, secondaryLabel, secondaryHref, background, videoUrl, imageUrl, imageAlt, align, size }) {
  return (
    <section id={anchor || undefined} className={'sb-hero sb-hero-' + (size || 'full')} data-align={align === 'left' ? 'left' : 'center'} data-bg={background || 'none'}>
      <HeroBackground kind={background} videoUrl={videoUrl} imageUrl={imageUrl} imageAlt={imageAlt} />
      <div className="sb-hero-shade" aria-hidden="true" />
      <div className="sb-wrap sb-hero-in">
        {eyebrow ? <p className="sb-eyebrow sb-rise" style={{ '--d': '0ms' }}>{eyebrow}</p> : null}
        <h1 className="sb-hero-h sb-rise" style={{ '--d': '90ms' }}>{headline}</h1>
        {subhead ? <p className="sb-hero-sub sb-rise" style={{ '--d': '180ms' }}>{subhead}</p> : null}
        {primaryLabel || secondaryLabel ? (
          <div className="sb-actions sb-rise" style={{ '--d': '270ms' }}>
            {primaryLabel ? <a className="sb-btn" href={safeHref(primaryHref)}>{primaryLabel}</a> : null}
            {secondaryLabel ? <a className="sb-btn sb-btn-ghost" href={safeHref(secondaryHref)}>{secondaryLabel}</a> : null}
          </div>
        ) : null}
      </div>
      {size === 'full' || !size ? <div className="sb-scrollcue" aria-hidden="true"><i /></div> : null}
    </section>
  );
}

function SectionHead({ eyebrow, title, intro }) {
  if (!eyebrow && !title && !intro) return null;
  return (
    <div className="sb-head sb-reveal">
      {eyebrow ? <p className="sb-eyebrow">{eyebrow}</p> : null}
      {title ? <h2 className="sb-h2">{title}</h2> : null}
      {intro ? <p className="sb-intro">{intro}</p> : null}
    </div>
  );
}

function glow(e) {
  const card = e.target && e.target.closest ? e.target.closest('.sb-card') : null;
  if (!card) return;
  const r = card.getBoundingClientRect();
  card.style.setProperty('--mx', e.clientX - r.left + 'px');
  card.style.setProperty('--my', e.clientY - r.top + 'px');
}

function Features({ anchor, eyebrow, title, intro, columns, items, puck }) {
  const ref = useReveal(isEditing(puck));
  return (
    <section id={anchor || undefined} ref={ref} className="sb-section sb-features">
      <div className="sb-wrap">
        <SectionHead eyebrow={eyebrow} title={title} intro={intro} />
        <div className="sb-cards" data-cols={columns || '3'} onPointerMove={glow}>
          {arr(items).map((it, i) => (
            <article key={i} className="sb-card sb-reveal" style={{ '--i': i }}>
              <span className="sb-card-icon"><Icon name={it.icon} /></span>
              <h3>{it.title}</h3>
              {it.text ? <p>{it.text}</p> : null}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Steps({ anchor, eyebrow, title, items, puck }) {
  const ref = useReveal(isEditing(puck));
  return (
    <section id={anchor || undefined} ref={ref} className="sb-section sb-steps">
      <div className="sb-wrap">
        <SectionHead eyebrow={eyebrow} title={title} />
        <ol className="sb-step-list">
          {arr(items).map((it, i) => (
            <li key={i} className="sb-step sb-reveal" style={{ '--i': i }}>
              <span className="sb-step-n" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
              <h3>{it.title}</h3>
              {it.text ? <p>{it.text}</p> : null}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Split({ anchor, eyebrow, heading, text, buttonLabel, buttonHref, visual, imageUrl, imageAlt, side, puck }) {
  const ref = useReveal(isEditing(puck));
  let art;
  if (visual === 'image' && imageUrl) art = <img src={safeSrc(imageUrl)} alt={imageAlt || ''} loading="lazy" />;
  else if (visual === 'rings') art = <div className="sb-rings-art" aria-hidden="true"><i /><i /><i /></div>;
  else art = <div className="sb-orb" aria-hidden="true"><i /></div>;
  return (
    <section id={anchor || undefined} ref={ref} className="sb-section sb-split" data-side={side === 'left' ? 'left' : 'right'}>
      <div className="sb-wrap sb-split-in">
        <div className="sb-split-copy sb-reveal">
          {eyebrow ? <p className="sb-eyebrow">{eyebrow}</p> : null}
          <h2 className="sb-h2">{heading}</h2>
          {text ? <p className="sb-intro">{text}</p> : null}
          {buttonLabel ? <a className="sb-btn" href={safeHref(buttonHref)}>{buttonLabel}</a> : null}
        </div>
        <div className="sb-split-visual sb-reveal" style={{ '--i': 1 }}>{art}</div>
      </div>
    </section>
  );
}

function Faq({ anchor, title, items, puck }) {
  const ref = useReveal(isEditing(puck));
  return (
    <section id={anchor || undefined} ref={ref} className="sb-section sb-faq">
      <div className="sb-wrap sb-narrow">
        {title ? <h2 className="sb-h2 sb-reveal">{title}</h2> : null}
        <div className="sb-faq-list">
          {arr(items).map((it, i) => (
            <details key={i} className="sb-qa sb-reveal" style={{ '--i': i }}>
              <summary>
                {it.question}
                <span className="sb-qa-icon" aria-hidden="true" />
              </summary>
              <p>{it.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function Cta({ anchor, headline, text, buttonLabel, buttonHref, puck }) {
  const ref = useReveal(isEditing(puck));
  return (
    <section id={anchor || undefined} ref={ref} className="sb-section sb-cta">
      <div className="sb-wrap">
        <div className="sb-cta-panel sb-reveal">
          <h2 className="sb-h2">{headline}</h2>
          {text ? <p className="sb-intro">{text}</p> : null}
          {buttonLabel ? <a className="sb-btn sb-btn-lg" href={safeHref(buttonHref)}>{buttonLabel}</a> : null}
        </div>
      </div>
    </section>
  );
}

function Footer({ brand, note, links, smallprint }) {
  const list = arr(links);
  return (
    <footer className="sb-footer">
      <div className="sb-wrap">
        <div className="sb-footer-top">
          <div>
            <p className="sb-brand sb-footer-brand">
              <span className="sb-brand-mark" aria-hidden="true" />
              <span>{brand}</span>
            </p>
            {note ? <p className="sb-footer-note">{note}</p> : null}
          </div>
          {list.length ? (
            <nav aria-label="Footer">
              <ul className="sb-footer-links">
                {list.map((l, i) => (
                  <li key={i}><a href={safeHref(l.href)}>{l.label}</a></li>
                ))}
              </ul>
            </nav>
          ) : null}
        </div>
        {smallprint ? <p className="sb-smallprint">{smallprint}</p> : null}
      </div>
    </footer>
  );
}

/* ---------- Fields ---------- */

const heroFields = {
  eyebrow: { type: 'text', label: 'Small line above the headline', contentEditable: true },
  headline: { type: 'textarea', label: 'Headline', contentEditable: true },
  subhead: { type: 'textarea', label: 'Supporting line', contentEditable: true },
  primaryLabel: { type: 'text', label: 'Main button' },
  primaryHref: { type: 'text', label: 'Main button link' },
  secondaryLabel: { type: 'text', label: 'Second button' },
  secondaryHref: { type: 'text', label: 'Second button link' },
  background: {
    type: 'select',
    label: 'Background',
    options: [
      { label: 'Particles (follow the cursor)', value: 'particles' },
      { label: 'Aurora', value: 'aurora' },
      { label: 'Moving grid', value: 'grid' },
      { label: 'Video', value: 'video' },
      { label: 'Image', value: 'image' },
      { label: 'Plain', value: 'none' },
    ],
  },
  videoUrl: { type: 'text', label: 'Video link (MP4 or WebM, plays muted on a loop)' },
  imageUrl: { type: 'text', label: 'Image link' },
  imageAlt: { type: 'text', label: 'Image description (for screen readers)' },
  align: { type: 'radio', label: 'Text position', options: [{ label: 'Center', value: 'center' }, { label: 'Left', value: 'left' }] },
  size: { type: 'select', label: 'Height', options: [{ label: 'Full screen', value: 'full' }, { label: 'Tall', value: 'tall' }, { label: 'Medium', value: 'medium' }] },
  anchor: anchorField,
};

const storyFields = {
  scene: {
    type: 'select',
    label: 'Scene',
    options: [
      { label: 'Deep space', value: 'space' },
      { label: 'Neon city', value: 'city' },
      { label: 'Warp tunnel', value: 'tunnel' },
      { label: 'Your video (plays as you scroll)', value: 'video' },
    ],
  },
  videoUrl: { type: 'text', label: 'Video link (MP4, one continuous shot)' },
  layout: { type: 'radio', label: 'Chapter position', options: [{ label: 'Alternate', value: 'alternate' }, { label: 'Left', value: 'left' }, { label: 'Center', value: 'center' }] },
  chapters: {
    type: 'array',
    label: 'Chapters',
    min: 1,
    max: 6,
    arrayFields: {
      kicker: { type: 'text', label: 'Small label' },
      heading: { type: 'text', label: 'Heading' },
      text: { type: 'textarea', label: 'Text' },
    },
    defaultItemProps: (i) => ({ kicker: 'Scene ' + (i + 1), heading: 'New chapter', text: 'One idea per chapter reads best.' }),
    getItemSummary: (it, i) => it.heading || 'Chapter ' + ((i || 0) + 1),
  },
  anchor: anchorField,
};

const splitFields = {
  eyebrow: { type: 'text', label: 'Small line above', contentEditable: true },
  heading: { type: 'textarea', label: 'Heading', contentEditable: true },
  text: { type: 'textarea', label: 'Text', contentEditable: true },
  buttonLabel: { type: 'text', label: 'Button' },
  buttonHref: { type: 'text', label: 'Button link' },
  visual: { type: 'select', label: 'Visual', options: [{ label: 'Glowing orb', value: 'orb' }, { label: 'Rings', value: 'rings' }, { label: 'Image', value: 'image' }] },
  imageUrl: { type: 'text', label: 'Image link' },
  imageAlt: { type: 'text', label: 'Image description (for screen readers)' },
  side: { type: 'radio', label: 'Visual on the', options: [{ label: 'Right', value: 'right' }, { label: 'Left', value: 'left' }] },
  anchor: anchorField,
};

const alignField = { type: 'radio', label: 'Alignment', options: [{ label: 'Left', value: 'left' }, { label: 'Center', value: 'center' }] };

export const config = {
  categories: {
    frame: { title: 'Page frame', components: ['Navbar', 'Footer'] },
    cinematic: { title: 'Cinematic', components: ['Hero', 'ScrollStory'] },
    sections: { title: 'Sections', components: ['Features', 'Steps', 'Split', 'Faq', 'Cta'] },
    basics: { title: 'Basics', components: ['Heading', 'Text', 'Button', 'Spacer'] },
  },
  root: {
    fields: {
      title: { type: 'text', label: 'Page name (also the title in Google and the browser tab)' },
      description: { type: 'textarea', label: 'Search description (shown under the title in Google)' },
      slug: { type: 'text', label: 'Page address' },
      theme: { type: 'radio', label: 'Theme', options: [{ label: 'Dark', value: 'dark' }, { label: 'Light', value: 'light' }] },
      accent: { type: 'select', label: 'Accent color', options: toOptions(ACCENTS) },
      font: { type: 'select', label: 'Heading font', options: toOptions(FONTS) },
    },
    defaultProps: { title: 'Untitled page', description: '', slug: 'page', theme: 'dark', accent: 'cyan', font: 'grotesk' },
    render: ({ children, theme, accent, font, puck }) => {
      const a = ACCENTS[accent] || ACCENTS.cyan;
      const f = FONTS[font] || FONTS.grotesk;
      return (
        <div className="sb-site" data-theme={theme === 'light' ? 'light' : 'dark'} data-motion={isEditing(puck) ? 'off' : 'on'} style={{ '--acc-d': a.dark, '--acc-l': a.light, '--font-head': f.head }}>
          {children}
        </div>
      );
    },
  },
  components: {
    Navbar: {
      label: 'Menu bar',
      fields: {
        brand: { type: 'text', label: 'Brand name', contentEditable: true },
        links: linkList('Menu links', 6),
        ctaLabel: { type: 'text', label: 'Button' },
        ctaHref: { type: 'text', label: 'Button link' },
      },
      defaultProps: { brand: 'Your brand', links: [{ label: 'About', href: '#about' }, { label: 'Contact', href: '#contact' }], ctaLabel: 'Get in touch', ctaHref: '#contact' },
      render: Navbar,
    },
    Hero: {
      label: 'Hero',
      fields: heroFields,
      resolveFields: (data) => {
        const b = data && data.props ? data.props.background : '';
        const drop = [];
        if (b !== 'video') drop.push('videoUrl');
        if (b !== 'image') drop.push('imageUrl', 'imageAlt');
        return without(heroFields, drop);
      },
      defaultProps: {
        eyebrow: 'A short line that sets the scene',
        headline: 'A bold headline that says what you do',
        subhead: 'One or two sentences on who it is for and why it matters.',
        primaryLabel: 'Get started',
        primaryHref: '#contact',
        secondaryLabel: '',
        secondaryHref: '',
        background: 'aurora',
        videoUrl: '',
        imageUrl: '',
        imageAlt: '',
        align: 'center',
        size: 'tall',
        anchor: '',
      },
      render: Hero,
    },
    ScrollStory: {
      label: 'Scroll story',
      fields: storyFields,
      resolveFields: (data) => (data && data.props && data.props.scene === 'video' ? storyFields : without(storyFields, ['videoUrl'])),
      defaultProps: {
        scene: 'city',
        videoUrl: '',
        layout: 'alternate',
        chapters: [
          { kicker: 'Scene 1', heading: 'Set the scene', text: 'The background moves as visitors scroll.' },
          { kicker: 'Scene 2', heading: 'Make your point', text: 'Each chapter carries one idea.' },
        ],
        anchor: '',
      },
      render: ScrollStory,
    },
    Features: {
      label: 'Feature cards',
      fields: {
        eyebrow: { type: 'text', label: 'Small line above', contentEditable: true },
        title: { type: 'text', label: 'Title', contentEditable: true },
        intro: { type: 'textarea', label: 'Intro', contentEditable: true },
        columns: { type: 'radio', label: 'Cards per row', options: [{ label: '2', value: '2' }, { label: '3', value: '3' }, { label: '4', value: '4' }] },
        items: {
          type: 'array',
          label: 'Cards',
          max: 8,
          arrayFields: { icon: { type: 'select', label: 'Icon', options: ICON_OPTIONS }, title: { type: 'text', label: 'Title' }, text: { type: 'textarea', label: 'Text' } },
          defaultItemProps: { icon: 'spark', title: 'New card', text: 'A sentence about this.' },
          getItemSummary: (it) => it.title || 'Card',
        },
        anchor: anchorField,
      },
      defaultProps: {
        eyebrow: '',
        title: 'What you get',
        intro: '',
        columns: '3',
        items: [
          { icon: 'spark', title: 'First thing', text: 'A sentence about it.' },
          { icon: 'layers', title: 'Second thing', text: 'A sentence about it.' },
          { icon: 'shield', title: 'Third thing', text: 'A sentence about it.' },
        ],
        anchor: '',
      },
      render: Features,
    },
    Steps: {
      label: 'Steps',
      fields: {
        eyebrow: { type: 'text', label: 'Small line above', contentEditable: true },
        title: { type: 'text', label: 'Title', contentEditable: true },
        items: {
          type: 'array',
          label: 'Steps',
          max: 6,
          arrayFields: { title: { type: 'text', label: 'Title' }, text: { type: 'textarea', label: 'Text' } },
          defaultItemProps: { title: 'New step', text: 'What happens here.' },
          getItemSummary: (it) => it.title || 'Step',
        },
        anchor: anchorField,
      },
      defaultProps: {
        eyebrow: 'How it works',
        title: 'Three simple steps',
        items: [
          { title: 'First', text: 'What happens first.' },
          { title: 'Second', text: 'What happens next.' },
          { title: 'Third', text: 'What the client ends up with.' },
        ],
        anchor: '',
      },
      render: Steps,
    },
    Split: {
      label: 'Text and visual',
      fields: splitFields,
      resolveFields: (data) => (data && data.props && data.props.visual === 'image' ? splitFields : without(splitFields, ['imageUrl', 'imageAlt'])),
      defaultProps: {
        eyebrow: '',
        heading: 'A heading for this section',
        text: 'A short paragraph that explains it.',
        buttonLabel: '',
        buttonHref: '',
        visual: 'orb',
        imageUrl: '',
        imageAlt: '',
        side: 'right',
        anchor: '',
      },
      render: Split,
    },
    Faq: {
      label: 'FAQ',
      fields: {
        title: { type: 'text', label: 'Title', contentEditable: true },
        items: {
          type: 'array',
          label: 'Questions',
          max: 12,
          arrayFields: { question: { type: 'text', label: 'Question' }, answer: { type: 'textarea', label: 'Answer' } },
          defaultItemProps: { question: 'A question people ask', answer: 'A short, direct answer.' },
          getItemSummary: (it) => it.question || 'Question',
        },
        anchor: anchorField,
      },
      defaultProps: { title: 'Questions', items: [{ question: 'A question people ask', answer: 'A short, direct answer.' }], anchor: 'faq' },
      render: Faq,
    },
    Cta: {
      label: 'Call to action',
      fields: {
        headline: { type: 'textarea', label: 'Headline', contentEditable: true },
        text: { type: 'textarea', label: 'Text', contentEditable: true },
        buttonLabel: { type: 'text', label: 'Button' },
        buttonHref: { type: 'text', label: 'Button link' },
        anchor: anchorField,
      },
      defaultProps: { headline: 'Ready to start?', text: 'One line on what happens next.', buttonLabel: 'Get in touch', buttonHref: '#', anchor: 'contact' },
      render: Cta,
    },
    Footer: {
      label: 'Footer',
      fields: {
        brand: { type: 'text', label: 'Brand name', contentEditable: true },
        note: { type: 'textarea', label: 'Note', contentEditable: true },
        links: linkList('Links', 8),
        smallprint: { type: 'text', label: 'Small print' },
      },
      defaultProps: { brand: 'Your brand', note: '', links: [], smallprint: '© 2026 Your brand' },
      render: Footer,
    },
    Heading: {
      label: 'Heading',
      fields: {
        text: { type: 'text', label: 'Text', contentEditable: true },
        level: { type: 'radio', label: 'Size', options: [{ label: 'Large', value: 'h2' }, { label: 'Small', value: 'h3' }] },
        align: alignField,
      },
      defaultProps: { text: 'A heading', level: 'h2', align: 'left' },
      render: ({ text, level, align }) => {
        const Tag = level === 'h3' ? 'h3' : 'h2';
        return (
          <div className="sb-wrap sb-basic" data-align={align === 'center' ? 'center' : 'left'}>
            <Tag className={level === 'h3' ? 'sb-h3' : 'sb-h2'}>{text}</Tag>
          </div>
        );
      },
    },
    Text: {
      label: 'Text',
      fields: {
        text: { type: 'richtext', label: 'Text', contentEditable: true },
        align: alignField,
      },
      defaultProps: { text: '<p>Write a paragraph here. Select words to make them <strong>bold</strong> or turn them into a link.</p>', align: 'left' },
      render: ({ text, align }) => (
        <div className="sb-wrap sb-basic" data-align={align === 'center' ? 'center' : 'left'}>
          <div className="sb-prose">{text}</div>
        </div>
      ),
    },
    Button: {
      label: 'Button',
      fields: {
        label: { type: 'text', label: 'Label' },
        href: { type: 'text', label: 'Link' },
        style: { type: 'radio', label: 'Style', options: [{ label: 'Solid', value: 'solid' }, { label: 'Outline', value: 'outline' }] },
        align: alignField,
      },
      defaultProps: { label: 'Click here', href: '#', style: 'solid', align: 'left' },
      render: ({ label, href, style, align }) => (
        <div className="sb-wrap sb-basic" data-align={align === 'center' ? 'center' : 'left'}>
          <a className={'sb-btn' + (style === 'outline' ? ' sb-btn-ghost' : '')} href={safeHref(href)}>{label}</a>
        </div>
      ),
    },
    Spacer: {
      label: 'Spacer',
      fields: { size: { type: 'radio', label: 'Size', options: [{ label: 'Small', value: 's' }, { label: 'Medium', value: 'm' }, { label: 'Large', value: 'l' }] } },
      defaultProps: { size: 'm' },
      render: ({ size }) => <div className={'sb-spacer sb-spacer-' + (size === 's' || size === 'l' ? size : 'm')} aria-hidden="true" />,
    },
  },
};
