// Firma genérica (HMAC) para datos que pasan por el navegador: cotizaciones de envío, links de etiqueta.
import { createHmac, timingSafeEqual } from "node:crypto"

const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64url")
const secret = () => {
  const s = Netlify.env.get("PRESUPUESTO_SECRET")
  if (!s) throw new Error("Falta PRESUPUESTO_SECRET")
  return s
}
const sig = (tipo: string, body: string) => b64(createHmac("sha256", secret()).update(tipo + ":" + body).digest())

export function firmar(tipo: string, data: object) {
  const body = b64(JSON.stringify(data))
  return `${body}.${sig(tipo, body)}`
}

export function verificar<T = any>(tipo: string, token: unknown): T | null {
  if (typeof token !== "string" || !token.includes(".")) return null
  const [body, s] = token.split(".")
  const a = Buffer.from(s || ""), b = Buffer.from(sig(tipo, body))
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const d = JSON.parse(Buffer.from(body, "base64url").toString())
    if (d.vence && Date.now() > d.vence) return null
    return d
  } catch { return null }
}

export const firmaCorta = (tipo: string, valor: string) => sig(tipo, valor).slice(0, 22)
export function okCorta(tipo: string, valor: string, s: unknown) {
  const a = Buffer.from(String(s || "")), b = Buffer.from(firmaCorta(tipo, valor))
  return a.length === b.length && timingSafeEqual(a, b)
}
