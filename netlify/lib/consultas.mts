// Pedidos de presupuesto ("Enmarcado a medida"), guardados en Netlify Blobs para el panel de gestión.
import { getStore } from "@netlify/blobs"

export const ESTADOS = ["nuevo", "presupuestado", "aceptado", "imprenta", "armado", "listo", "entregado", "descartado"] as const
export type Consulta = {
  id: string; fecha: number; estado: typeof ESTADOS[number]
  nombre: string; whatsapp: string; email: string
  que: string; obra: string; objeto: string; medidas: string; comentarios: string
  entrega?: string; cp?: string; localidad?: string; provincia?: string
  fotos: { nombre: string; url: string }[]; fotosForm: string[]
  sub?: string   // id del envío en Netlify Forms (para no duplicar)
  presupuesto?: { id: string; url: string; total: number; fecha: number }
  nota?: string; historial: { fecha: number; estado: string }[]
}

const store = () => getStore({ name: "consultas", consistency: "strong" })
const clave = (id: string) => id.replace(/[^A-Za-z0-9-]/g, "").slice(0, 40)

export const leer = async (id: string) => (await store().get(clave(id), { type: "json" })) as Consulta | null
export const guardar = (c: Consulta) => store().setJSON(clave(c.id), c)
export const borrar = (id: string) => store().delete(clave(id))
// trae los pedidos que ya estaban en Netlify Forms (necesita NETLIFY_TOKEN)
export async function importar(siteId: string): Promise<number> {
  const token = Netlify.env.get("NETLIFY_TOKEN")
  if (!token) throw new Error("Falta el token NETLIFY_TOKEN en la configuración de Netlify")
  const h = { Authorization: `Bearer ${token}` }
  const forms = await (await fetch(`https://api.netlify.com/api/v1/sites/${siteId}/forms`, { headers: h })).json()
  const form = Array.isArray(forms) && forms.find((f: any) => f.name === "consulta")
  if (!form) throw new Error("No se pudo leer el formulario (revisá el token)")
  const subs = await (await fetch(`https://api.netlify.com/api/v1/forms/${form.id}/submissions?per_page=100`, { headers: h })).json()
  if (!Array.isArray(subs)) throw new Error("No se pudieron leer los pedidos")
  const ya = new Set((await listar(1000)).map((c) => c.sub).filter(Boolean))
  let n = 0
  for (const s of subs) {
    if (ya.has(s.id)) continue
    const c = desdeFormulario(s.data || {}, Date.parse(s.created_at) || Date.now(), s.id)
    if (!c.nombre && !c.whatsapp) continue
    await guardar(c); n++
  }
  return n
}

export async function listar(max = 150): Promise<Consulta[]> {
  const { blobs } = await store().list()
  const all = await Promise.all(blobs.map((b) => store().get(b.key, { type: "json" }) as Promise<Consulta | null>))
  return all.filter(Boolean).sort((a, b) => b!.fecha - a!.fecha).slice(0, max) as Consulta[]
}

const txt = (v: unknown, n = 2000) => String(v ?? "").trim().slice(0, n)
// arma una consulta a partir de los datos del formulario "consulta"
export function desdeFormulario(d: Record<string, any>, fecha = Date.now(), sub?: string): Consulta {
  const links = txt(d.fotos_links, 8000)
  const fotos = [...links.matchAll(/Foto \d+ \(([^)]*)\)[^\n]*?descargar: (\S+?)\?descargar/g)].map((m) => ({ nombre: m[1].replace(/, [\d.,]+ ?[KMG]?B$/i, ""), url: m[2] }))
  const fotosForm = Object.keys(d).filter((k) => /^archivo\d+$/.test(k)).map((k) => (d[k] && (d[k].url || d[k])) || "").filter((u) => typeof u === "string" && u)
  return {
    id: "PZ-" + (sub ? sub.slice(-8) : fecha.toString(36)).toUpperCase(), sub, fecha, estado: "nuevo",
    nombre: txt(d.nombre, 80), whatsapp: txt(d.whatsapp, 40), email: txt(d.email, 120),
    entrega: txt(d.entrega, 40), cp: txt(d.cp, 10), localidad: txt(d.localidad, 80), provincia: txt(d.provincia, 40),
    que: txt(d.que, 60), obra: txt(d.obra, 120), objeto: txt(d.objeto, 120), medidas: txt(d.medidas), comentarios: txt(d.comentarios),
    fotos, fotosForm, historial: [{ fecha, estado: "nuevo" }],
  }
}
