# Cuts one continuous narration take into its 10 lines (v7 take 2) at the pauses between them, shortens long pauses inside a line
# to 0.55 s, and levels every line to the same loudness. Usage: python cut_one.py one/t1.wav wav-one
import numpy as np, wave, sys, os, subprocess
src, out = sys.argv[1], sys.argv[2]; os.makedirs(out, exist_ok=True)
w = wave.open(src); SR = w.getframerate(); a = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32) / 32768
hop = SR // 100; n = len(a) // hop; db = 20 * np.log10(np.sqrt((a[:n * hop].reshape(n, hop) ** 2).mean(1)) + 1e-9)
th = np.percentile(db, 95) - 30
# the pauses between lines, found by ear-free alignment (syllable counts snapped to pauses; see align.py)
B = [(7.04,7.31),(12.97,13.30),(20.59,21.08),(31.89,32.36),(36.82,37.30),(48.69,49.06),(55.80,56.20),(63.48,63.96),(70.72,71.41)]
edges = [(0.0, None)] + B + [(None, len(a) / SR)]
for k in range(10):
    s = edges[k][1] if k else 0.0
    e = edges[k + 1][0] if k < 9 else len(a) / SR
    seg = a[int(max(0, s - 0.03) * SR):int(min(len(a) / SR, e + 0.12) * SR)]
    # shorten pauses over 0.8 s inside the line
    hop2 = SR // 100; m = len(seg) // hop2
    d2 = 20 * np.log10(np.sqrt((seg[:m * hop2].reshape(m, hop2) ** 2).mean(1)) + 1e-9) < th
    keep = np.ones(len(seg), bool); i = 0
    while i < m:
        if d2[i]:
            j = i
            while j < m and d2[j]: j += 1
            if (j - i) * 0.01 > 0.8 and i > 5 and j < m - 5:
                c = (i + j) // 2; cut = int(((j - i) * 0.01 - 0.55) * SR)
                keep[c * hop2 - cut // 2:c * hop2 + cut // 2] = False
            i = j
        else: i += 1
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
