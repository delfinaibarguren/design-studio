// Conexión con Zipnova (API v2). Credenciales en variables de entorno de Netlify:
// ZIPNOVA_TOKEN, ZIPNOVA_SECRET, ZIPNOVA_ACCOUNT_ID y (opcional) ZIPNOVA_ORIGIN_ID.
const BASE = "https://api.zipnova.com.ar/v2"
const SOURCE = "design-studio-web"
const env = (k: string) => (Netlify.env.get(k) || "").trim()

export const configurado = () => Boolean(env("ZIPNOVA_TOKEN") && env("ZIPNOVA_SECRET") && Number(env("ZIPNOVA_ACCOUNT_ID")))
const cuenta = () => Number(env("ZIPNOVA_ACCOUNT_ID"))
const origen = () => Number(env("ZIPNOVA_ORIGIN_ID") || 382376)

export class ZipnovaError extends Error {
  status: number
  constructor(message: string, status = 0) { super(message); this.status = status }
}

async function req(method: "GET" | "POST", path: string, body?: object, ms = 15000): Promise<Response> {
  const auth = "Basic " + Buffer.from(`${env("ZIPNOVA_TOKEN")}:${env("ZIPNOVA_SECRET")}`).toString("base64")
  let r: Response
  try {
    r = await fetch(BASE + path, {
      method, signal: AbortSignal.timeout(ms),
      headers: { Authorization: auth, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch (e) {
    throw new ZipnovaError("Zipnova no respondió: " + (e as Error).message)
  }
  if (!r.ok) {
    const t = await r.text().catch(() => "")
    let msg = t.slice(0, 400)
    try { const j = JSON.parse(t); msg = j.message || j.error || JSON.stringify(j.errors || j).slice(0, 400) } catch {}
    console.error("Zipnova", method, path, r.status, t.slice(0, 1000))
    throw new ZipnovaError(r.status === 401 || r.status === 403 ? "Credenciales de Zipnova inválidas" : `Zipnova ${r.status}: ${msg}`, r.status)
  }
  return r
}
const json = async (r: Response) => r.json().catch(() => ({}))

const PROV: Record<string, string> = { CABA: "Capital Federal" }
export const provincia = (p: string) => PROV[p] || p

export type Opcion = { precio: number; carrier_id: number; carrier: string; logistic_type: string; service_type: string; min: number | null; max: number | null }

// Devuelve la opción de envío a domicilio más barata (o null si no hay)
export async function cotizar(dest: { cp: string; ciudad: string; provincia: string }, items: any[], declarado: number, crudo?: (d: any) => void): Promise<Opcion | null> {
  const d = await json(await req("POST", "/shipments/quote", {
    account_id: cuenta(), origin_id: origen(), source: SOURCE,
    declared_value: Math.round(declarado),
    destination: { zipcode: dest.cp, city: dest.ciudad, state: provincia(dest.provincia) },
    items, type_packaging: "none",
  }))
  crudo?.(d)
  const lista: any[] = [...(Array.isArray(d.all_results) ? d.all_results : []), ...Object.values(d.results || {})]
  const ops = lista
    .filter((o) => o && o.selectable !== false)
    .filter((o) => (o.service_type?.code || "") === "standard_delivery" || o.service_type?.id === 1)
    .map((o) => ({
      precio: Math.ceil(Number(o.amounts?.price_incl_tax ?? o.amounts?.price) || 0),
      carrier_id: Number(o.carrier?.id), carrier: String(o.carrier?.name || "Transporte"),
      logistic_type: String(o.logistic_type || ""), service_type: "standard_delivery",
      min: o.delivery_time?.min ?? null, max: o.delivery_time?.max ?? null,
    }))
    .filter((o) => o.precio > 0 && o.carrier_id)
    .sort((a, b) => a.precio - b.precio)
  return ops[0] || null
}

export type Destinatario = { nombre: string; dni: string; email: string; telefono: string; calle: string; numero: string; depto?: string; cp: string; ciudad: string; provincia: string }

export async function crearEnvio(p: { orden: string; opcion: Opcion; items: any[]; declarado: number; dest: Destinatario }) {
  const d = p.dest
  const s = await json(await req("POST", "/shipments", {
    account_id: cuenta(), origin_id: origen(), source: SOURCE,
    external_id: p.orden.replace(/[^A-Za-z0-9-]/g, "").slice(0, 30),
    carrier_id: p.opcion.carrier_id, logistic_type: p.opcion.logistic_type || undefined, service_type: "standard_delivery",
    declared_value: Math.round(p.declarado), type_packaging: "none", items: p.items,
    destination: {
      name: d.nombre, document: d.dni, email: d.email, phone: d.telefono,
      street: d.calle, street_number: d.numero, street_extras: d.depto || "",
      city: d.ciudad, state: provincia(d.provincia), zipcode: d.cp,
    },
  }, 25000))
  return {
    id: String(s.id || ""), estado: String(s.status_name || s.status || ""),
    carrier: String(s.carrier?.name || p.opcion.carrier),
    seguimiento: String(s.carrier_tracking_id || s.delivery_id || ""),
    tracking: String(s.tracking || s.tracking_external || ""),
  }
}

// Si ya existe un envío con ese número de pedido (para no crearlo dos veces)
export async function buscarEnvio(orden: string) {
  const q = new URLSearchParams({ account_id: String(cuenta()), external_id: orden.replace(/[^A-Za-z0-9-]/g, "").slice(0, 30) })
  const d = await json(await req("GET", "/shipments?" + q))
  const s = (d.data || []).find((x: any) => !["cancelled", "expired"].includes(x.status))
  return s ? { id: String(s.id), estado: String(s.status_name || s.status || ""), carrier: String(s.carrier?.name || ""), seguimiento: String(s.carrier_tracking_id || s.delivery_id || ""), tracking: String(s.tracking || "") } : null
}

export async function verEnvio(id: string) {
  const s = await json(await req("GET", `/shipments/${Number(id)}`))
  return { estado: String(s.status_name || s.status || ""), carrier: String(s.carrier?.name || ""), seguimiento: String(s.carrier_tracking_id || s.delivery_id || ""), tracking: String(s.tracking || "") }
}

// Etiqueta en PDF (Zipnova la devuelve como archivo o como JSON con el PDF en base64)
export async function etiqueta(id: string): Promise<Uint8Array | null> {
  for (const path of [`/shipments/${Number(id)}/label.pdf`, `/shipments/${Number(id)}/documentation?what=label&format=pdf`]) {
    let r: Response
    try { r = await req("GET", path) } catch (e) { if ((e as ZipnovaError).status === 409) return null; continue }
    const ct = r.headers.get("content-type") || ""
    if (!ct.includes("json")) return new Uint8Array(await r.arrayBuffer())
    const j = await json(r)
    if (typeof j.body === "string" && j.body) return Buffer.from(j.body.replace(/^data:[^,]*,/, ""), "base64")
  }
  return null
}
