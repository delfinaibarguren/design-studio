import type { Config } from "@netlify/functions"
import { getStore } from "@netlify/blobs"

// Fotos que adjuntan los clientes en "Enmarcado a medida", en su calidad original.
// Los archivos grandes llegan en partes (cada request de una función tiene un límite de ~6 MB).
// POST /api/archivo                 -> primera (o única) parte: crea el archivo y devuelve { id, url }
// POST /api/archivo/<id>?parte=N    -> partes siguientes
// GET  /api/archivo/<id>            -> muestra el archivo  ·  ?descargar -> lo descarga
const TIPOS: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif",
  "image/tiff": "tif", "image/gif": "gif", "application/pdf": "pdf",
}
const PARTE_MAX = 5 * 1024 * 1024
const PARTES_MAX = 12          // hasta ~60 MB por archivo
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
    if (partes === 1) return new Response(r.data, { headers })
    // varias partes: se mandan una detrás de otra
    let i = 0
    const stream = new ReadableStream({
      async pull(ctrl) {
        if (i === 0) { ctrl.enqueue(new Uint8Array(r.data)); i++; return }
        if (i >= partes) { ctrl.close(); return }
        const p = await store.get(`${id}~${i}`, { type: "arrayBuffer" })
        if (!p) { ctrl.error(new Error("falta una parte")); return }
        ctrl.enqueue(new Uint8Array(p)); i++
      },
    })
    return new Response(stream, { headers })
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
  await store.set(key, buf, { metadata: { tipo, nombre, partes, fecha: Date.now() } })
  return Response.json({ id: key, url: `${url.origin}/api/archivo/${key}` })
}

export const config: Config = { path: ["/api/archivo", "/api/archivo/:id"] }
