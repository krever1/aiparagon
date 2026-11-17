import subprocess,sys,numpy as np,glob,os
def speech(f):
    raw=subprocess.run(['ffmpeg','-nostdin','-v','error','-i',f,'-ac','1','-ar','24000','-f','s16le','-'],capture_output=True).stdout
    x=np.frombuffer(raw,dtype=np.int16).astype(np.float32)/32768; w=240; n=len(x)//w
    e=20*np.log10(np.sqrt((x[:n*w].reshape(n,w)**2).mean(1))+1e-12); on=np.where(e>-38)[0]
    if not len(on): return 0,0,0,[]
    gaps=[]; prev=on[0]
    for i in on[1:]:
        if i-prev>30: gaps.append(((prev+1)/100,(i)/100))
        prev=i
    return len(x)/24000,on[0]/100,(on[-1]+1)/100,gaps
for f in sorted(glob.glob(sys.argv[1]+'/*.mp3')):
    d,a,b,g=speech(f); print('%-16s len %.2f speech %.2f-%.2f gaps>0.3s %s'%(os.path.basename(f),d,a,b,['%.2f-%.2f'%x for x in g]))
