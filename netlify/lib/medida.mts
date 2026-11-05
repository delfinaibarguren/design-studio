// Precio de Enmarcado a medida (foto o lámina del cliente, u obra de la web en otra medida), calculado en el servidor.
import catalog from "../../catalog.json" with { type: "json" }

const AM: any = (catalog.store as any).aMedida
export type ItemMedida = { medida: string; tipo: string; color: string; paspartu: string; ancho?: string; imp?: string; cant: number; nota?: string }

export function precioItem(it: ItemMedida): { unit: number; desc: string; paquete: any } | null {
  const t = AM.precios[String(it.medida)]; if (!t) return null
  const box = it.tipo === "Box"; if (!box && it.tipo !== "Chato") return null
  if (!["Kiri natural", "Negro", "Blanco"].includes(it.color)) return null
  if (!["Paspartú blanco", "Paspartú negro", "Sin paspartú"].includes(it.paspartu)) return null
  const pasp = it.paspartu !== "Sin paspartú", ancho = pasp ? Number(it.ancho || 5) : 0
  if (pasp && ![3, 5, 8, 12].includes(ancho)) return null
  const trae = it.imp === "La traigo impresa"
  const unit = (box ? t.box : t.chato) + (it.color !== "Kiri natural" ? t.pintado : 0) - (pasp ? 0 : t.sinPaspartu) - (trae ? t.sinImpresion : 0)
  const desc = `Enmarcado a medida ${it.medida.replace("x", " × ")} cm, marco ${it.tipo.toLowerCase()} ${it.color.toLowerCase()}, ${pasp ? `${it.paspartu.toLowerCase()} de ${ancho} cm` : "sin paspartú"}, ${trae ? "foto impresa por el cliente" : "impresión incluida"}${it.nota ? ` (${String(it.nota).slice(0, 60)})` : ""}`
  return { unit, desc, paquete: t.paquete }
}

export const calculable = (que: string, objeto: string) => que === "Obra de Dsgn. Studio" || (AM.objetos as string[]).includes(objeto)
export const plazo = () => AM.plazo as string
