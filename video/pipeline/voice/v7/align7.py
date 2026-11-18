import numpy as np, wave, re, sys
T=['This is Pipeline. It does two jobs: organic content that builds your authority, and ads that book calls.', 'Both start here. The Intel Tracker reads LinkedIn and the Meta Ad Library every week.', 'It writes two briefs: an organic brief for thought leadership, and an ads brief from what competitors keep paying to run.', 'Organic content. Pick what to make: LinkedIn posts, newsletters, emails, reports, white papers, articles, decks or video scripts.', 'It writes them from the organic brief and your own material, in your voice.', 'Ads. Pick a campaign: book a call, a low-ticket offer, a webinar, a download, a newsletter sign-up or a landing page.', 'It drafts the ads from the ads brief, previewed as they will run. Nothing goes live until you approve it.', 'Every ad is tracked. Spend, sign-ups, booked calls. Then it tells you what to make next.', 'It works from your brand voice, templates and knowledge base, and learns from every change you ask for.', 'Built around the systems you already use. Book a twenty-minute strategy session.']
def syl(s):
    return sum(max(1,len(re.findall(r'[aeiouy]+',w))) for w in re.findall(r"[a-z\-]+",s.lower().replace('-',' ')))
def env(f):
    w=wave.open(f+'.wav'); a=np.frombuffer(w.readframes(w.getnframes()),np.int16).astype(np.float32)/32768
    hop=w.getframerate()//100; n=len(a)//hop; r=np.sqrt((a[:n*hop].reshape(n,hop)**2).mean(1)); db=20*np.log10(r+1e-9)
    return db, np.percentile(db,95)
def gaps(db,th,minlen=0.15):
    q=db<th; n=len(q); out=[]; i=0
    while i<n:
        if q[i]:
            j=i
            while j<n and q[j]: j+=1
            if (j-i)*0.01>=minlen and i>0 and j<n: out.append((i*.01,j*.01))
            i=j
        else: i+=1
    return out
f=sys.argv[1]; db,pk=env(f); G=gaps(db,pk-30)
voiced=np.where(db>=pk-30)[0]; s0,s1=voiced[0]*.01,voiced[-1]*.01
S=[syl(t) for t in T]; tot=sum(S)
# speech time excluding gaps
gt=sum(b-a for a,b in G); sp=(s1-s0)-gt
print(f,'speech',round(s0,2),round(s1,2),'syl/s',round(tot/sp,2))
# expected boundary in speech-time, map to real time, snap to nearest gap
def real(st):
    t=s0; acc=0
    for a,b in G:
        if acc+(a-t)>=st: return t+(st-acc)
        acc+=a-t; t=b
    return t+(st-acc)
cum=np.cumsum(S)[:-1]/tot*sp
for k,c in enumerate(cum,1):
    e=real(c); best=min(G,key=lambda g:abs((g[0]+g[1])/2-e)-0.6*(g[1]-g[0]))
    print(' line',k,'ends ~%.2f'%e,' snap gap %.2f-%.2f (%.2f)'%(best[0],best[1],best[1]-best[0]))
