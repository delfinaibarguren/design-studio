import type { Config } from "@netlify/functions"
import { listar, leer, guardar, borrar, pagadoYEnviar, enviar } from "../lib/pedidos.mts"
import { firmaCorta } from "../lib/firma.mts"
import * as C from "../lib/consultas.mts"
import { configurado, cotizar, verEnvio, opciones } from "../lib/zipnova.mts"

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
      case "consultas":
        return Response.json({ consultas: await C.listar() })
      case "consulta": {   // cambiar estado / nota / presupuesto de un pedido de presupuesto
        const c = await C.leer(String(b.id)); if (!c) throw new Error("No existe la consulta")
        if (b.estado && (C.ESTADOS as readonly string[]).includes(b.estado) && b.estado !== c.estado) { c.estado = b.estado; c.historial = [...(c.historial || []), { fecha: Date.now(), estado: b.estado }] }
        if (typeof b.nota === "string") c.nota = b.nota.slice(0, 1000)
        if (b.presupuesto && b.presupuesto.url) c.presupuesto = { id: String(b.presupuesto.id || "").slice(0, 40), url: String(b.presupuesto.url).slice(0, 4000), total: Number(b.presupuesto.total) || 0, fecha: Date.now() }
        await C.guardar(c)
        return Response.json({ consulta: c })
      }
      case "consulta_borrar": {
        const c = await C.leer(String(b.id)); if (!c) throw new Error("No existe la consulta")
        if (c.estado !== "descartado") throw new Error("Primero marcala como descartada")
        await C.borrar(c.id); return Response.json({ eliminado: c.id })
      }
      case "importar":
        return Response.json({ importados: await C.importar((Netlify as any).context?.site?.id || Netlify.env.get("SITE_ID") || "d66f069f-7ff9-4e70-a594-fd98bfd0a3b9"), consultas: await C.listar() })
      case "consulta_nueva": {   // cargar a mano un pedido que llegó por WhatsApp, Instagram, etc.
        const c = C.desdeFormulario({ nombre: b.nombre, whatsapp: b.whatsapp, email: b.email, medidas: b.medidas, comentarios: b.comentarios, que: "Algo mío", objeto: b.objeto })
        await C.guardar(c); return Response.json({ consulta: c })
      }
      case "envio_medida": {   // pedido a medida pagado: cotizar con las medidas del paquete y crear el envío
        const p: any = await leer(String(b.orden)); if (!p) throw new Error("No existe el pedido")
        if (p.entrega !== "domicilio" || !p.dest?.cp) throw new Error("El pedido no tiene dirección de envío")
        if (p.envioCreado) return Response.json({ pedido: conLinks(p) })
        const n = Math.max(1, Math.min(10, Math.floor(Number(b.cantidad) || 1)))
        const k = (v: any, min: number, max: number) => Math.max(min, Math.min(max, Math.round(Number(v) || 0)))
        const pk = { weight: k(b.peso, 100, 50000), height: k(b.alto, 1, 200), width: k(b.ancho, 1, 200), length: k(b.largo, 1, 200) }
        const items = Array.from({ length: n }, () => ({ ...pk, description: "Cuadro a medida", classification_id: 1 }))
        const op = await cotizar({ cp: p.dest.cp, ciudad: p.dest.ciudad, provincia: p.dest.provincia }, items, p.productos)
        if (!op) throw new Error("Zipnova no devolvió opciones de envío para ese destino")
        p.envio = { opcion: op, items, declarado: p.productos, bonif: Math.max(0, op.precio - (p.envioPrecio || 0)) }
        p.envioError = undefined; await guardar(p)
        return Response.json({ pedido: conLinks(await enviar(p)) })
      }
      case "etapa": {   // etapa de producción de una compra
        const p: any = await leer(String(b.orden)); if (!p) throw new Error("No existe el pedido")
        p.etapa = String(b.etapa || "").slice(0, 20); await guardar(p)
        return Response.json({ pedido: conLinks(p) })
      }
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
      case "eliminar": {   // solo pedidos cancelados (pruebas, pedidos que no siguieron)
        const p = await leer(String(b.orden)); if (!p) throw new Error("No existe el pedido")
        if (p.estado !== "cancelado") throw new Error("Primero cancelá el pedido")
        await borrar(p.orden)
        return Response.json({ eliminado: p.orden })
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
        return Response.json({ opcion, todas: raw ? opciones(raw, true) : [], raw })
      }
    }
  } catch (e) { return Response.json({ error: (e as Error).message }, { status: 400 }) }
  return Response.json({ error: "Acción desconocida" }, { status: 400 })
}

export const config: Config = { path: "/api/admin", method: "POST" }
