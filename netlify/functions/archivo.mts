import type { Config } from "@netlify/functions"
import { getStore } from "@netlify/blobs"

// Fotos que adjuntan los clientes en "Enmarcado a medida", en su calidad original.
// Los archivos grandes viajan en partes de ~3,5 MB (cada pedido a una función tiene un límite de tamaño),
// y se vuelven a unir en el navegador al descargarlos (/descargar.html).
// POST /api/archivo                 -> primera (o única) parte: crea el archivo y devuelve { id, url }
// POST /api/archivo/<id>?parte=N    -> partes siguientes
// GET  /api/archivo/<id>?info       -> nombre, tipo, partes y tamaño
// GET  /api/archivo/<id>?parte=N    -> una parte
// GET  /api/archivo/<id>            -> el archivo (si tiene una sola parte) o la página de descarga
const TIPOS: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif",
  "image/tiff": "tif", "image/gif": "gif", "application/pdf": "pdf",
}
const PARTE_MAX = 4 * 1024 * 1024
const PARTES_MAX = 150         // hasta ~500 MB por archivo
const ID = /^[a-z0-9-]{20,60}\.(jpg|png|webp|heic|heif|tif|gif|pdf)$/

export default async (req: Request) => {
  const store = getStore({ name: "archivos-clientes", consistency: "strong" })
  const url = new URL(req.url)
  const id = url.pathname.replace(/^\/api\/archivo\/?/, "")

  if (req.method === "GET") {
    if (!ID.test(id)) return new Response("No encontrado", { status: 404 })
    const r = await store.getWithMetadata(id, { type: "arrayBuffer" })
    if (!r) return new Response("No encontrado", { status: 404 })
    const m = r.metadata as { tipo?: string; nombre?: string; partes?: number }
    const nombre = (m.nombre || id).replace(/[\\/"\r\n]/g, "_")
    const headers = {
      "Content-Type": m.tipo || "application/octet-stream",
      "Content-Disposition": `${url.searchParams.has("descargar") ? "attachment" : "inline"}; filename="${nombre.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(nombre)}`,
      "Cache-Control": "private, max-age=86400", "X-Robots-Tag": "noindex",
    }
    const partes = Math.max(1, Number(m.partes) || 1)
    if (url.searchParams.has("info")) return Response.json({ nombre: m.nombre || id, tipo: m.tipo || "", partes, tamano: Number((m as any).tamano) || 0 })
    if (url.searchParams.has("parte")) {
      const n = Number(url.searchParams.get("parte"))
      if (!Number.isInteger(n) || n < 0 || n >= partes) return new Response("Parte inválida", { status: 400 })
      const data = n === 0 ? r.data : await store.get(`${id}~${n}`, { type: "arrayBuffer" })
      if (!data) return new Response("Falta una parte", { status: 404 })
      return new Response(data, { headers: { "Content-Type": "application/octet-stream", "Cache-Control": "private, max-age=86400" } })
    }
    if (partes === 1) return new Response(r.data, { headers })
    // archivo grande: la página de descarga lo arma en el navegador
    return Response.redirect(`${url.origin}/descargar.html?f=${encodeURIComponent(id)}`, 302)
  }

  if (req.method !== "POST") return new Response("Método no permitido", { status: 405 })
  const buf = await req.arrayBuffer()
  if (!buf.byteLength || buf.byteLength > PARTE_MAX + 1024) return Response.json({ error: "Parte vacía o demasiado grande" }, { status: 413 })

  // partes siguientes de un archivo ya creado
  if (id) {
    const n = Number(url.searchParams.get("parte"))
    if (!ID.test(id) || !Number.isInteger(n) || n < 1 || n >= PARTES_MAX) return Response.json({ error: "Parte inválida" }, { status: 400 })
    const meta = await store.getMetadata(id)
    const total = Number((meta?.metadata as any)?.partes) || 1
    if (!meta || n >= total) return Response.json({ error: "Archivo no encontrado" }, { status: 404 })
    await store.set(`${id}~${n}`, buf)
    return Response.json({ ok: true })
  }

  const tipo = (req.headers.get("content-type") || "").split(";")[0].trim().toLowerCase()
  const ext = TIPOS[tipo]
  if (!ext) return Response.json({ error: "Tipo de archivo no permitido" }, { status: 415 })
  const partes = Math.max(1, Math.min(PARTES_MAX, Number(req.headers.get("x-partes")) || 1))
  const nombre = decodeURIComponent(req.headers.get("x-nombre") || "").slice(0, 120) || `foto.${ext}`
  const key = `${crypto.randomUUID()}.${ext}`
  const tamano = Number(req.headers.get("x-tamano")) || buf.byteLength
  await store.set(key, buf, { metadata: { tipo, nombre, partes, tamano, fecha: Date.now() } })
  return Response.json({ id: key, url: `${url.origin}/api/archivo/${key}` })
}

export const config: Config = { path: ["/api/archivo", "/api/archivo/:id"] }
