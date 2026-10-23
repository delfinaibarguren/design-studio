// Presupuestos a medida: los datos viajan en el link, firmados para que nadie pueda cambiar el monto.
import { createHmac, timingSafeEqual } from "node:crypto"

export type Item = { desc: string; cant: number; precio: number }   // precio = total de la línea
export type Presupuesto = { id: string; cliente: string; items: Item[]; envio: number; descTransfer: boolean; nota?: string; fecha: number; vence: number }

const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64url")
const secret = () => {
  const s = Netlify.env.get("PRESUPUESTO_SECRET")
  if (!s) throw new Error("Falta PRESUPUESTO_SECRET")
  return s
}
const sig = (body: string) => b64(createHmac("sha256", secret()).update(body).digest())

export function firmar(p: Presupuesto) {
  const body = b64(JSON.stringify(p))
  return `${body}.${sig(body)}`
}

export function verificar(token: string | null | undefined): Presupuesto | { error: string } {
  if (!token || !token.includes(".")) return { error: "Link inválido" }
  const [body, s] = token.split(".")
  const a = Buffer.from(s || ""), b = Buffer.from(sig(body))
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { error: "Link inválido" }
  let p: Presupuesto
  try { p = JSON.parse(Buffer.from(body, "base64url").toString()) } catch { return { error: "Link inválido" } }
  if (Date.now() > p.vence) return { error: "Este presupuesto venció. Escribinos y te pasamos uno nuevo." }
  return p
}

export const subtotal = (p: Presupuesto) => p.items.reduce((s, i) => s + i.precio, 0) + (p.envio || 0)
