# Dsgn. Studio — guía del proyecto

Tienda online de fotografías enmarcadas de Delfina Ibarguren (marca **Design Studio / Dsgn. Studio**).
Este archivo resume todo lo necesario para seguir trabajando el sitio desde cualquier cuenta o persona.

## Dónde vive cada cosa

| Qué | Dónde |
|---|---|
| Código del sitio | GitHub: `delfinaibarguren/design-studio` (rama `main`) |
| Hosting | Netlify, sitio `design-studio-cuadros` → https://design-studio-cuadros.netlify.app (se publica solo con cada push a `main`) |
| Pedidos | Netlify → Forms → formulario **pedido** (configurar aviso por mail a designstudioenmarcados@gmail.com) |
| Cobro con tarjeta | Mercado Pago Checkout Pro. El Access Token está **solo** en Netlify → Environment variables → `MP_ACCESS_TOKEN` (nunca en el repo) |
| Transferencia | Datos bancarios en `catalog.json` → `store.bank` |
| Contacto | WhatsApp http://wa.link/vp5yn9 · Instagram @_designstu · designstudioenmarcados@gmail.com |

Plan Netlify: Personal. Cada publicación consume créditos: agrupar cambios en un solo push.
Para subir algo **sin** publicar, poner `[skip netlify]` en el mensaje del commit.

## Estructura

- `catalog.json` — **todo el contenido**: textos de la tienda, medidas y precios, tipos/colores de marco, terminaciones, colecciones y obras.
- `index.html` inicio · `coleccion.html?c=<id>` · `producto.html?id=<id>` · `checkout.html` · `gracias.html` · `ayuda.html` · `enmarcado-a-medida.html`
- `assets/store.js` — header, footer, carrito, tarjetas de obra/colección, precios.
- `assets/configurador.js` — dibuja el cuadro en canvas (`DSFrame.draw`) y el cuadro dentro de la foto de ambiente (`DSFrame.scene`). Medidas en cm: marco 2 cm (box 3 de profundidad, chato 1,5), paspartú 5 cm, arpillera 5,5 cm + 1 cm de fondo, flecos 0,5–1 cm.
- `assets/frames/` texturas de madera y arpillera · `assets/obras/` fotos de cada obra · `assets/marcos-guia.jpg` guía de marcos (se muestra en todas las obras).
- `netlify/functions/checkout.mts` — crea el pago en Mercado Pago; **recalcula el precio en el servidor** desde `catalog.json` (máx. 3 cuotas).
- `tools/escena_luz.py` — genera el mapa de luz de la foto de ambiente.

## Precios — se cambian SOLO en catalog.json → "sizes"

| Medida | Box natural | Box pintado | Chato natural | Chato pintado | + Arpillera | − Sin paspartú |
|---|---|---|---|---|---|---|
| 30 × 40 | $89.000 | $97.000 | $85.000 | $93.000 | +$20.000 | −$5.000 |
| 50 × 70 | $149.000 | $159.000 | $144.000 | $154.000 | +$25.000 | −$8.000 |
| 100 × 70 | $219.000 | $231.000 | $208.000 | $220.000 | +$30.000 | −$15.000 |

En `catalog.json` cada medida tiene:
```json
"precios": { "box-natural": 89000, "box-pintado": 97000, "chato-natural": 85000, "chato-pintado": 93000 },
"arpillera": 20000,
"descuentoSinPaspartu": 5000
```
"Pintado" = negro o blanco (`frameColors[].grupo`).
La arpillera está desactivada (se sacó de `terminaciones`). Su adicional sigue guardado en `sizes[].arpillera` y el dibujo en el configurador: para volver a ofrecerla, agregar `{ "id": "arpillera", "label": "Arpillera" }` en `terminaciones`. Paspartú blanco o negro: precio de tabla. Sin paspartú: se descuenta `descuentoSinPaspartu`.
Todas las obras (actuales y futuras) usan esta tabla; no hay precios por obra.
El servidor (`checkout.mts`) recalcula el precio desde la misma tabla antes de cobrar con Mercado Pago. 3 cuotas sin interés, 10% OFF por transferencia.

## Comisión de fotógrafas (interna)

10% de la ganancia de cada obra (`store.comisionFotografa`): lo que paga el cliente (con el descuento por transferencia aplicado) menos el costo estimado (`store.costoEstimado` × precio sin recargo de pintado). No se suma al precio. Origen y Terra: Pilar Mercau. Pampa: Isabel Turri Vinelli, salvo Ponis, Chimango I y II, Lantana y Calandria (de Delfina, sin comisión).
Cada obra tiene `"fotografa": "Nombre"` en `catalog.json` (vacío = "Sin asignar").
Cada pedido llega a Netlify Forms (formulario **pedido**) con el campo **comision_fotografas**: cuánto le corresponde a cada fotógrafa y por qué obras. Para sumar por mes: Netlify → Forms → pedido → exportar CSV.

## Cómo sumar una obra nueva

Material: foto original (sin marco) + foto en ambiente (cuadrada, 1080×1080) + nombre + colección.

1. Guardar `assets/obras/<id>-original.jpg` (recortando bordes blancos) y `assets/obras/<id>-ambiente-1.jpg`.
2. Agregar en `catalog.json` → `products` (el orden del array es el orden en la colección):
```json
{
  "id": "tobiano", "name": "Tobiano", "category": "pampa",
  "photo": "/assets/obras/tobiano-original.jpg",
  "defaults": { "tipo": "chato", "color": "natural", "terminacion": "paspartu-blanco" },
  "fotografa": "Nombre de la fotógrafa",
  "ambientes": ["/assets/obras/tobiano-ambiente-1.jpg"],
  "escenas": [{ "quad": [[256,134],[908,134],[908,568],[256,568]], "apoyado": false }]
}
```
   - `defaults`: el marco que se ve en la foto de ambiente.
   - `escenas.quad`: esquinas **exteriores** del marco en la foto de ambiente (px, arriba-izq, arriba-der, abajo-der, abajo-izq). `apoyado: true` si el cuadro está apoyado y no colgado.
3. Correr `python3 tools/escena_luz.py <id>` (necesita `opencv-python` y `numpy`): crea `<id>-ambiente-1-luz.png` y lo agrega al catálogo.
4. Probar localmente (`python3 -m http.server`) y hacer un solo push.

## Colecciones

`pampa` (Flora y fauna del campo argentino, portada: Huella), `terra`, `origen`, `isla` (próximamente).
Bajadas de colección en ocre `#b8893e`, light.

## Diseño

Fondo crema, tipografías Playfair Display (títulos), Poppins (navegación), Work Sans / Inter (textos). Acento ocre `#b8893e`.
Hero: "Enmarcados personalizados." con foto de Ponis. Vista previa de links: `assets/og.jpg`.

## Pedidos a medida: link de pago

1. El cliente pide presupuesto en **Enmarcado a medida** (formulario `consulta`, queda en Netlify → Forms).
2. Cuando acepta, entrá a **/presupuestos.html** (página privada, no aparece en el menú), poné la clave de administración, los ítems con su precio, envío opcional y generá el link.
3. El link abre el checkout con el pedido y el monto fijo (firmado; no se puede modificar). El cliente completa dirección y paga con Mercado Pago o transferencia. Llega como pedido normal (formulario `pedido`, N° `PR-…`).
Variables en Netlify: `ADMIN_KEY` (clave de la página de presupuestos) y `PRESUPUESTO_SECRET` (firma de los links; si se cambia, los links viejos dejan de funcionar).

## Envíos con Zipnova

- Variables en Netlify: `ZIPNOVA_TOKEN`, `ZIPNOVA_SECRET`, `ZIPNOVA_ACCOUNT_ID` (22147). Origen: taller de Del Viso (id 382376, se puede cambiar con `ZIPNOVA_ORIGIN_ID`).
- `ZIPNOVA_CARRIERS`: empresas que se ofrecen (ids separados por coma; 233 = Correo Argentino). `ZIPNOVA_LOGISTIC` (opcional): forma de despacho permitida (código que muestra "Cotizar prueba" en /pedidos.html).
- Medidas y peso de cada caja embalada: `catalog.json` → `sizes[].paquete` (peso en gramos, medidas en cm). Se embala sin caja (plástico de burbujas + esquineros): medida del cuadro + ~3 cm por lado, 6–7 cm de espesor. Pesos estimados: 2,5 kg, 5,5 kg y 10 kg.
- En el checkout, al poner CP + ciudad + provincia, `/api/envio` cotiza y devuelve la opción a domicilio más barata (precio firmado).
- `/api/checkout` guarda el pedido (Netlify Blobs, store "pedidos") y, con Mercado Pago, suma el envío al link de pago.
- Cuando Mercado Pago aprueba (`/api/mp-aviso` o la página de gracias vía `/api/confirmar`), se crea el envío en Zipnova una sola vez.
- Transferencias: en `/pedidos.html` (clave de administración) → "Pago recibido" crea el envío.
- Etiqueta PDF: botón en `/pedidos.html` o link en el mail de "Pago aprobado". También en Zipnova → Pendientes.
- Si Zipnova no responde, el checkout sigue funcionando con "Envío a coordinar".
- Envío gratis: `catalog.json` → `store.envioGratis` (minimo 250000 → gratis en AMBA = CABA o Buenos Aires con CP 1xxx; al interior se bonifica hasta 25000). El envío se crea igual en Zipnova y lo paga Delfina.
