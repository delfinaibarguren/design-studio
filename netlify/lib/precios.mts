// Precio de cada línea del carrito, calculado siempre en el servidor (nunca se confía en el navegador).
import catalog from "../../catalog.json" with { type: "json" }

export type Line = { imagen?: string; productId: string; size: string; finish: string; frame?: string; style?: string; tipo?: string; color?: string; terminacion?: string; fondo?: string; qty: number }
export type Priced = { id: string; title: string; quantity: number; unit_price: number; currency_id: "ARS"; size: string; name: string }

const products = new Map(catalog.products.map((p) => [p.id, p]))
const sizes = new Map(catalog.sizes.map((s) => [s.id, s]))
const frames = new Map(catalog.frames.map((f) => [f.id, f]))

export function priceLine(line: Line): Priced | null {
  const product: any = products.get(String(line.productId))
  const size: any = sizes.get(String(line.size))
  if (!product || !size) return null
  const qty = Math.max(1, Math.min(10, Math.floor(Number(line.qty) || 1)))
  const base = { quantity: qty, currency_id: "ARS" as const, size: size.id, name: product.name }
  if (product.photo) {
    const C: any = catalog
    const find = (list: any[], id: any) => (list || []).find((x) => x.id === String(id))
    const ft = find(C.frameTypes, line.tipo), col = find(C.frameColors, line.color), ter = find(C.terminaciones, line.terminacion)
    const fon = ter?.id === "arpillera" ? find(C.fondos, line.fondo) : null
    if (!ft || !col || !ter || (ter.id === "arpillera" && !fon)) return null
    const variant = `${size.label}, marco ${ft.label.toLowerCase()} ${col.label.toLowerCase()}, ${ter.label.toLowerCase()}${fon ? " fondo " + fon.label.toLowerCase() : ""}${line.imagen === "bn" ? ", blanco y negro" : ""}`
    return {
      ...base,
      id: [product.id, size.id, ft.id, col.id, ter.id, fon?.id, line.imagen === "bn" ? "bn" : ""].filter(Boolean).join("-"),
      title: `${product.name} (${variant})`,
      unit_price: size.precios[`${ft.id}-${col.grupo || "natural"}`] + (ter.id === "arpillera" ? size.arpillera || 0 : 0) - (ter.id === "sin" ? size.descuentoSinPaspartu || 0 : 0),
    }
  }
  if (product.styles) {
    const st = product.styles.find((s: any) => s.id === line.style)
    if (!st) return null
    const types: any[] = (catalog as any).frameTypes || []
    const ft = types.find((t) => t.id === line.tipo)
    if (types.length && !ft) return null
    const label = size.label + (ft ? `, tipo ${ft.label.toLowerCase()}` : "")
    return {
      ...base,
      id: `${product.id}-${size.id}-${ft ? ft.id + "-" : ""}${st.id}`,
      title: `${product.name} (${label}, ${st.label})`,
      unit_price: (st.finish === "marco" ? size.marco : size.lamina) + (ft?.extra || 0),
    }
  }
  const withFrame = line.finish === "marco"
  const frame: any = withFrame ? frames.get(String(line.frame)) : null
  if (withFrame && !frame) return null
  const variant = withFrame ? `${size.label}, marco ${frame.label.toLowerCase()}` : `${size.label}, solo lámina`
  return {
    ...base,
    id: `${product.id}-${size.id}-${line.finish}${frame ? "-" + frame.id : ""}`,
    title: `${product.name} (${variant})`,
    unit_price: withFrame ? size.marco : size.lamina,
  }
}

export const priceLines = (lines: unknown) => (Array.isArray(lines) ? lines : []).map(priceLine).filter(Boolean) as Priced[]
export const sumLines = (p: Priced[]) => p.reduce((a, l) => a + l.unit_price * l.quantity, 0)

// Un paquete por cuadro, con las medidas de la caja ya embalada (catalog.json → sizes[].paquete)
export function paquetes(p: Priced[]) {
  const out: any[] = []
  for (const l of p) {
    const pk: any = (sizes.get(l.size) as any)?.paquete
    if (!pk) continue
    for (let i = 0; i < l.quantity; i++)
      out.push({ weight: pk.peso, height: pk.alto, width: pk.ancho, length: pk.largo, description: `Cuadro ${l.name}`.slice(0, 60), classification_id: 1 })
  }
  return out
}

// Huella del carrito: para que una cotización de envío no se use con otro carrito
export const huella = (p: Priced[]) => p.map((l) => `${l.size}x${l.quantity}`).sort().join(",")

export const store = catalog.store as any

// Envío gratis / bonificado: compras desde store.envioGratis.minimo → gratis en AMBA, al interior se bonifica hasta bonificacionInterior
export const esAMBA = (cp: string, provincia: string) => provincia === "CABA" || (provincia === "Buenos Aires" && /^1\d{3}$/.test(cp))
export function bonificacion(productos: number, costo: number, cp: string, provincia: string) {
  const g = (catalog.store as any).envioGratis
  if (!g || productos < g.minimo) return 0
  return esAMBA(cp, provincia) ? costo : Math.min(costo, g.bonificacionInterior || 0)
}
