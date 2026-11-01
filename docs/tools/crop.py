# Run from the project root. Input is the user's original icon sheet (not included); output is assets/food/*.png
from PIL import Image
import numpy as np, os
try:
    from scipy import ndimage
except Exception as e:
    ndimage=None
src=Image.open('/mnt/user-data/uploads/fe7690f6829ea1c1a1bbf86401a22bcb1a0d7dff.png').convert('RGB')
P=[
 ('veg',[70,174,278,383],[95,205,315],[['carrots','brussels-sprouts','cucumber','butternut-squash'],['tomatoes','tomato-cucumber-salad','green-beans','bell-peppers'],['broccoli','sweet-potato','salad-greens','spinach']]),
 ('pro',[525,648,772],[97,205],[['chicken','chickpeas','eggs'],['hummus','black-beans','lentils']]),
 ('pro3',[512,605,698,790],[315],[['salmon','tofu','greek-yogurt','turkey']]),
 ('fill',[920,1030,1133,1241],[97,205,315],[['mac-cheese','pita','rice','pasta'],['potatoes','bread','ramen-noodles','tortillas'],['couscous','bagels','quinoa','other-grain']]),
 ('flav',[66,172,277,379],[487,583,678],[['hot-honey','tahini-lemon','feta','tomato-sauce'],['pesto','salsa','soy-sesame','garlic-butter'],['yogurt-sauce','lemon-olive-oil','hummus-sauce','favorite-dressing']]),
 ('fruit',[510,607,697,793],[497,630],[['bananas','apples','strawberries','blueberries'],['grapes','mandarins','peaches','melon']]),
 ('bfast',[920,1030,1138,1241],[497,630],[['cereal-milk','eggs-toast-b','yogurt-fruit-granola','avocado-toast-egg'],['bagel-cream-cheese','oatmeal','purchased-breakfast','other-breakfast']]),
 ('snack',[66,172,277,379],[836,938,1030],[['apple-pb','crackers-cheese','hummus-veggies','yogurt'],['trail-mix','popcorn','granola-bar','fruit-snack'],['cheese-fruit','rice-cakes','nut-butter-banana','other-snack']]),
 ('meal',[507,617,712,823],[838,938,1030],[['chicken-noodle-soup','ramen-egg','takeout','frozen-meal'],['quesadilla','cereal-dinner','eggs-toast','soup-bread'],['pasta-sauce','stir-fry','salad-bowl','other-meal']]),
 ('treat',[953,1040,1145,1243],[830,930,1028],[['cookies','ice-cream','chocolate','brownie'],['pastry','chips','candy','seasonal'],['croissant','cake','donut','other-treat']]),
]
out=[]
for tag,xs,ys,names in P:
    for r,cy in enumerate(ys):
        for c,cx in enumerate(xs):
            if r>=len(names) or c>=len(names[r]): continue
            n=names[r][c]
            box=(cx-50,cy-44,cx+50,cy+40)
            im=src.crop(box)
            a=np.array(im).astype(int)
            near=(a.min(axis=2)>238)
            if ndimage:
                lab,k=ndimage.label(near)
                edge=set(lab[0,:])|set(lab[-1,:])|set(lab[:,0])|set(lab[:,-1]); edge.discard(0)
                bg=np.isin(lab,list(edge))
            else: bg=near
            alpha=np.where(bg,0,255).astype(np.uint8)
            if ndimage:
                alpha=ndimage.gaussian_filter(alpha.astype(float),0.6).astype(np.uint8)
            if ndimage:
                lab2,k2=ndimage.label(alpha>60)
                Hh=alpha.shape[0]
                for i,sl in enumerate(ndimage.find_objects(lab2),1):
                    y0,y1=sl[0].start,sl[0].stop
                    if (y0>=Hh-16 and y1-y0<=16) or (y1<=9):
                        alpha[lab2==i]=0
            rgba=np.dstack([np.array(im),alpha])
            Image.fromarray(rgba,'RGBA').save(f'assets/food/{n}.png')
            out.append(n)
print(len(out))
# montage
W=100;H=84
cols=14
rows=(len(out)+cols-1)//cols
m=Image.new('RGB',(cols*W,rows*(H+14)),(240,230,215))
from PIL import ImageDraw
d=ImageDraw.Draw(m)
for i,n in enumerate(out):
    im=Image.open(f'assets/food/{n}.png')
    x=(i%cols)*W;y=(i//cols)*(H+14)
    m.paste(im,(x,y),im)
    d.text((x+2,y+H),n[:15],fill=(0,0,0))
m.save('/home/claude/montage.png')
