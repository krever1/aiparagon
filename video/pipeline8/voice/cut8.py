# Cuts one continuous narration take into its 10 lines (v8 take 1). Usage: python cut7.py t2.wav <out> [keep]: every
# pause inside a line goes down to keep s (0.25 in v7.1); <out>/map.json lists each cut (where, how long) per line at the pauses between them, shortens long pauses inside a line
# to 0.55 s, and levels every line to the same loudness. Usage: python cut_one.py one/t1.wav wav-one
import numpy as np, wave, sys, os, subprocess
src, out = sys.argv[1], sys.argv[2]; os.makedirs(out, exist_ok=True)
KEEP = float(sys.argv[3]) if len(sys.argv) > 3 else 0.8; MAP = {}
import json
w = wave.open(src); SR = w.getframerate(); a = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32) / 32768
hop = SR // 100; n = len(a) // hop; db = 20 * np.log10(np.sqrt((a[:n * hop].reshape(n, hop) ** 2).mean(1)) + 1e-9)
th = np.percentile(db, 95) - 30
# the pauses between lines, found by ear-free alignment (syllable counts snapped to pauses; see align.py)
B = [(10.18,10.57),(20.19,20.69),(28.29,28.79),(39.65,40.09),(47.18,47.67),(56.79,57.25),(64.25,64.65),(72.18,72.60),(78.88,79.28)]
edges = [(0.0, None)] + B + [(None, len(a) / SR)]
for k in range(10):
    s = edges[k][1] if k else 0.0
    e = edges[k + 1][0] if k < 9 else len(a) / SR
    seg = a[int(max(0, s - 0.03) * SR):int(min(len(a) / SR, e + 0.12) * SR)]
    # shorten every pause inside the line to KEEP s (v7.1: the list commas), and keep a map of what went
    hop2 = SR // 100; m = len(seg) // hop2
    d2 = 20 * np.log10(np.sqrt((seg[:m * hop2].reshape(m, hop2) ** 2).mean(1)) + 1e-9) < th
    keep = np.ones(len(seg), bool); i = 0; cuts = []
    while i < m:
        if d2[i]:
            j = i
            while j < m and d2[j]: j += 1
            if (j - i) * 0.01 > KEEP and i > 3 and j < m - 3:
                c = (i + j) // 2; cut = int(((j - i) * 0.01 - KEEP) * SR)
                keep[c * hop2 - cut // 2:c * hop2 + cut // 2] = False; cuts.append([round((c * hop2 - cut // 2) / SR, 3), round(cut / SR, 3)])
            i = j
        else: i += 1
    MAP[k + 1] = cuts
    seg = seg[keep]
    f = os.path.join(out, 'raw%02d.wav' % (k + 1))
    with wave.open(f, 'wb') as o:
        o.setnchannels(1); o.setsampwidth(2); o.setframerate(SR); o.writeframes((np.clip(seg, -1, 1) * 32767).astype(np.int16).tobytes())
    # every line to the same loudness (short lines: linear gain from measured loudness)
    meas = subprocess.run(['ffmpeg', '-nostats', '-i', f, '-af', 'ebur128', '-f', 'null', '-'], capture_output=True, text=True).stderr
    I = float([l for l in meas.split('Summary:')[1].splitlines() if 'I:' in l][0].split()[1])
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', f, '-af', 'volume=%.2fdB' % (-16 - I), os.path.join(out, '%02d.wav' % (k + 1))], check=True)
    os.remove(f)
    print('%02d %.2f s  was %.1f LUFS' % (k + 1, len(seg) / SR, I))
json.dump(MAP, open(os.path.join(out, 'map.json'), 'w'))
