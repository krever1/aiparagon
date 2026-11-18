# Pipeline demo v7 (Nov 18, Erica's notes on v6): the two jobs named from the first frame (organic content, ads), the
# Intel Tracker and both briefs, then each job in its own section with a title card: Content Transformation's form
# (every kind of piece, then its categories) and a draft; Marketing Generation's form (every campaign type), a
# campaign and approve. Then Ad Testing, voice and templates, what should change, and the end card. Slower, with the
# page titles held. One continuous narration take, cut by voice/v7/cut7.py.
# Usage: python compose_p7.py [preview] [silent]  -> ../out/pipeline-demo-v7.mp4 (+ .srt, poster)
import json, os, subprocess, sys, math
from functools import lru_cache
import numpy as np
import cv2
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
VID = os.path.join(HERE, '..')
REC = os.path.join(HERE, os.environ.get('REC', 'rec-p7'))
DL = os.path.join(HERE, 'voice', 'dl')
ENDDIR = os.path.join(HERE, 'endcard')
OUT = os.path.join(VID, 'out'); os.makedirs(OUT, exist_ok=True)
M = json.load(open(os.path.join(REC, 'manifest.json')))
SC, W, H = M['dsf'], M['w'], M['h']
PREVIEW = 'preview' in sys.argv[1:]
SILENT = 'silent' in sys.argv[1:]
OW, OH, FPS = (960, 540, 24) if PREVIEW else (1920, 1080, 24)
FULL = (0.0, 0.0, float(W))
CX0, CX1 = 104.0, W - 28.0
NAME = 'pipeline-demo-v7' + ('-preview' if PREVIEW else '')

TAKES = [  # one take (voice/v7/t2.wav), cut into these lines
    'This is Pipeline. It does two jobs: organic content that builds your authority, and ads that book calls.',
    'Both start here. The Intel Tracker reads LinkedIn and the Meta Ad Library every week.',
    'It writes two briefs: an organic brief for thought leadership, and an ads brief from what competitors keep paying to run.',
    'Organic content. Pick what to make: LinkedIn posts, newsletters, emails, reports, white papers, articles, decks or video scripts.',
    'It writes them from the organic brief and your own material, in your voice.',
    'Ads. Pick a campaign: book a call, a low-ticket offer, a webinar, a download, a newsletter sign-up or a landing page.',
    'It drafts the ads from the ads brief, previewed as they will run. Nothing goes live until you approve it.',
    'Every ad is tracked. Spend, sign-ups, booked calls. Then it tells you what to make next.',
    'It works from your brand voice, templates and knowledge base, and learns from every change you ask for.',
    'Built around the systems you already use. Book a twenty-minute strategy session.',
]

def ease(s):
    s = min(1.0, max(0.0, s)); return 4 * s * s * s if s < 0.5 else 1 - (-2 * s + 2) ** 3 / 2

def tlen(path):
    return float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path], capture_output=True, text=True).stdout)

class Plan:
    def __init__(self):
        self.base, self.moves, self.clicks, self.cams, self.caps, self.cards = [], [], [], [], [], []
        self.pos = (W + 70.0, H + 90.0)
        self.end = None
    def at(self, target):
        return tuple(M['targets'][target]['at']) if isinstance(target, str) else tuple(target)
    def show(self, label, t, fade=0.1):
        assert label in M['snaps'], label
        self.base.append((t, 'snap', label, fade))
    def seq(self, label, t, per=1, fade=0.0):
        assert label in M['seqs'], label
        self.base.append((t, 'seq', label, fade, per))
        return t + len(M['seqs'][label]['imgs']) * per / FPS
    def move(self, target, arrive, dur=None):
        p0, p1 = self.pos, self.at(target)
        d = math.hypot(p1[0] - p0[0], p1[1] - p0[1])
        dur = dur or min(0.95, max(0.38, 0.3 + d / 1250))
        if self.moves: assert arrive - dur >= self.moves[-1][1] - 1e-6, ('moves overlap', target, arrive)
        if self.clicks: assert arrive - dur >= self.clicks[-1] - 1e-6 or arrive < self.clicks[-1], ('moves off before its click', target)
        self.moves.append((arrive - dur, arrive, p0, p1)); self.pos = p1
        return arrive
    def hover(self, label, arrive, dur=None, fade=0.1):
        self.move(label, arrive, dur); self.show(label + '_h', arrive, fade)
    def click(self, t):
        self.clicks.append(t)
    def cam(self, rect, t0, t1):
        self.cams.append((t0, t1, rect))
    def cap(self, text, t0, t1):
        self.caps.append((t0, t1, text))
    def card(self, t0, t1, layers, fin=0.3, fout=0.3):   # layers: [(png name, appears at)]
        self.cards.append((t0, t1, layers, fin, fout))

def fit(x0, y0, x1, y1, zmax=1.6):
    w = max(x1 - x0, (y1 - y0) * 16 / 9, W / zmax); w = min(w, W)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    return (min(max(cx - w / 2, 0), W - w), min(max(cy - w * 9 / 32, 0), H - w * 9 / 16), w)

def box(label):
    return M['targets'][label]['box']

def cursor_at(P, t):
    pos = P.moves[0][2] if P.moves else P.pos
    for (t0, t1, p0, p1) in P.moves:
        if t < t0: break
        if t >= t1: pos = p1; continue
        s = ease((t - t0) / (t1 - t0))
        dx, dy = p1[0] - p0[0], p1[1] - p0[1]; d = math.hypot(dx, dy) or 1
        c = ((p0[0] + p1[0]) / 2 - dy / d * d * 0.08, (p0[1] + p1[1]) / 2 + dx / d * d * 0.08)
        pos = ((1 - s) ** 2 * p0[0] + 2 * (1 - s) * s * c[0] + s * s * p1[0], (1 - s) ** 2 * p0[1] + 2 * (1 - s) * s * c[1] + s * s * p1[1])
        break
    return pos

def cam_at(P, t):
    cur = FULL
    for (t0, t1, rect) in sorted(P.cams, key=lambda c: c[0]):
        if t >= t1: cur = rect; continue
        if t >= t0:
            s = ease((t - t0) / (t1 - t0)); cur = tuple(cur[i] + (rect[i] - cur[i]) * s for i in range(3))
        break
    return cur

def base_img(ev, t):
    if ev[1] == 'snap': return M['snaps'][ev[2]]['img']
    imgs = M['seqs'][ev[2]]['imgs']; i = int((t - ev[0]) * FPS / ev[4] + 1e-6)
    return imgs[min(max(i, 0), len(imgs) - 1)]

# ---------- the timeline ----------
P = Plan()
WAV = os.path.join(HERE, os.environ.get('WAVS', 'wav-v7'))
L = {n: tlen(os.path.join(WAV, '%02d.wav' % n)) for n in range(1, 11)}
GAP = {2: 0.8, 3: 0.6, 4: 1.9, 5: 0.6, 6: 1.9, 7: 0.9, 8: 1.5, 9: 0.7, 10: 1.1}
T = {1: 0.5}
for n in range(2, 11): T[n] = T[n - 1] + L[n - 1] + GAP[n]
END = T[10] + L[10] + 1.6
TITLE = lambda: fit(CX0, 52, 700, 200)                     # a page's own title, held
seqm = lambda k: tuple(M['seqs'][k]['mouse'])

# 1 "This is Pipeline. It does two jobs: organic content that builds your authority, and ads that book calls."
t = T[1]
P.show('ov', 0, 0)
P.card(0.0, T[2] - 0.25, [('intro_a', 0.0), ('intro_b', t + 2.95), ('intro_c', t + 5.0)], fin=0.0, fout=0.35)
P.move(seqm('ov_scroll'), t + 5.4, 0.6)
e = P.seq('ov_scroll', t + 5.5); P.show('ov2', e, 0)
fb = box('ov2_flow'); P.cam(fit(fb[0] - 8, fb[1] - 34, fb[0] + fb[2] + 8, fb[1] + fb[3] - 120), e + 0.1, e + 0.2)

# 2 "Both start here. The Intel Tracker reads LinkedIn and the Meta Ad Library every week."
t = T[2]
P.hover('ov2_intel', t + 0.55, 0.55)                       # "Both start here"
P.click(t + 1.25); P.cam(FULL, t + 1.2, t + 1.3); P.show('intel', t + 1.31, 0.14)
P.cam(TITLE(), t + 1.4, t + 1.85)                           # Intel Tracker, held
P.cap('Intel Tracker · reads the market every week', t + 1.6, t + 5.9)
rb = box('intel_reads')
P.cam(fit(CX0, 60, 900, rb[1] + 70), t + 2.95, t + 3.5)
P.hover('intel_reads', t + 3.6, 0.5)
P.hover('intel_week', t + 4.9, 0.45)

# 3 "It writes two briefs: an organic brief for thought leadership, and an ads brief from what competitors keep ..."
t = T[3]
P.cam(FULL, t - 0.5, t - 0.15)
P.move('nav_briefs', t - 0.1, 0.55); P.click(t - 0.04); P.show('br_org', t + 0.02)
P.move(seqm('br_org_down'), t + 0.55, 0.45)
e = P.seq('br_org_down', t + 0.6); P.show('br_org2', e, 0)
P.cam(fit(CX0, 60, CX1, 630), e, e + 0.5)                   # Organic brief · 26 Oct and its five things
P.cap('Organic brief · for thought leadership', t + 1.6, t + 4.2)
P.hover('br_org_c1', t + 2.7, 0.5)
P.cam(FULL, t + 3.6, t + 3.95)
P.move(seqm('br_org_up'), t + 3.75, 0.45)
e = P.seq('br_org_up', t + 3.8); P.show('br_org3', e, 0)
P.move('br_tab_ads', e + 0.4, 0.33); P.click(e + 0.45); P.show('br_ads', e + 0.51)
P.move(seqm('br_ads_down'), e + 0.72, 0.2)
e = P.seq('br_ads_down', e + 0.74); P.show('br_ads2', e, 0)
P.cam(fit(CX0, 60, 900, 430), e, e + 0.5)                   # Ads brief · 26 Oct and its three things
P.cap('Ads brief · from what competitors pay to run', t + 4.6, T[4] - 1.45)
P.hover('br_ads_c1', t + 6.2, 0.5)
P.hover('br_ads_c2', t + 7.2, 0.5)

# 4 "Organic content. Pick what to make: LinkedIn posts, newsletters, emails, reports, white papers, articles, decks ..."
t = T[4]
P.card(t - 1.35, t + 1.3, [('sec_org', t - 1.35)])
P.cam(FULL, t - 1.0, t - 0.98)
P.move('nav_ct', t - 0.9, 0.3); P.click(t - 0.86); P.show('ct_o', t - 0.8, 0)
P.cam(TITLE(), t - 0.7, t - 0.68)                           # Content Transformation, held as the card lifts
P.cap('Organic content · Content Transformation', t + 1.5, T[6] - 1.45)
P.cam(fit(CX0, 285, 730, 675), t + 2.1, t + 2.6)            # What are you making?
for k, w in (('li', 2.85), ('news', 3.85), ('email', 4.8), ('report', 5.8), ('wp', 6.75), ('article', 7.65)):
    P.hover('ct_t_' + k, t + w, 0.42)
P.cam(fit(CX0, 40, CX1, 660), t + 8.05, t + 8.55)
P.move(seqm('ct_o_down'), t + 8.15, 0.3)
e = P.seq('ct_o_down', t + 8.2); P.show('ct_o2', e, 0)
P.hover('ct_t_deck', t + 9.3, 0.4)
P.hover('ct_t_video', t + 10.0, 0.4)
cb = box('ct_cats'); P.cam(fit(cb[0] - 15, cb[1] - 130, cb[0] + cb[2] + 15, cb[1] + cb[3] + 30), t + 10.5, t + 11.0)
P.hover('ct_cat', t + 11.15, 0.45)                          # the categories, held in the gap

# 5 "It writes them from the organic brief and your own material, in your voice."
t = T[5]
P.cam(FULL, t + 0.35, t + 0.75)
P.move(seqm('ct_o_up'), t + 0.55, 0.4)
e = P.seq('ct_o_up', t + 0.6); P.show('ct_o3', e, 0)
P.hover('ct_tab_drafts', e + 0.35, 0.4); P.click(e + 0.42); P.show('ct_drafts', e + 0.48, 0.12)
P.cam(fit(CX0, 270, 770, 675), e + 0.7, e + 1.2)            # the draft, written from the brief
P.hover('ct_draft_title', e + 1.35, 0.45)

# 6 "Ads. Pick a campaign: book a call, a low-ticket offer, a webinar, a download, a newsletter sign-up or a landing page."
t = T[6]
P.card(t - 1.35, t + 0.65, [('sec_ads', t - 1.35)])
P.cam(FULL, t - 1.0, t - 0.98)
P.move('nav_mg', t - 0.9, 0.3); P.click(t - 0.86); P.show('mg_a', t - 0.8, 0)
P.cam(TITLE(), t - 0.7, t - 0.68)                           # Marketing Generation, held as the card lifts
P.cap('Ads · Marketing Generation', t + 0.9, T[8] - 0.6)
P.cam(fit(CX0, 285, 730, 675), t + 1.3, t + 1.7)
P.hover('mg_t_ad', t + 1.75, 0.4)                           # "Pick a campaign"
P.move(seqm('mg_a_down'), t + 2.15, 0.35)
e = P.seq('mg_a_down', t + 2.2); P.show('mg_a2', e, 0)
mb = box('mg_chips'); P.cam(fit(mb[0] - 15, mb[1] - 140, mb[0] + mb[2] + 15, mb[1] + mb[3] + 40), t + 2.45, t + 2.9)
for k, w in (('call', 3.05), ('low', 4.45), ('web', 5.95), ('dl', 7.25), ('news', 8.65), ('lp', 10.05)):
    P.hover('mg_c_' + k, t + w, 0.45)

# 7 "It drafts the ads from the ads brief, previewed as they will run. Nothing goes live until you approve it."
t = T[7]
P.cam(FULL, t - 0.8, t - 0.45)
P.move(seqm('mg_a_up'), t - 0.75, 0.4)
e = P.seq('mg_a_up', t - 0.7); P.show('mg_a3', e, 0)
P.move('mg_tab_camps', e + 0.33, 0.3); P.click(e + 0.38); P.show('mg_camps', e + 0.44)
P.hover('mg_card', t + 0.55, 0.42); P.click(t + 0.62); P.show('camp', t + 0.68, 0.14)
P.move(seqm('camp_down'), t + 1.05, 0.35)
e = P.seq('camp_down', t + 1.1); P.show('camp_ads', e, 0)
P.hover('camp_a', t + 2.7, 0.5)                             # "previewed as they will run"
P.click(t + 3.95); P.show('ed', t + 4.01, 0.22)
ab = box('ed_approve'); P.cam(fit(W / 2 - 280, 150, W / 2 + 280, ab[1] + ab[3] + 70, 1.6), t + 4.1, t + 4.6)
P.hover('ed_approve', t + 5.7, 0.5); P.click(t + 5.77); P.show('ed_approved', t + 5.83, 0.08)
P.cam(FULL, t + 6.6, t + 6.95)
P.hover('ed_exit', t + 7.05, 0.45); P.click(t + 7.11); P.show('camp_after', t + 7.17, 0.16)
cb = box('camp_count'); P.cam(fit(cb[0] - 40, cb[1] - 110, cb[0] + 560, cb[1] + 90), t + 7.2, t + 7.6)
P.move((cb[0] + cb[2] * 0.6, cb[1] + cb[3] + 12), t + 7.65, 0.4)

# 8 "Every ad is tracked. Spend, sign-ups, booked calls. Then it tells you what to make next."
t = T[8]
P.cam(FULL, t - 0.5, t - 0.12)
P.move('nav_at', t - 0.1, 0.5); P.click(t - 0.04); P.show('at_read', t + 0.02)
P.cam(TITLE(), t + 0.05, t + 0.4)                           # Ad Testing, held
P.cap('Ad Testing · every ad tracked', t + 0.3, t + 5.2)
P.cam(FULL, t + 1.0, t + 1.3)
P.move('at_tab_board', t + 1.3, 0.42); P.click(t + 1.35); P.show('at_board', t + 1.41)
P.move(seqm('at_down'), t + 1.62, 0.2)
e = P.seq('at_down', t + 1.65); P.show('at_board2', e, 0)
P.cam(fit(CX0, 420, 900, 675), e + 0.05, e + 0.6)
P.hover('at_booked', t + 3.0, 0.55)
P.cam(FULL, t + 4.0, t + 4.35)
P.move(seqm('at_up'), t + 4.05, 0.3)
e = P.seq('at_up', t + 4.1); P.show('at_board3', e, 0)
P.move('at_tab_read', e + 0.45, 0.42); P.click(e + 0.5); P.show('at_read2', e + 0.56)
P.cam(fit(CX0, 340, CX1, 620), e + 0.62, e + 1.15)
P.move((300, 640), e + 1.6, 0.5)                            # toward Make next

# 9 "It works from your brand voice, templates and knowledge base, and learns from every change you ask for."
t = T[9]
P.cam(FULL, t - 0.75, t - 0.5)
P.move('nav_atlas', t - 0.5, 0.45); P.click(t - 0.45); P.show('atlas_open', t - 0.39, 0.12)
P.move('nav_profile', t - 0.08, 0.3); P.click(t - 0.03); P.show('profile', t + 0.03, 0.14)
P.cam(fit(CX0, 240, 860, 480, 1.5), t + 0.15, t + 0.6)
P.hover('profile_voice', t + 0.85, 0.45)
P.cam(FULL, t + 1.25, t + 1.55)
P.move('nav_settings', t + 1.6, 0.45); P.click(t + 1.65); P.show('settings_open', t + 1.71, 0.1)
P.move('nav_ais', t + 1.98, 0.3); P.click(t + 2.03); P.show('ais', t + 2.09, 0.14)
P.cam(fit(CX0, 30, CX1, 320), t + 2.15, t + 2.6)
P.hover('ais_tpl', t + 2.65, 0.4)
P.hover('ais_kb', t + 3.15, 0.38)
P.cam(FULL, t + 3.5, t + 3.8)
P.move('nav_pipe', t + 3.75, 0.45); P.click(t + 3.8); P.show('pipe_open', t + 3.86, 0.1)
P.move('nav_ct2', t + 4.08, 0.25); P.click(t + 4.12); P.show('ct2', t + 4.18, 0.12)
P.hover('ct_tab_drafts2', t + 4.42, 0.25); P.click(t + 4.47); P.show('ct_drafts2', t + 4.53, 0.12)
P.move(seqm('ct_dn'), t + 4.6, 0.05)
e = P.seq('ct_dn', t + 4.62); P.show('ct_drafts3', e, 0)
P.cap('What should change? · the next drafts avoid it', t + 5.0, T[10] - 0.3)
P.hover('ct_ask', e + 0.28, 0.25); P.click(e + 0.33); P.show('ct_dlg', e + 0.39, 0.12)
db = box('ct_dlg_box'); P.cam(fit(db[0] - 10, db[1] - 8, db[0] + db[2] + 10, db[1] + db[3] + 8), e + 0.4, e + 0.75)
P.hover('ct_why_long', e + 0.85, 0.25); P.click(e + 0.9); P.show('ct_why_long_on', e + 0.96, 0.08)
P.hover('ct_why_salesy', e + 1.2, 0.2); P.click(e + 1.25); P.show('ct_why_salesy_on', e + 1.31, 0.08)
P.show('ct_dlg_text', e + 1.45, 0.2)
P.hover('ct_save', e + 1.9, 0.33); P.click(e + 1.95); P.show('ct_saved', e + 2.01, 0.12)
P.cam(FULL, e + 2.05, e + 2.4)

# 10 the end card ("Built around the systems you already use. Book a twenty-minute strategy session.")
P.end = (T[10] - 0.2, 0.4)
POSTER = T[6] + 6.0

# ---------- checks ----------
def _check():
    warn = 0
    for t0, t1, txt in P.caps: assert t1 > t0
    last_move_end = max(m[1] for m in P.moves)
    assert last_move_end < P.end[0] + 0.5, 'cursor still moving into the end card'
    print('  last move ends', round(last_move_end, 2), 'end card at', round(P.end[0], 2))
    for ev in P.base:
        if ev[1] == 'seq':
            mx, my = M['seqs'][ev[2]]['mouse']; n = len(M['seqs'][ev[2]]['imgs'])
            for k in range(n):
                tt = ev[0] + (k + 0.5) * ev[4] / FPS; cx, cy = cursor_at(P, tt)
                if math.hypot(cx - mx, cy - my) > 6: warn += 1; print('  cursor off seq mouse', ev[2], k, round(cx), round(cy)); break
        elif ev[2].endswith('_h'):
            tg = ev[2][:-2]; cx, cy = cursor_at(P, ev[0] + 0.01); ax, ay = M['targets'][tg]['at']
            if math.hypot(cx - ax, cy - ay) > 3: warn += 1; print('  hover state without the cursor there', ev[2])
    for (t0, t1, r) in P.cams:
        assert r[0] >= -0.01 and r[1] >= -0.01 and r[0] + r[2] <= W + 0.01 and r[1] + r[2] * 9 / 16 <= H + 0.01, ('cam out of window', r)
    print('checks: %d warnings' % warn)
_check()
print('T', {k: round(v, 2) for k, v in T.items()}, 'end', round(END, 2))

# ---------- rendering ----------
@lru_cache(maxsize=10)
def load(f):
    im = cv2.imread(os.path.join(REC, f), cv2.IMREAD_COLOR); assert im is not None, f
    return im

def crop(f, cam):
    im = load(f); x, y, w = cam; s = im.shape[1] / W
    M2 = np.float32([[OW / (w * s), 0, -x * s * OW / (w * s)], [0, OW / (w * s), -y * s * OW / (w * s)]])
    return cv2.warpAffine(im, M2, (OW, OH), flags=cv2.INTER_AREA if w * s > OW else cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)

BASE = sorted(P.base, key=lambda e: e[0])
def frame_base(t, cam):
    k = max(i for i, ev in enumerate(BASE) if ev[0] <= t + 1e-9) if BASE[0][0] <= t else 0
    ev = BASE[k]; cur = crop(base_img(ev, t), cam)
    if ev[3] > 0 and t < ev[0] + ev[3] and k > 0:
        a = ease((t - ev[0]) / ev[3]); prev = crop(base_img(BASE[k - 1], t), cam)
        cur = cv2.addWeighted(cur, a, prev, 1 - a, 0)
    return cur

S_ = OW / 1920.0
ARROW = np.array([(0, 0), (0, 17), (4, 13.2), (7, 19.6), (9.6, 18.6), (6.7, 12.3), (12, 12.3)], np.float32)
def draw_cursor(img, p, t):
    x, y = p
    for c in P.clicks:
        if 0 <= t - c < 0.4:
            s = (t - c) / 0.4; r = int((10 + 26 * s) * S_)
            ov = img.copy(); cv2.circle(ov, (int(x), int(y)), r, (60, 60, 60), max(1, int(3 * S_)), cv2.LINE_AA)
            cv2.addWeighted(ov, 0.55 * (1 - s), img, 1 - 0.55 * (1 - s), 0, img)
    pts = (ARROW * 2.0 * S_ + (x, y)).astype(np.int32)
    cv2.polylines(img, [pts], True, (255, 255, 255), max(2, int(4 * S_)), cv2.LINE_AA)
    cv2.fillPoly(img, [pts], (20, 20, 20), cv2.LINE_AA)

FONT = ImageFont.truetype(os.path.join(VID, 'fonts', 'InstrumentSans-600.ttf'), int(34 * S_))
@lru_cache(maxsize=4)
def cap_img(text):
    pad, dot = int(24 * S_), int(12 * S_)
    tw = FONT.getbbox(text)[2]; th = int(64 * S_)
    im = Image.new('RGBA', (tw + pad * 2 + dot + int(14 * S_), th), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, im.width - 1, th - 1], radius=th // 2, fill=(12, 26, 51, 232))
    cy = th // 2; d.ellipse([pad, cy - dot // 2, pad + dot, cy + dot // 2], fill=(201, 162, 39, 255))
    d.text((pad + dot + int(14 * S_), cy), text, font=FONT, fill=(255, 255, 255, 255), anchor='lm')
    a = np.array(im).astype(np.float32); return a
def draw_cap(img, t):
    for t0, t1, text in P.caps:
        if t0 <= t <= t1:
            a = min(1.0, (t - t0) / 0.25, (t1 - t) / 0.25)
            c = cap_img(text); h, w = c.shape[:2]; x0, y0 = int(150 * S_), OH - h - int(48 * S_)
            roi = img[y0:y0 + h, x0:x0 + w].astype(np.float32)
            al = c[:, :, 3:4] / 255.0 * a; rgb = c[:, :, 2::-1][:, :, :3]
            img[y0:y0 + h, x0:x0 + w] = (roi * (1 - al) + rgb * al).astype(np.uint8)

CARDS = os.path.join(HERE, 'cards')
@lru_cache(maxsize=8)
def layer(name):
    im = cv2.imread(os.path.join(CARDS, name + '.png'), cv2.IMREAD_UNCHANGED)
    if PREVIEW: im = cv2.resize(im, (OW, OH), interpolation=cv2.INTER_AREA)
    return im.astype(np.float32)
NAVY = np.array([51, 26, 12], np.float32)
def draw_cards(img, t):
    for (t0, t1, layers, fin, fout) in P.cards:
        if not (t0 <= t <= t1): continue
        a = min(1.0, (t - t0) / fin if fin else 1.0, (t1 - t) / fout if fout else 1.0); a = ease(a)
        f = img.astype(np.float32); f = f * (1 - 0.985 * a) + NAVY * 0.985 * a
        for (name, ts) in layers:
            if t < ts: continue
            la = layer(name); b = ease(min(1.0, (t - ts) / 0.4)) if ts > t0 else 1.0
            al = la[:, :, 3:4] / 255.0 * a * b
            f = f * (1 - al) + la[:, :, :3] * al
        img[:] = np.clip(f, 0, 255).astype(np.uint8)

END_FRAMES = sorted(os.listdir(ENDDIR))
@lru_cache(maxsize=4)
def endframe(i):
    im = cv2.imread(os.path.join(ENDDIR, END_FRAMES[min(i, len(END_FRAMES) - 1)]))
    return im if not PREVIEW else cv2.resize(im, (OW, OH), interpolation=cv2.INTER_AREA)

def render(t):
    es, ef = P.end
    if t >= es + ef: return endframe(int((t - es) * FPS)).copy()
    img = frame_base(t, cam_at(P, t))
    cx, cy = cursor_at(P, t); x, y, w = cam_at(P, t)
    draw_cap(img, t)
    draw_cursor(img, ((cx - x) * OW / w, (cy - y) * OW / w), t)
    draw_cards(img, t)
    if t >= es:
        a = ease((t - es) / ef); img = cv2.addWeighted(endframe(int((t - es) * FPS)), a, img, 1 - a, 0)
    return img

video = os.path.join(OUT, NAME + '.noaudio.mp4')
N = int(round(END * FPS))
ff = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', '%dx%d' % (OW, OH), '-r', str(FPS), '-i', '-',
                       '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709',
                       '-color_trc', 'bt709', '-movflags', '+faststart', video], stdin=subprocess.PIPE)
for i in range(N):
    t = i / FPS
    fr = render(t)
    if i == int(POSTER * FPS): cv2.imwrite(os.path.join(OUT, NAME + '-poster.png'), fr)
    ff.stdin.write(fr.tobytes())
    if i % 240 == 0: print('  frame', i, '/', N, flush=True)
ff.stdin.close(); ff.wait()

# ---------- audio and captions ----------
final = os.path.join(OUT, NAME + '.mp4')
if SILENT:
    os.replace(video, final)
else:
    ins, fl = [], []
    for n in range(1, 11):
        ins += ['-i', os.path.join(WAV, '%02d.wav' % n)]
        ms = int(round(T[n] * 1000)); fl.append('[%d:a]adelay=%d|%d[a%d]' % (n, ms, ms, n))
    mix = ';'.join(fl) + ';' + ''.join('[a%d]' % n for n in range(1, 11)) + 'amix=inputs=10:normalize=0,apad,atrim=0:%.3f,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[out]' % END
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', video] + ins + ['-filter_complex', mix, '-map', '0:v', '-map', '[out]',
                    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', final], check=True)
    os.remove(video)

def ts(s):
    return '%02d:%02d:%02d,%03d' % (s // 3600, s % 3600 // 60, int(s % 60), int(round((s - int(s)) * 1000)) % 1000)
def split(txt):
    if len(txt) <= 60: return txt
    mid = len(txt) // 2; best = None
    for i, ch in enumerate(txt):
        if ch in ',:.' and 0 < i < len(txt) - 2 and (best is None or abs(i - mid) < abs(best - mid)): best = i
    return txt[:best + 1] + '\n' + txt[best + 2:] if best else txt
with open(os.path.join(OUT, NAME + '.srt'), 'w') as f:
    for n in range(1, 11):
        f.write('%d\n%s --> %s\n%s\n\n' % (n, ts(T[n]), ts(T[n] + L[n]), split(TAKES[n - 1])))
print('wrote', final)
