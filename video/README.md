# Demo video toolkit

Makes the product demo videos from the real (old) internal dashboard, `new-aiparagon-dashboard.html`, with made-up
data. Nothing reaches the real Supabase or n8n: the page is served locally, signed in as a made-up teammate, Supabase is
answered by `tests/lib/rest-stub.js`, and n8n by the recorder. Every frame is a crop of a real screenshot; only the
cursor, the zooms, the captions and the end card are added.

## Layout
- `lib/vharness.cjs`: the page in Playwright with the stubs; fonts and CDN scripts fetched once with curl into `cache/`.
- `lib/pipeline-data.cjs`: the made-up world (Summit Business Advisors; "now" is Mon 26 Oct 2026, 09:40 Pacific).
- `ads/`: the sample ad images and `make-ads.cjs`, which drew them.
- `fonts/`: Instrument Sans (SIL Open Font License) for the captions.
- `pipeline/`: the Pipeline demo (v6, 70 s).
  - `record-p6.cjs`: clicks through the page at 1200 x 675 with the sidebar collapsed and writes `rec-p6/*.png` at 3x
    plus `manifest.json` (snaps, scroll sequences, target boxes). `LOOK=1` writes `look/` at 1x for a quick check.
  - `endcard.cjs`: the end card frames (`node endcard.cjs 7.2 24 endcard`).
  - `compose_p6.py`: the timeline (narration, cursor, clicks, zooms, captions, end card), rendered to
    `../out/pipeline-demo-v6.mp4` with an `.srt`. `preview` renders 960 x 540; `REC=look` uses the 1x recording.
  - `voice/dl/`: the narration takes used in v6. `voice/measure.py` prints a take's length and pauses.
- `sheet.py`: a contact sheet of recorded screens (`python sheet.py pipeline/rec-p6 out.png ov intel ...`).

## Running it
```
cd video/pipeline
node record-p6.cjs                       # about 3 minutes
node endcard.cjs 7.2 24 endcard
python -m venv ../venv && ../venv/bin/pip install opencv-python-headless numpy pillow
../venv/bin/python compose_p6.py         # needs ffmpeg
```
Playwright comes from the session (`require('playwright')`).

## Narration
Higgsfield `generate_audio`, model `text2speech_v2` with `variant: elevenlabs`, the preset voice "Emily", and a prompt
that starts `[ warm confident product demo narrator, neutral American accent, clear friendly tone, steady unhurried pace,
starts speaking immediately]`. Each line is its own generation, so takes from different days differ in pace and
level: make all the lines of one video in the same batch.
