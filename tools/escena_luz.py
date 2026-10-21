"""Genera el mapa de luz de la foto de ambiente de una o más obras.

Requisito: en catalog.json la obra ya tiene "escenas": [{"quad": [[x,y]x4], "apoyado": bool}]
(quad = esquinas exteriores del marco en la foto de ambiente de 1080x1080: arriba-izq, arriba-der, abajo-der, abajo-izq).

Uso:  python3 tools/escena_luz.py tobiano trigal      (o sin argumentos para todas)
"""
import cv2, numpy as np, json, sys, os
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
c = json.load(open(os.path.join(R, 'catalog.json')))
want = set(sys.argv[1:])
for p in c['products']:
    if want and p['id'] not in want: continue
    if not p.get('escenas') or not p.get('ambientes'): continue
    amb = p['ambientes'][0]; e = p['escenas'][0]
    img = cv2.imread(R + amb).astype(np.float32)
    S = img.shape[1] / 270; small = cv2.resize(img, (270, 270), interpolation=cv2.INTER_AREA)
    q = np.array(e['quad'], np.float32); cen = q.mean(0); qe = (cen + (q - cen) * 1.06) / S
    mask = np.zeros((270, 270), np.uint8); cv2.fillPoly(mask, [qe.astype(np.int32)], 255)
    inp = cv2.inpaint(small.astype(np.uint8), mask, 9, cv2.INPAINT_TELEA).astype(np.float32)
    B = cv2.GaussianBlur(inp, (0, 0), 6); lum = B.mean(2, keepdims=True) + 1e-3
    inside = np.zeros((270, 270), np.uint8); cv2.fillPoly(inside, [(q / S).astype(np.int32)], 1)
    M = np.clip(128 * (lum / lum[inside > 0].mean()) * (1 + 0.35 * (B / lum - 1)), 0, 255).astype(np.uint8)
    out = amb.replace('.jpg', '-luz.png'); cv2.imwrite(R + out, M); e['luz'] = out
    print('luz', p['id'], '->', out)
json.dump(c, open(os.path.join(R, 'catalog.json'), 'w'), ensure_ascii=False, indent=2)
