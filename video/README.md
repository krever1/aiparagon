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
short pause between paragraphs, starts speaking immediately]`, then the whole script with a blank line between lines.

Make the narration as ONE take of the whole script, not one generation per line: separate generations differ in pace,
pitch and level, and it shows (v6 was made per line; v6.1 is one take). Then:
```
cd video/pipeline/voice
ffmpeg -i one/take1.mp3 -ar 48000 -ac 1 one/take1.wav
python align.py one/take1                 # each line's estimated end, snapped to the nearest pause
python cut_one.py one/take1.wav wav-one   # cuts at the pauses in B, shortens pauses over 0.8 s, levels each line
```
Check the pauses `align.py` picks against the script and copy them into `B` in `cut_one.py`. The composer reads
`voice/wav-one` (`WAVS=` picks another folder). `voice/dl/` keeps v6's per-line takes.

## Pipeline v7 (Nov 18)
The two jobs named up front (title card), the Intel Tracker and both briefs, then a section card and the form for each
job (Content Transformation's kinds and categories; Marketing Generation's campaign types), slower, about 86 s.
```
cd video/pipeline
node record-p7.cjs                 # rec-p7/ (LOOK=1 for a quick 1x pass into look/)
node cards.cjs                     # cards/: the title and section card layers
node endcard.cjs 7.2 24 endcard
ffmpeg -i voice/v7/t2.mp3 -ac 1 -ar 24000 voice/v7/t2.wav
python voice/v7/align7.py voice/v7/t2   # (run from voice/v7) where each line ends, snapped to pauses
python voice/v7/cut7.py voice/v7/t2.wav wav-v71 0.25   # v7.1: pauses inside lines down to 0.25 s (80 s)
../venv/bin/python compose_p7.py   # ../out/pipeline-demo-v7.mp4 (+ .srt)
```

## Pipeline v8 (Nov 19)
Erica's second round: "two intelligent lead generation systems", 213 sample posts in the Intel Tracker scrolling past
(zoomed out), both briefs read at full width, a page label on every shot, a calmer camera, Paid ad off the organic
choices, and organic content's two starts. About 98 s. Lives in video/pipeline8 (needs video/pipeline's endcard.cjs).
```
cd video/pipeline8
node record-p8.cjs                       # rec-p8/ (LOOK=1 for a quick 1x pass)
node cards.cjs                           # cards/
node ../pipeline/endcard.cjs 7.2 24 endcard
ffmpeg -i voice/t1.mp3 -ac 1 -ar 24000 voice/t1.wav
(cd voice && python cut8.py t1.wav ../wav-v8 0.3)
cp wav-v8/01.wav wav-v8/01-with-tag.wav && ffmpeg -ss 3.40 -i wav-v8/01-with-tag.wav -af afade=t=in:d=0.02 wav-v8/01.wav   # the take's first 3.4 s are the voice reading its style notes aloud
ffmpeg -i wav-v8/03.wav -t 4.21 wav-v8/03a.wav && ffmpeg -ss 4.21 -i wav-v8/03.wav wav-v8/03b.wav   # line 3 split for the briefs
../venv/bin/python compose_p8.py         # ../out/pipeline-demo-v8.mp4 (+ .srt)
```

The voice can read the bracketed style notes at the top of the prompt aloud (all three v8 takes did, about 3 s). Check where the first line really starts (shot by matching it against an earlier take of the same words) before cutting.
