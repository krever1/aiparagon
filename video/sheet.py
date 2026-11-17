import sys,json,os
from PIL import Image,ImageDraw
d=sys.argv[1]; out=sys.argv[2]; labs=sys.argv[3:]
M=json.load(open(os.path.join(d,'manifest.json')))
ims=[]
for l in labs:
    f=M['snaps'][l]['img'] if l in M['snaps'] else M['seqs'][l]['imgs'][-1]
    im=Image.open(os.path.join(d,f)).convert('RGB'); s=M['dsf']; im=im.resize((600,338))
    dr=ImageDraw.Draw(im)
    for k,v in M['targets'].items():
        pass
    dr.rectangle([0,0,200,16],fill='black'); dr.text((3,2),l,fill='yellow'); ims.append(im)
cols=3; rows=(len(ims)+2)//3
S=Image.new('RGB',(600*cols,338*rows),'white')
for i,im in enumerate(ims): S.paste(im,((i%cols)*600,(i//cols)*338))
S.save(out)
