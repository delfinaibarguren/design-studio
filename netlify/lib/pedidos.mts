// Pedidos guardados en Netlify Blobs: datos del cliente, dirección, cotización de envío y estado.
import { getStore } from "@netlify/blobs"
import { configurado, crearEnvio, buscarEnvio, type Opcion, type Destinatario } from "./zipnova.mts"

export type Pedido = {
  orden: string; fecha: number; tipo: "catalogo" | "medida"; pago: "mercadopago" | "transferencia"
  estado: "esperando_pago" | "pagado" | "cancelado"
  detalle: string; productos: number; envioPrecio: number; total: number
  entrega: "domicilio" | "retiro"; dest?: Destinatario
  envio?: { opcion: Opcion; items: any[]; declarado: number; bonif?: number } | null
  envioCreado?: { id: string; estado: string; carrier: string; seguimiento: string; tracking: string; fecha: number } | null
  envioError?: string; creandoDesde?: number; pagoId?: string
}

const store = () => getStore({ name: "pedidos", consistency: "strong" })
const clave = (orden: string) => orden.replace(/[^A-Za-z0-9-]/g, "").slice(0, 40)

export const leer = async (orden: string) => (await store().get(clave(orden), { type: "json" })) as Pedido | null
export const guardar = (p: Pedido) => store().setJSON(clave(p.orden), p)
export const borrar = (orden: string) => store().delete(clave(orden))

export async function listar(max = 80): Promise<Pedido[]> {
  const { blobs } = await store().list()
  const all = await Promise.all(blobs.map((b) => store().get(b.key, { type: "json" }) as Promise<Pedido | null>))
  return all.filter(Boolean).sort((a, b) => b!.fecha - a!.fecha).slice(0, max) as Pedido[]
}

// Marca el pedido como pagado y, si corresponde, crea el envío en Zipnova (una sola vez).
export async function pagadoYEnviar(orden: string, pagoId?: string): Promise<Pedido | null> {
  let p = await leer(orden)
  if (!p) return null
  if (p.estado !== "pagado" || (pagoId && !p.pagoId)) { p.estado = "pagado"; if (pagoId) p.pagoId = pagoId; await guardar(p) }
  return enviar(p)
}

export async function enviar(p: Pedido): Promise<Pedido> {
  if (p.envioCreado || p.entrega !== "domicilio" || !p.envio || !p.dest || !configurado()) return p
  // otro proceso lo está creando ahora mismo (el aviso de Mercado Pago y la página de gracias llegan casi juntos)
  if (p.creandoDesde && Date.now() - p.creandoDesde < 60_000) return p
  p.creandoDesde = Date.now(); await guardar(p)
  try {
    const ya = await buscarEnvio(p.orden).catch(() => null)
    const e = ya || (await crearEnvio({ orden: p.orden, opcion: p.envio.opcion, items: p.envio.items, declarado: p.envio.declarado, dest: p.dest }))
    p.envioCreado = { ...e, fecha: Date.now() }; p.envioError = undefined
  } catch (x) {
    p.envioError = (x as Error).message.slice(0, 300)
  }
  p.creandoDesde = undefined
  await guardar(p)
  return p
}
