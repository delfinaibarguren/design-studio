import type { Config } from "@netlify/functions"
import { getStore } from "@netlify/blobs"

// Fotos que adjuntan los clientes en "Enmarcado a medida".
// POST /api/archivo        -> guarda el archivo y devuelve { url } para mandarlo en el mail
// GET  /api/archivo/<id>   -> muestra / descarga el archivo
const TIPOS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "application/pdf": "pdf" }
const MAX = 5.5 * 1024 * 1024

export default async (req: Request) => {
  const store = getStore({ name: "archivos-clientes", consistency: "strong" })
  const url = new URL(req.url)
  const id = url.pathname.split("/").pop() || ""

  if (req.method === "GET") {
    if (!/^[a-z0-9-]{20,60}\.(jpg|png|webp|heic|pdf)$/.test(id)) return new Response("No encontrado", { status: 404 })
    const r = await store.getWithMetadata(id, { type: "arrayBuffer" })
    if (!r) return new Response("No encontrado", { status: 404 })
    const m = r.metadata as { tipo?: string; nombre?: string }
    const nombre = (m.nombre || id).replace(/[^\w.\- ()áéíóúñÁÉÍÓÚÑ]/g, "_")
    return new Response(r.data, { headers: {
      "Content-Type": m.tipo || "application/octet-stream",
      "Content-Disposition": `${url.searchParams.has("descargar") ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(nombre)}`,
      "Cache-Control": "private, max-age=86400", "X-Robots-Tag": "noindex",
    } })
  }

  if (req.method !== "POST") return new Response("Método no permitido", { status: 405 })
  const tipo = (req.headers.get("content-type") || "").split(";")[0].trim().toLowerCase()
  const ext = TIPOS[tipo]
  if (!ext) return Response.json({ error: "Tipo de archivo no permitido" }, { status: 415 })
  const buf = await req.arrayBuffer()
  if (!buf.byteLength || buf.byteLength > MAX) return Response.json({ error: "Archivo vacío o demasiado grande" }, { status: 413 })
  const nombre = decodeURIComponent(req.headers.get("x-nombre") || "").slice(0, 120) || `foto.${ext}`
  const key = `${crypto.randomUUID()}.${ext}`
  await store.set(key, buf, { metadata: { tipo, nombre, fecha: Date.now() } })
  return Response.json({ url: `${url.origin}/api/archivo/${key}` })
}

export const config: Config = { path: ["/api/archivo", "/api/archivo/:id"] }
