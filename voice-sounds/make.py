# Two background loops for the voice agent (#4), synthesized, no recordings: light ambient (room tone) and quiet office
# (room tone, distant typing, a faint murmur nobody can make words out of). 60 s, seamless, mono, phone band.
# Vapi plays a background sound file at the loudness it has (there is no volume setting), so the levels below are the
# volume callers hear: light ambient about -42 dBFS, quiet office about -39 dBFS, both well under the agent's voice.
# Run from the repo root: python3 voice-sounds/make.py voice-sounds   (needs numpy, scipy and ffmpeg with libmp3lame)
# The seed is fixed, so the same levels give the same files. Kept off the live site by .vercelignore.
import sys, subprocess, numpy as np
from scipy import signal
SR = 22050
LEN = 60.0
FADE = 3.0
rng = np.random.default_rng(20261103)
N = int(SR * (LEN + FADE))
t = np.arange(N) / SR

def band(x, lo, hi, order=4):
    sos = signal.butter(order, [lo, hi], btype='band', fs=SR, output='sos'); return signal.sosfilt(sos, x)
def low(x, hz, order=4):
    sos = signal.butter(order, hz, btype='low', fs=SR, output='sos'); return signal.sosfilt(sos, x)
def pink(n):
    w = rng.standard_normal(n); f = np.fft.rfft(w); k = np.arange(len(f)); k[0] = 1
    return np.fft.irfft(f / np.sqrt(k), n)
def norm_rms(x, db):
    return x * (10 ** (db / 20) / (np.sqrt(np.mean(x ** 2)) + 1e-12))
def smooth_rand(n, rate_hz, depth):
    # a slow random drift around 1.0
    pts = int(LEN * rate_hz) + 4
    xp = np.linspace(0, N, pts); yp = 1 + depth * rng.uniform(-1, 1, pts)
    return np.interp(np.arange(n), xp, yp)

def room_tone():
    # Air handling and a quiet room: pink noise shaped into the band a phone carries, drifting slowly.
    x = band(pink(N), 280, 2400, 2)
    x = x * smooth_rand(N, 0.15, 0.12)
    return x

def reverb(x, secs=0.45):
    n = int(SR * secs); ir = rng.standard_normal(n) * np.exp(-np.arange(n) / (SR * secs / 5)); ir[0] = 1.5
    ir = low(ir, 2500, 2); return signal.fftconvolve(x, ir)[:len(x)] / np.sqrt(np.sum(ir ** 2))

def typing():
    # Someone typing a few desks away: bursts of 2 to 6 s, keys 90 to 220 ms apart, a burst every 6 to 16 s.
    out = np.zeros(N); pos = rng.uniform(1.0, 4.0)
    while pos < LEN + FADE - 1:
        end = pos + rng.uniform(2.0, 6.0); k = pos
        while k < end and k < LEN + FADE - 0.1:
            i = int(k * SR); n = int(SR * rng.uniform(0.004, 0.009))
            click = rng.standard_normal(n) * np.exp(-np.arange(n) / (SR * 0.0018))
            if i + n < N: out[i:i + n] += click * rng.uniform(0.5, 1.0) * (1.6 if rng.random() < 0.08 else 1.0)
            k += rng.uniform(0.09, 0.22) + (rng.uniform(0.2, 0.6) if rng.random() < 0.12 else 0)
        pos = end + rng.uniform(6.0, 16.0)
    return reverb(band(out, 900, 3300, 2), 0.3)

def murmur():
    # Distant voices: a pitch pulse through two vowel resonances that change every syllable, in phrases with pauses,
    # low passed and blurred by the room so no word can be made out.
    out = np.zeros(N)
    for voice in range(3):
        f0base = rng.uniform(105, 210); pos = rng.uniform(0, 8)
        while pos < LEN + FADE - 1:
            phrase = rng.uniform(1.2, 3.5); s = int(pos * SR); e = min(N, int((pos + phrase) * SR)); n = e - s
            if n <= 0: break
            tt = np.arange(n) / SR
            f0 = f0base * (1 + 0.08 * np.sin(2 * np.pi * rng.uniform(0.3, 0.8) * tt + rng.uniform(0, 6))) * np.linspace(1.04, 0.94, n)
            ph = np.cumsum(f0 / SR); src = (np.diff(np.floor(ph), prepend=0) > 0).astype(float)
            src = low(src, 1800, 2) + 0.05 * rng.standard_normal(n)
            syl = int(SR / rng.uniform(3.5, 5.0)); y = np.zeros(n)
            for a in range(0, n, syl):
                b = min(n, a + syl); f1 = rng.uniform(320, 760); f2 = rng.uniform(900, 2000)
                seg = src[max(0, a - 400):b]
                v = sum(signal.lfilter(*signal.iirpeak(fc, 6, fs=SR), seg) for fc in (f1, f2))[-(b - a):]
                env = np.sin(np.linspace(0, np.pi, b - a)) ** 1.5
                y[a:b] += v * env * rng.uniform(0.5, 1.0)
            y *= np.sin(np.linspace(0, np.pi, n)) ** 0.3
            out[s:e] += y * rng.uniform(0.6, 1.0)
            pos += phrase + rng.uniform(0.6, 4.0)
    return reverb(band(out, 300, 1300, 3), 0.6)

def seamless(x):
    m = int(SR * LEN); f = int(SR * FADE); y = x[:m].copy()
    ramp = np.sin(np.linspace(0, np.pi / 2, f)) ** 2
    y[:f] = x[:f] * ramp + x[m:m + f] * (1 - ramp)
    return y

def write(x, path):
    x = np.clip(x, -1, 1); pcm = (x * 32767).astype('<i2').tobytes()
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-f', 's16le', '-ar', str(SR), '-ac', '1', '-i', '-',
                    '-codec:a', 'libmp3lame', '-b:a', '48k', '-metadata', 'title=' + path.rsplit('/', 1)[-1], path], input=pcm, check=True)

out_dir = sys.argv[1]
light = seamless(norm_rms(room_tone(), -42))
office = seamless(norm_rms(room_tone(), -44) + norm_rms(typing(), -45) + norm_rms(murmur(), -43))
write(light, out_dir + '/light-ambient.mp3'); write(office, out_dir + '/quiet-office.mp3')
for name, x in (('light', light), ('office', office)):
    rms = 20 * np.log10(np.sqrt(np.mean(x ** 2))); peak = 20 * np.log10(np.max(np.abs(x)))
    print(name, 'rms %.1f dBFS' % rms, 'peak %.1f dBFS' % peak)
