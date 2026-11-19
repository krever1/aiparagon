# Pipeline demo v8 (Nov 19, Erica's notes on v7.1): "two intelligent lead generation systems", the Intel Tracker's
# 213 posts scrolling past, both briefs read slowly at full width, a label naming the page on every shot, a calmer
# camera (no zooming in and out on approve and Ad Testing), Paid ad off the organic choices, and organic content's two
# starts (your published content, the organic brief's insights). Hovers are placed on the phrase times measured on the
# cut narration (one take, voice/cut8.py). Usage: python compose_p8.py [preview] [silent] -> ../out/pipeline-demo-v8.mp4
import json, os, subprocess, sys, math
from functools import lru_cache
import numpy as np
import cv2
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
VID = os.path.join(HERE, '..')
REC = os.path.join(HERE, os.environ.get('REC', 'rec-p8'))
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
NAME = 'pipeline-demo-v8' + ('-preview' if PREVIEW else '')

SEGS = [  # narration segments in order: key, file in wav-v8, text (line 3 is split at its pause for the briefs)
    ('1', '01', 'This is Pipeline. Two intelligent lead generation systems: organic content that builds your authority, and ads that book calls.'),
    ('2', '02', 'Both start here. Every week the Intel Tracker reads the posts and ads in your market, on LinkedIn and the Meta Ad Library.'),
    ('3a', '03a', 'It writes two briefs: an organic brief for thought leadership,'),
    ('3b', '03b', 'and an ads brief from what competitors keep paying to run.'),
    ('4', '04', 'Organic content. Pick what to make: LinkedIn posts, newsletters, emails, reports, white papers, articles, decks or video scripts.'),
    ('5', '05', "Start from content you've already published, or from the insights in the organic brief. It writes in your voice."),
    ('6', '06', 'Ads. Pick a campaign: book a call, a low-ticket offer, a webinar, a download, a newsletter sign-up or a landing page.'),
    ('7', '07', 'It drafts the ads from the ads brief, previewed as they will run. Nothing goes live until you approve it.'),
    ('8', '08', 'Every ad is tracked. Spend, sign-ups, booked calls. Then it tells you what to make next.'),
    ('9', '09', 'It works from your brand voice, templates and knowledge base, and learns from every change you ask for.'),
    ('10', '10', 'Built around the systems you already use. Book a twenty-minute strategy session.'),
]

def ease(s):
    s = min(1.0, max(0.0, s)); return 4 * s * s * s if s < 0.5 else 1 - (-2 * s + 2) ** 3 / 2

def tlen(path):
    return float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path], capture_output=True, text=True).stdout)

class Plan:
    def __init__(self):
        self.base, self.moves, self.clicks, self.cams, self.caps, self.cards, self.labs = [], [], [], [], [], [], []
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
    def lab(self, t, eyebrow, title):                     # the page label, from t until the next one
        self.labs.append((t, eyebrow, title))
    def card(self, t0, t1, layers, fin=0.3, fout=0.3):   # layers: [(png name, appears at)]
        self.cards.append((t0, t1, layers, fin, fout))

def fit(x0, y0, x1, y1, zmax=1.4):
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
WAV = os.path.join(HERE, os.environ.get('WAVS', 'wav-v8'))
L = {k: tlen(os.path.join(WAV, f + '.wav')) for k, f, _ in SEGS}
KEYS = [k for k, _, _ in SEGS]
GAP = {'2': 2.4,   # the opening card holds both columns about 3 s
        '3a': 0.9, '3b': 4.0, '4': 4.32, '5': 0.8, '6': 1.6, '7': 0.9, '8': 1.2, '9': 0.8, '10': 0.9}
T = {'1': 0.5}
for a, b in zip(KEYS, KEYS[1:]): T[b] = T[a] + L[a] + GAP[b]
END = T['10'] + L['10'] + 1.3
seqm = lambda k: tuple(M['seqs'][k]['mouse'])
BR = 1.2                                                   # the briefs scroll at 1.2 recorded frames a frame

# 1 "This is Pipeline. Two intelligent lead generation systems: organic content ..., and ads that book calls."
t = T['1']
P.show('ov', 0, 0)
# line 1 starts on "This is Pipeline" (the take's first 3.4 s, the voice reading its style notes aloud, are cut off)
P.card(0.0, T['2'] - 0.25, [('intro_a', 0.0), ('intro_b', t + 4.6), ('intro_c', t + 6.1)], fin=0.0, fout=0.35)
P.move(seqm('ov_scroll'), t + 4.9, 0.6)
e = P.seq('ov_scroll', t + 5.0); P.show('ov2', e, 0)
fb = box('ov2_flow'); P.cam(fit(fb[0] - 8, fb[1] - 34, fb[0] + fb[2] + 8, fb[1] + fb[3] - 120), e + 0.1, e + 0.2)
P.lab(T['2'] - 0.3, 'Both systems', 'Pipeline · Overview')

# 2 "Both start here. Every week the Intel Tracker reads the posts and ads in your market, on LinkedIn and the Meta ..."
t = T['2']
P.hover('ov2_intel', t + 0.75, 0.55)                        # "Both start here"
P.click(t + 1.45); P.cam(FULL, t + 1.42, t + 1.5); P.show('intel', t + 1.5, 0.14)
P.lab(t + 1.5, 'Both systems', 'Intel Tracker')
P.hover('intel_reads', t + 3.2, 0.5)                        # "reads"
P.hover('intel_read_n', t + 4.5, 0.5)                       # "the posts and ads in your market"
P.move('intel_list', t + 5.4, 0.4); P.click(t + 5.46); P.show('intel_list', t + 5.52, 0.12)
P.show('intel_zoomed', t + 5.95, 0.35)                      # every post it read, the page zoomed out
P.cam(fit(350, 150, 890, 500, 1.45), t + 6.0, t + 6.8)
P.move(seqm('intel_snap'), t + 6.15, 0.3)
e = P.seq('intel_snap', t + 6.2); P.show('intel_end', e, 0)
P.cap('All 213 posts it read in this run', t + 6.3, e + 0.7)

# 3a "It writes two briefs: an organic brief for thought leadership,"
t = T['3a']
P.cam(FULL, t - 0.55, t - 0.1)
P.move('nav_briefs', t - 0.05, 0.5); P.click(t); P.show('br_org', t + 0.06, 0.14)
P.lab(t + 0.06, 'Both systems', 'Market Intelligence Briefs · Organic brief')
P.cap('Organic brief · for thought leadership', t + 2.0, T['3b'] - 0.7)
P.move(seqm('br_org_long'), t + 2.45, 0.5)
e = P.seq('br_org_long', t + 2.6, BR); P.show('br_org_end', e, 0)

# 3b "and an ads brief from what competitors keep paying to run."
t = T['3b']
e = P.seq('br_org_up', t - 0.75); P.show('br_org_top', e, 0)
P.move('br_tab_ads', t + 0.12, 0.25); P.click(t + 0.17); P.show('br_ads', t + 0.23, 0.12)
P.lab(t + 0.23, 'Both systems', 'Market Intelligence Briefs · Ads brief')
P.cap('Ads brief · from what competitors pay to run', t + 0.4, T['4'] - 1.5)
P.move(seqm('br_ads_long'), t + 1.05, 0.45)
e = P.seq('br_ads_long', t + 1.2, BR); P.show('br_ads_end', e, 0)

# 4 "Organic content. Pick what to make: LinkedIn posts, newsletters, emails, reports, white papers, articles, decks ..."
t = T['4']
P.card(t - 1.35, t + 1.1, [('sec_org', t - 1.35)])
P.cam(FULL, t - 1.0, t - 0.98)
P.move('nav_ct', t - 0.9, 0.3); P.click(t - 0.86); P.show('ct_o', t - 0.8, 0)
P.lab(t - 0.8, 'Organic content', 'Content Transformation · What are you making?')
P.cam(fit(CX0, 285, 730, 675), t + 1.25, t + 2.05)          # "Pick what to make"
for k, w in (('li', 3.0), ('news', 4.35), ('email', 5.4), ('report', 6.3), ('wp', 7.3), ('article', 8.25)):
    P.hover('ct_t_' + k, t + w, 0.42)
P.cam(fit(CX0, 40, CX1, 660), t + 8.5, t + 9.3)
P.move(seqm('ct_o_down'), t + 8.5, 0.2)
e = P.seq('ct_o_down', t + 8.55); P.show('ct_o2', e, 0)
P.hover('ct_t_deck', t + 9.55, 0.3)
P.hover('ct_t_video', t + 10.15, 0.35)
cb = box('ct_cats'); P.cam(fit(cb[0] - 15, cb[1] - 130, cb[0] + cb[2] + 15, cb[1] + cb[3] + 30), t + 10.4, t + 11.2)
P.hover('ct_cat', t + 11.05, 0.4)

# 5 "Start from content you've already published, or from the insights in the organic brief. It writes in your voice."
t = T['5']
P.cam(FULL, t - 0.3, t + 0.4)
P.move(seqm('ct_mat_down'), t - 0.03, 0.3)
e = P.seq('ct_mat_down', t); P.show('ct_mat', e, 0)
P.lab(e, 'Organic content', 'Content Transformation · Your material')
P.cap("Start from content you've already published", t + 0.6, t + 2.45)
P.hover('ct_mat_up', t + 1.35, 0.35)
P.hover('ct_mat_paste', t + 1.95, 0.3)
P.move(seqm('ct_found_up'), t + 2.4, 0.15)
e = P.seq('ct_found_up', t + 2.45); P.show('ct_found', e, 0)
P.lab(e, 'Organic content', 'Content Transformation · What the briefs found')
P.cap("Or from the organic brief's insights", t + 2.7, t + 4.9)
P.hover('ct_found_use', t + 3.75, 0.4)
P.move(seqm('ct_o_up'), t + 4.35, 0.2)
e = P.seq('ct_o_up', t + 4.4); P.show('ct_o3', e, 0)
P.hover('ct_tab_drafts', e + 0.35, 0.3); P.click(e + 0.41); P.show('ct_drafts', e + 0.47, 0.12)
P.lab(e + 0.47, 'Organic content', 'Content Transformation · Drafts')
P.cam(fit(CX0, 270, 770, 675), e + 0.65, e + 1.45)          # "It writes in your voice"
P.hover('ct_draft_title', e + 1.5, 0.4)

# 6 "Ads. Pick a campaign: book a call, a low-ticket offer, a webinar, a download, a newsletter sign-up or a landing page."
t = T['6']
P.card(t - 1.35, t + 0.5, [('sec_ads', t - 1.35)])
P.cam(FULL, t - 1.0, t - 0.98)
P.move('nav_mg', t - 0.9, 0.3); P.click(t - 0.86); P.show('mg_a', t - 0.8, 0)
P.lab(t - 0.8, 'Ads', 'Marketing Generation · What are you making?')
P.cam(fit(CX0, 285, 730, 675), t + 0.55, t + 1.35)
P.hover('mg_t_ad', t + 1.25, 0.4)                           # "Pick a campaign"
P.move(seqm('mg_a_down'), t + 1.6, 0.3)
e = P.seq('mg_a_down', t + 1.65); P.show('mg_a2', e, 0)
mb = box('mg_chips'); P.cam(fit(mb[0] - 15, mb[1] - 140, mb[0] + mb[2] + 15, mb[1] + mb[3] + 40), t + 1.9, t + 2.7)
for k, w in (('call', 2.45), ('low', 3.35), ('web', 4.62), ('dl', 5.6), ('news', 6.7), ('lp', 7.95)):
    P.hover('mg_c_' + k, t + w, 0.3)

# 7 "It drafts the ads from the ads brief, previewed as they will run. Nothing goes live until you approve it."
t = T['7']
P.cam(FULL, t - 0.85, t - 0.2)
P.move(seqm('mg_a_up'), t - 0.8, 0.35)
e = P.seq('mg_a_up', t - 0.75); P.show('mg_a3', e, 0)
P.move('mg_tab_camps', t - 0.05, 0.28); P.click(t); P.show('mg_camps', t + 0.06)
P.lab(t + 0.06, 'Ads', 'Marketing Generation · Campaigns')
P.hover('mg_card', t + 0.6, 0.4); P.click(t + 0.66); P.show('camp', t + 0.72, 0.14)
P.lab(t + 0.72, 'Ads', 'Marketing Generation · Funnel preview')
P.move(seqm('camp_down'), t + 0.95, 0.2)
e = P.seq('camp_down', t + 1.0); P.show('camp_ads', e, 0)
P.hover('camp_a', t + 2.75, 0.5)                            # "previewed as they will run"
P.click(t + 4.55); P.show('ed', t + 4.61, 0.22)             # "Nothing goes live"
P.lab(t + 4.61, 'Ads', 'Marketing Generation · Ad editor')
P.hover('ed_approve', t + 6.0, 0.6); P.click(t + 6.07); P.show('ed_approved', t + 6.13, 0.08)
P.hover('ed_exit', t + 7.0, 0.5); P.click(t + 7.06); P.show('camp_after', t + 7.12, 0.16)
P.lab(t + 7.12, 'Ads', 'Marketing Generation · Funnel preview')
cb = box('camp_count'); P.move((cb[0] + cb[2] * 0.6, cb[1] + cb[3] + 12), t + 7.5, 0.3)

# 8 "Every ad is tracked. Spend, sign-ups, booked calls. Then it tells you what to make next."
t = T['8']
P.move('nav_at', t - 0.1, 0.45); P.click(t - 0.04); P.show('at_read', t + 0.02)
P.lab(t + 0.02, 'Results', 'Ad Testing')
P.move('at_tab_board', t + 0.9, 0.4); P.click(t + 0.95); P.show('at_board', t + 1.01)
P.lab(t + 1.01, 'Results', 'Ad Testing · Leaderboard')
P.move(seqm('at_down'), t + 1.3, 0.25)
e = P.seq('at_down', t + 1.35); P.show('at_board2', e, 0)
P.hover('at_booked', t + 4.05, 0.5)                         # "booked calls"
P.move(seqm('at_up'), t + 4.5, 0.3)
e = P.seq('at_up', t + 4.55); P.show('at_board3', e, 0)
P.move('at_tab_read', t + 5.3, 0.25); P.click(t + 5.35); P.show('at_read2', t + 5.41)
P.lab(t + 5.41, 'Results', 'Ad Testing · Strategy read')
P.cam(fit(CX0, 300, CX1, 640), t + 5.7, t + 6.6)            # "what to make next", one gentle move

# 9 "It works from your brand voice, templates and knowledge base, and learns from every change you ask for."
t = T['9']
P.cam(FULL, t - 0.75, t - 0.2)
P.move('nav_atlas', t - 0.45, 0.4); P.click(t - 0.4); P.show('atlas_open', t - 0.34, 0.12)
P.move('nav_profile', t - 0.05, 0.28); P.click(t); P.show('profile', t + 0.06, 0.14)
P.lab(t + 0.06, 'How it learns', 'Company profile · Brand voice')
P.hover('profile_voice', t + 0.95, 0.45)                    # "brand voice"
P.move('nav_settings', t + 1.55, 0.45); P.click(t + 1.6); P.show('settings_open', t + 1.66, 0.1)
P.move('nav_ais', t + 1.92, 0.24); P.click(t + 1.97); P.show('ais', t + 2.03, 0.14)
P.lab(t + 2.03, 'How it learns', 'AI settings')
P.hover('ais_tpl', t + 2.45, 0.35)                          # "templates"
P.hover('ais_kb', t + 3.05, 0.35)                           # "and knowledge base"
P.move('nav_pipe', t + 3.45, 0.3); P.click(t + 3.5); P.show('pipe_open', t + 3.56, 0.1)
P.move('nav_ct2', t + 3.75, 0.18); P.click(t + 3.79); P.show('ct2', t + 3.85, 0.12)
P.lab(t + 3.85, 'How it learns', 'Content Transformation · Drafts')
P.hover('ct_tab_drafts2', t + 4.05, 0.18); P.click(t + 4.09); P.show('ct_drafts2', t + 4.15, 0.12)
P.move(seqm('ct_dn'), t + 4.22, 0.05)
e = P.seq('ct_dn', t + 4.25); P.show('ct_drafts3', e, 0)
P.cap('Learns from every change you ask for', t + 4.9, T['10'] - 0.3)
P.hover('ct_ask', t + 4.85, 0.25); P.click(t + 4.9); P.show('ct_dlg', t + 4.96, 0.12)
P.lab(t + 4.96, 'How it learns', 'Content Transformation · What should change?')
db = box('ct_dlg_box'); P.cam(fit(db[0] - 10, db[1] - 8, db[0] + db[2] + 10, db[1] + db[3] + 8), t + 5.0, t + 5.7)
P.hover('ct_why_long', t + 5.75, 0.22); P.click(t + 5.8); P.show('ct_why_long_on', t + 5.86, 0.08)
P.hover('ct_why_salesy', t + 6.1, 0.2); P.click(t + 6.15); P.show('ct_why_salesy_on', t + 6.21, 0.08)
P.show('ct_dlg_text', t + 6.3, 0.2)
P.hover('ct_save', t + 6.62, 0.28); P.click(t + 6.67); P.show('ct_saved', t + 6.73, 0.12)

# 10 the end card ("Built around the systems you already use. Book a twenty-minute strategy session.")
P.end = (T['10'] - 0.2, 0.4)
POSTER = T['6'] + 6.0

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

LFONT_E = ImageFont.truetype(os.path.join(VID, 'fonts', 'InstrumentSans-600.ttf'), int(17 * S_))
LFONT_T = ImageFont.truetype(os.path.join(VID, 'fonts', 'InstrumentSans-600.ttf'), int(30 * S_))
@lru_cache(maxsize=32)
def lab_img(eyebrow, title):
    pad, tr = int(22 * S_), 2.6 * S_
    ew = sum(LFONT_E.getlength(ch) + tr for ch in eyebrow.upper()); tw = LFONT_T.getlength(title)
    w = int(max(ew, tw)) + pad * 2; h = int(92 * S_)
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, w - 1, h - 1], radius=int(16 * S_), fill=(12, 26, 51, 236))
    x = pad
    for ch in eyebrow.upper():
        d.text((x, int(16 * S_)), ch, font=LFONT_E, fill=(216, 180, 72, 255)); x += LFONT_E.getlength(ch) + tr
    d.text((pad, int(42 * S_)), title, font=LFONT_T, fill=(255, 255, 255, 255))
    return np.array(im).astype(np.float32)
LABS = sorted(P.labs)
def draw_lab(img, t):
    cur = [l for l in LABS if l[0] <= t]
    if not cur: return
    def put(l, a):
        c = lab_img(l[1], l[2]); h, w = c.shape[:2]; x0, y0 = int(26 * S_), int(22 * S_)
        roi = img[y0:y0 + h, x0:x0 + w].astype(np.float32); al = c[:, :, 3:4] / 255.0 * a; rgb = c[:, :, 2::-1][:, :, :3]
        img[y0:y0 + h, x0:x0 + w] = (roi * (1 - al) + rgb * al).astype(np.uint8)
    l = cur[-1]; a = ease(min(1.0, (t - l[0]) / 0.3))
    if a < 1 and len(cur) > 1: put(cur[-2], 1 - a)
    put(l, a)

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
    draw_lab(img, t)
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
    for n, (k, f, _) in enumerate(SEGS, 1):
        ins += ['-i', os.path.join(WAV, f + '.wav')]
        ms = int(round(T[k] * 1000)); fl.append('[%d:a]adelay=%d|%d[a%d]' % (n, ms, ms, n))
    N_ = len(SEGS)
    mix = ';'.join(fl) + ';' + ''.join('[a%d]' % n for n in range(1, N_ + 1)) + 'amix=inputs=%d:normalize=0,apad,atrim=0:%.3f,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[out]' % (N_, END)
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
    for n, (k, _, txt) in enumerate(SEGS, 1):
        f.write('%d\n%s --> %s\n%s\n\n' % (n, ts(T[k]), ts(T[k] + L[k]), split(txt)))
print('wrote', final)
