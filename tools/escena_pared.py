"""Genera la "pared sin cuadro" de cada foto de ambiente (se usa cuando el cliente elige una medida
más chica que la de la foto: hay que tapar el cuadro original).

Guarda solo el recorte de la zona del cuadro: assets/obras/<obra>-ambiente-1-pared.jpg
y en catalog.json la escena recibe "pared": {"src", "x", "y", "w", "h"} (px de la foto original).

Uso:  python3 tools/escena_pared.py obra1 obra2   (o sin argumentos para todas)
"""
import cv2, numpy as np, json, sys, os
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
c = json.load(open(os.path.join(R, 'catalog.json')))
want = set(sys.argv[1:])

def pushpull(img, known):
    # relleno "push-pull": promedia lo conocido a escalas cada vez más gruesas y vuelve a subir.
    # Da degradés suaves (sin las cruces que deja el inpaint clásico en huecos grandes).
    lv = [(img * known[..., None], known.astype(np.float32))]
    while min(lv[-1][1].shape) > 4:
        a, w = lv[-1]
        a2 = cv2.resize(a, (max(1, a.shape[1] // 2), max(1, a.shape[0] // 2)), interpolation=cv2.INTER_AREA)
        w2 = cv2.resize(w, (a2.shape[1], a2.shape[0]), interpolation=cv2.INTER_AREA)
        lv.append((a2, w2))
    a, w = lv[-1]; cur = a / np.maximum(w, 1e-6)[..., None]
    if (w <= 1e-6).any(): cur[w <= 1e-6] = (a.sum((0, 1)) / max(w.sum(), 1e-6))
    for a, w in reversed(lv[:-1]):
        up = cv2.resize(cur, (a.shape[1], a.shape[0]), interpolation=cv2.INTER_LINEAR)
        ww = np.clip(w * 4, 0, 1)[..., None]
        cur = (a / np.maximum(w, 1e-6)[..., None]) * ww + up * (1 - ww)
    return cur

def fill(img, mask):
    f = img.astype(np.float32); known = (mask == 0).astype(np.float32)
    out = pushpull(f, known)
    out = cv2.GaussianBlur(out, (0, 0), 2)
    H, W = mask.shape
    hp = f - cv2.GaussianBlur(f, (0, 0), 3)
    ring = cv2.dilate(mask, np.ones((25, 25), np.uint8)) - mask
    sd = float(hp[ring > 0].std()) if ring.any() else 2
    noise = cv2.GaussianBlur(np.random.default_rng(7).normal(0, 1, (H, W)).astype(np.float32), (0, 0), .7)[..., None] * sd * .9
    out = np.clip(out + noise, 0, 255)
    a = np.maximum(cv2.GaussianBlur(mask.astype(np.float32) / 255, (0, 0), 7), mask.astype(np.float32) / 255 * 0)[..., None]
    return (out * a + f * (1 - a)).astype(np.uint8)

for p in c['products']:
    if want and p['id'] not in want: continue
    if not p.get('escenas') or not p.get('ambientes'): continue
    amb = p['ambientes'][0]; e = p['escenas'][0]
    img = cv2.imread(R + amb); H, W = img.shape[:2]
    q = np.array(e['quad'], np.float32); cen = q.mean(0)
    qe = cen + (q - cen) * 1.08
    mask = np.zeros((H, W), np.uint8); cv2.fillPoly(mask, [qe.astype(np.int32)], 255)
    hard = mask.copy(); mask = cv2.dilate(mask, np.ones((15, 15), np.uint8))
    if e.get('apoyado'):   # apoyado: incluye la sombra de abajo
        mask = cv2.dilate(mask, np.ones((15, 3), np.uint8))
    x, y, w, h = cv2.boundingRect(cv2.dilate(mask, np.ones((9, 9), np.uint8)))
    out = fill(img, mask)
    src = amb.replace('.jpg', '-pared.jpg')
    cv2.imwrite(R + src, out[y:y + h, x:x + w], [cv2.IMWRITE_JPEG_QUALITY, 86])
    e['pared'] = {'src': src, 'x': x, 'y': y, 'w': w, 'h': h}
    print('pared', p['id'])
json.dump(c, open(os.path.join(R, 'catalog.json'), 'w'), ensure_ascii=False, indent=2)
