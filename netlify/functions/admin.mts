import type { Config } from "@netlify/functions"
import { listar, leer, guardar, pagadoYEnviar, enviar } from "../lib/pedidos.mts"
import { firmaCorta } from "../lib/firma.mts"
import { configurado, cotizar, verEnvio } from "../lib/zipnova.mts"

// Página privada de pedidos y envíos (requiere ADMIN_KEY).
export default async (req: Request) => {
  let b: any
  try { b = await req.json() } catch { return Response.json({ error: "Pedido inválido" }, { status: 400 }) }
  const key = Netlify.env.get("ADMIN_KEY")
  if (!key || b.key !== key) return Response.json({ error: "Clave incorrecta" }, { status: 401 })
  const origin = new URL(req.url).origin
  const conLinks = (p: any) => p && ({ ...p, etiqueta: p.envioCreado ? `${origin}/api/etiqueta?orden=${encodeURIComponent(p.orden)}&s=${firmaCorta("etiqueta", p.orden)}` : null })

  try {
    switch (b.accion) {
      case "listar":
        return Response.json({ zipnova: configurado(), pedidos: (await listar()).map(conLinks) })
      case "pagado":   // transferencia recibida → crear envío
        return Response.json({ pedido: conLinks(await pagadoYEnviar(String(b.orden))) })
      case "reintentar": {
        const p = await leer(String(b.orden)); if (!p) throw new Error("No existe el pedido")
        p.creandoDesde = undefined
        return Response.json({ pedido: conLinks(await enviar(p)) })
      }
      case "cancelar": {
        const p = await leer(String(b.orden)); if (!p) throw new Error("No existe el pedido")
        p.estado = "cancelado"; await guardar(p)
        return Response.json({ pedido: conLinks(p) })
      }
      case "actualizar": {   // estado actual del envío en Zipnova
        const p = await leer(String(b.orden)); if (!p?.envioCreado) throw new Error("Sin envío")
        p.envioCreado = { ...p.envioCreado, ...(await verEnvio(p.envioCreado.id)) }; await guardar(p)
        return Response.json({ pedido: conLinks(p) })
      }
      case "probar": {   // cotización de prueba (para revisar la conexión)
        const items = [{ weight: 5000, height: 8, width: 65, length: 85, description: "Cuadro 50x70", classification_id: 1 }]
        let raw: any = null
        const opcion = await cotizar({ cp: String(b.cp || "5000"), ciudad: String(b.ciudad || "Córdoba"), provincia: String(b.provincia || "Córdoba") }, items, 150000, (d) => (raw = d))
        return Response.json({ opcion, raw })
      }
    }
  } catch (e) { return Response.json({ error: (e as Error).message }, { status: 400 }) }
  return Response.json({ error: "Acción desconocida" }, { status: 400 })
}

export const config: Config = { path: "/api/admin", method: "POST" }
