# Pipeline demo v6 (Nov 17): both tracks. Intro names them, then the thought leadership brief (its title in frame) and
# the post written from it, then the ads brief (its title in frame), campaign, approve, campaign types, Ad Testing,
# voice and templates, "it learns", and the end card with the security row. 1200 x 675 dashboard, collapsed sidebar.
# Every frame is a crop of a 3x screenshot of the real (old) dashboard; the cursor is drawn; captions sit over the
# brief headings. Usage: python compose_p6.py [preview] [silent]  -> ../out/pipeline-demo-v6.mp4 (+ .srt, poster)
import json, os, subprocess, sys, math
from functools import lru_cache
import numpy as np
import cv2
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
VID = os.path.join(HERE, '..')
REC = os.path.join(HERE, os.environ.get('REC', 'rec-p6'))
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
NAME = 'pipeline-demo-v6.1' + ('-preview' if PREVIEW else '')

TAKES = [  # file, text
    ('n01_a', 'Pipeline runs two tracks: thought leadership posts that build your authority, and ads that book calls.'),
    ('l02_a15d51e7', 'Every week they read LinkedIn and the Meta Ad Library, keep the posts people engage with, and rank the ads competitors keep paying to run.'),
    ('n02_c', 'The thought leadership brief shows what is landing in your market, and turns it into posts in your voice.'),
    ('n03_b', 'On the ad side, hooks, calls to action and offers go into one table, and each point in the brief links to the ads that match it.'),
    ('l04_866b935d', 'From there it drafts the ads in your voice, previewed as they will run.'),
    ('l05_a', 'Nothing goes live until you approve it.'),
    ('l06_cf1a045b', 'Send people to your calendar, a webinar, a download or a newsletter.'),
    ('l07_4d393192', 'Every ad is tracked. Spend, sign-ups, booked calls. Then it tells you what to make next.'),
    ('l08_a4a8b00b', 'It works from your own brand voice, templates and knowledge base.'),
    ('l09_84fe0ee5', 'And it learns. Tell it what should change on a post, and the next drafts avoid it.'),
    ('l10_0525f35b', 'Built around the systems you already use. Book a twenty-minute strategy session.'),
]

def ease(s):
    s = min(1.0, max(0.0, s)); return 4 * s * s * s if s < 0.5 else 1 - (-2 * s + 2) ** 3 / 2

def tlen(path):
    return float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path], capture_output=True, text=True).stdout)

class Plan:
    def __init__(self):
        self.base, self.moves, self.clicks, self.cams, self.caps = [], [], [], [], []
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
WAV = os.path.join(HERE, 'voice', os.environ.get('WAVS', 'wav-one')); os.makedirs(WAV, exist_ok=True)   # wav-one: one continuous take, cut by voice/cut_one.py
L = {}
for n, (f, _) in enumerate(TAKES, 1):
    w = os.path.join(WAV, '%02d.wav' % n)
    if not os.path.exists(w):
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', os.path.join(DL, f + '.mp3'), '-ar', '48000', '-ac', '1', w], check=True)
    L[n] = tlen(w)
GAP = {2: 0.7, 3: 1.0, 4: 1.8, 5: 0.9, 6: 0.6, 7: 1.45, 8: 0.55, 9: 1.2, 10: 0.85, 11: 1.0}
T = {1: 0.5}
for n in range(2, 12): T[n] = T[n - 1] + L[n - 1] + GAP[n]
END = 71.5
HOLD = END - (T[11] + L[11])
assert 1.0 <= HOLD <= 2.5, ('end card hold out of range', HOLD)

# 1 "Pipeline runs two tracks: thought leadership posts that build your authority, and ads that book calls."
t = T[1]
P.show('ov', 0, 0)
P.hover('ov_pipeline', t + 0.7, 1.0)
P.move(tuple(M['seqs']['ov_scroll']['mouse']), t + 1.35, 0.55); P.show('ov', t + 0.95)
e = P.seq('ov_scroll', t + 1.4); P.show('ov2', e, 0)
fb = box('ov2_flow'); P.cam(fit(fb[0] - 8, fb[1] - 34, fb[0] + fb[2] + 8, fb[1] + fb[3] - 120), e - 0.1, e + 0.5)
P.hover('ov2_intel', t + 2.55, 0.45)          # "thought leadership posts"
P.hover('ov2_mg', t + 3.35, 0.5)
P.hover('ov2_adstrat', t + 4.45, 0.5)         # "and ads that book calls"

# 2 "Every week they read LinkedIn and the Meta Ad Library, keep the posts people engage with, and rank the ads ..."
t = T[2]
P.cam(FULL, t - 0.6, t - 0.1)
P.hover('ov2_intel', t - 0.08, 0.55); P.click(t - 0.02); P.show('intel', t + 0.04, 0.14)
rb = box('intel_reads')
P.cam(fit(CX0, 60, 900, rb[1] + 70), t + 0.3, t + 0.95)
P.hover('intel_week', t + 0.95, 0.55)
P.hover('intel_reads', t + 2.0, 0.5)
P.cam(fit(CX0, 430, 900, 675), t + 3.0, t + 3.6)
P.hover('intel_92', t + 3.6, 0.6)
P.hover('intel_title', t + 4.35, 0.45)
P.cam(FULL, t + 4.75, t + 5.2)
P.move('nav_adstrat', t + 5.25, 0.6); P.click(t + 5.31); P.show('as', t + 5.37)
e = P.seq('as_down', t + 5.6); P.show('as2', e, 0)
P.cam(fit(CX0, 290, 900, 650), e + 0.05, e + 0.6)
P.hover('as_68', t + 6.65, 0.5)
P.hover('as_score', t + 7.3, 0.4)

# 3 "The thought leadership brief shows what is landing in your market, and turns it into posts in your voice."
t = T[3]
P.cam(FULL, t - 0.55, t - 0.15)
P.move('nav_briefs', t - 0.12, 0.6); P.click(t - 0.06); P.show('br_org', t)
P.cap('Thought leadership brief', t + 0.15, t + 3.2)
e = P.seq('br_org_down', t + 0.3); P.show('br_org2', e, 0)
P.cam(fit(CX0, 60, CX1, 630), e, e + 0.55)                       # the title and its five things together
P.hover('br_org_c1', t + 1.75, 0.5)
P.hover('br_org_c2', t + 2.45, 0.45)
P.cam(FULL, t + 3.0, t + 3.35)
P.move('nav_mg0', t + 3.3, 0.55); P.click(t + 3.36); P.show('mg_new0', t + 3.42)
P.move('mg_tab_lib', t + 3.8, 0.4); P.click(t + 3.86); P.show('mg_lib', t + 3.92)
P.move(tuple(M['seqs']['mg_post_down']['mouse']), t + 4.25, 0.35)
e = P.seq('mg_post_down', t + 4.3); P.show('mg_post', e, 0)
P.cam(fit(CX0, 100, 860, 520), e + 0.05, e + 0.6)          # the post written from the brief

# 4 "On the ad side, hooks, calls to action and offers go into one table, and each point in the brief links to ..."
t = T[4]
P.cam(FULL, t - 1.0, t - 0.65)
P.move('nav_briefs2', t - 0.62, 0.6); P.click(t - 0.56); P.show('br_org3', t - 0.5)
P.move('br_tab_ads', t - 0.12, 0.38); P.click(t - 0.06); P.show('br_ads', t)
P.cap('Advertisement brief', t + 0.1, t + 7.6)
e = P.seq('br_ads_down', t + 0.15); P.show('br_ads2', e, 0)
P.cam(fit(CX0, 60, 900, 430), e, e + 0.55)                      # Ads brief · 26 Oct and its three things
P.cam(FULL, t + 1.75, t + 2.1)
e = P.seq('br_down', t + 2.05); P.show('br_ev', e, 0)
P.cam(fit(CX0, 80, 900, 560), e + 0.02, e + 0.55)               # the table: opening, call to action, offer
P.hover('br_cta', e + 0.55, 0.5)
P.cam(FULL, t + 4.4, t + 4.8)
P.hover('br_five', t + 4.85, 0.6)
e = P.seq('br_up', t + 4.95); P.show('br_cards', e, 0)          # back up: the title stays in frame
P.hover('br_src', e + 0.45, 0.42); P.click(e + 0.52); P.show('br_drawer', e + 0.58, 0.16)
P.cam(fit(640, 0, W, 330), e + 0.7, e + 1.25)

# 5 "From there it drafts the ads in your voice, previewed as they will run."
t = T[5]
P.cam(FULL, t - 0.85, t - 0.45)
P.hover('br_close', t - 0.42, 0.45); P.click(t - 0.36); P.show('br_cards', t - 0.3, 0.14)
P.move('nav_mg', t + 0.2, 0.5); P.click(t + 0.26); P.show('mg_new', t + 0.32)
P.move('mg_tab_camps', t + 0.75, 0.42); P.click(t + 0.8); P.show('mg_camps', t + 0.86)
P.hover('mg_card', t + 1.35, 0.45); P.click(t + 1.42); P.show('camp', t + 1.48, 0.14)
e = P.seq('camp_down', t + 1.85); P.show('camp_ads', e, 0)
P.hover('camp_a', e + 0.6, 0.5)

# 6 "Nothing goes live until you approve it."
t = T[6]
P.click(t - 0.32); P.show('ed', t - 0.26, 0.22)
ab = box('ed_approve'); P.cam(fit(W / 2 - 280, 150, W / 2 + 280, ab[1] + ab[3] + 70, 1.6), t - 0.15, t + 0.4)
P.hover('ed_approve', t + 1.0, 0.5); P.click(t + 1.07); P.show('ed_approved', t + 1.13, 0.08)
P.cam(FULL, t + 1.75, t + 2.15)
P.hover('ed_exit', t + 2.3, 0.6); P.click(t + 2.36); P.show('camp_after', t + 2.43, 0.16)
cb = box('camp_count'); P.cam(fit(cb[0] - 40, cb[1] - 110, cb[0] + 560, cb[1] + 90), t + 2.5, t + 2.95)
P.move((cb[0] + cb[2] * 0.6, cb[1] + cb[3] + 12), t + 2.85, 0.4)

# 7 "Send people to your calendar, a webinar, a download or a newsletter."
t = T[7]
P.cam(FULL, t - 0.5, t - 0.12)
P.hover('camp_back', t - 0.25, 0.42); P.click(t - 0.19); P.show('mg_camps2', t - 0.13)
P.hover('mg_tab_new', t + 0.3, 0.42); P.click(t + 0.36); P.show('mg2', t + 0.42)
e = P.seq('mg2_down', t + 0.6); P.show('mg2b', e, 0)
P.cam(fit(CX0, 300, 820, 560, 1.5), e + 0.02, e + 0.5)
for k, w in (('call', 1.4), ('web', 2.35), ('dl', 3.3), ('news', 4.3)):
    P.move('mg2_' + k, t + w - 0.06, 0.42); P.click(t + w); P.show('mg2_' + k, t + w + 0.06, 0.1)

# 8 "Every ad is tracked. Spend, sign-ups, booked calls. Then it tells you what to make next."
t = T[8]
P.cam(FULL, t - 0.5, t - 0.12)
P.move('nav_at', t - 0.1, 0.5); P.click(t - 0.04); P.show('at_read', t + 0.02)
P.move('at_tab_board', t + 0.45, 0.42); P.click(t + 0.5); P.show('at_board', t + 0.56)
e = P.seq('at_down', t + 0.8); P.show('at_board2', e, 0)
P.cam(fit(CX0, 420, 900, 675), e + 0.05, e + 0.6)
P.hover('at_booked', t + 2.2, 0.55)
P.cam(FULL, t + 3.85, t + 4.25)
e = P.seq('at_up', t + 3.95); P.show('at_board3', e, 0)
P.move('at_tab_read', e + 0.45, 0.42); P.click(e + 0.5); P.show('at_read2', e + 0.56)
P.cam(fit(CX0, 340, CX1, 620), e + 0.62, e + 1.15)
P.move((300, 640), e + 1.6, 0.5)                                # toward Make next

# 9 "It works from your own brand voice, templates and knowledge base."
t = T[9]
P.cam(FULL, t - 1.2, t - 0.85)
P.move('nav_atlas', t - 0.72, 0.5); P.click(t - 0.66); P.show('atlas_open', t - 0.6, 0.12)
P.move('nav_profile', t - 0.12, 0.42); P.click(t - 0.06); P.show('profile', t + 0.0, 0.14)
P.cam(fit(CX0, 240, 860, 480, 1.5), t + 0.2, t + 0.75)
P.hover('profile_voice', t + 0.75, 0.5)
P.cam(FULL, t + 1.2, t + 1.55)
P.move('nav_settings', t + 1.7, 0.5); P.click(t + 1.76); P.show('settings_open', t + 1.82, 0.1)
P.move('nav_ais', t + 2.18, 0.34); P.click(t + 2.24); P.show('ais', t + 2.3, 0.14)
P.cam(fit(CX0, 30, CX1, 320), t + 2.4, t + 2.95)
P.hover('ais_tpl', t + 2.85, 0.45)
P.hover('ais_kb', t + 3.35, 0.4)

# 10 "And it learns. Tell it what should change on a post, and the next drafts avoid it."
t = T[10]
P.cam(FULL, t - 0.75, t - 0.4)
P.move('nav_pipe', t - 0.32, 0.42); P.click(t - 0.28); P.show('pipe_open', t - 0.22, 0.1)
P.move('nav_ct', t + 0.06, 0.32); P.click(t + 0.1); P.show('ct', t + 0.16, 0.12)
P.hover('ct_tab_drafts', t + 0.45, 0.27); P.click(t + 0.5); P.show('ct_drafts', t + 0.56, 0.12)
P.move(tuple(M['seqs']['ct_dn']['mouse']), t + 0.62, 0.05)
e = P.seq('ct_dn', t + 0.64); P.show('ct_drafts2', e, 0)
P.hover('ct_ask', e + 0.3, 0.3); P.click(e + 0.35); P.show('ct_dlg', e + 0.41, 0.12)
db = box('ct_dlg_box'); P.cam(fit(db[0] - 10, db[1] - 8, db[0] + db[2] + 10, db[1] + db[3] + 8), e + 0.42, e + 0.8)
P.hover('ct_why_long', e + 0.85, 0.25); P.click(e + 0.9); P.show('ct_why_long_on', e + 0.96, 0.08)
P.hover('ct_why_salesy', e + 1.2, 0.2); P.click(e + 1.25); P.show('ct_why_salesy_on', e + 1.31, 0.08)
P.show('ct_dlg_text', e + 1.4, 0.2)
P.hover('ct_save', e + 1.8, 0.33); P.click(e + 1.85); P.show('ct_saved', e + 1.91, 0.12)
P.cam(FULL, e + 1.93, e + 2.25)
P.hover('ct_tab_new', e + 2.6, 0.35); P.click(e + 2.66); P.show('ct_new', e + 2.72, 0.12)
P.move(tuple(M['seqs']['ct_down2']['mouse']), e + 2.95, 0.2)
e2 = P.seq('ct_down2', e + 2.95); P.show('ct_use', e2, 0)
P.cam(fit(760, 470, CX1, 675), e2 - 0.15, e2 + 0.3)
P.hover('ct_use', e2 + 0.35, 0.3)

# 11 the end card ("Built around the systems you already use. Book a twenty-minute strategy session.")
P.end = (T[11] - 0.2, 0.4)

# ---------- checks ----------
def _check():
    warn = 0
    for t0, t1, txt in P.caps: assert t1 > t0
    last_move_end = max(m[1] for m in P.moves)
    assert last_move_end < P.end[0] + 0.5, 'cursor still moving into the end card'
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
print('T', {k: round(v, 2) for k, v in T.items()}, 'hold', round(HOLD, 2))

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
    if i == int(31.0 * FPS): cv2.imwrite(os.path.join(OUT, NAME + '-poster.png'), fr)
    ff.stdin.write(fr.tobytes())
    if i % 240 == 0: print('  frame', i, '/', N, flush=True)
ff.stdin.close(); ff.wait()

# ---------- audio and captions ----------
final = os.path.join(OUT, NAME + '.mp4')
if SILENT:
    os.replace(video, final)
else:
    ins, fl = [], []
    for n in range(1, 12):
        ins += ['-i', os.path.join(WAV, '%02d.wav' % n)]
        ms = int(round(T[n] * 1000)); fl.append('[%d:a]adelay=%d|%d[a%d]' % (n, ms, ms, n))
    mix = ';'.join(fl) + ';' + ''.join('[a%d]' % n for n in range(1, 12)) + 'amix=inputs=11:normalize=0,apad,atrim=0:%.3f,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[out]' % END
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
    for n in range(1, 12):
        f.write('%d\n%s --> %s\n%s\n\n' % (n, ts(T[n]), ts(T[n] + L[n]), split(TAKES[n - 1][1])))
print('wrote', final)
