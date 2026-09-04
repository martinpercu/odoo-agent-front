import type { OdooConfigSummary } from "@/lib/types";

/**
 * El nombre con el que una instancia se muestra a una persona.
 *
 * ⚠️ **Una sola precedencia, acá y en el back** (`routines/compose/pdf.py`
 * `instance_label`): la misma instancia no puede llamarse de dos maneras según la
 * pantalla, y menos entre la tarjeta del historial y el PDF que esa tarjeta descarga.
 *
 * El orden importa y no es arbitrario:
 *  1. `display_name` — el nombre que le puso el implementador (P2.1);
 *  2. `company_name` — el que declaró Odoo al validar la conexión;
 *  3. `label` — **técnico, y suele ser un apodo interno**: en la base de desarrollo una
 *     instancia cuyo Odoo dice "Distribuidora 21" tiene `label = 'Bentley'`. Mostrar eso
 *     como nombre de instancia le diría al implementador algo que su cliente no
 *     reconoce, así que va último y sólo cuando no hay nada mejor.
 *
 * Devuelve `null` cuando no hay ningún nombre utilizable: quien llama decide si eso es
 * un guion, un id o esconder el cartel — no se inventa un placeholder acá.
 */
export function instanceLabel(
  config: Pick<OdooConfigSummary, "display_name" | "company_name" | "label"> | null | undefined
): string | null {
  if (!config) return null;
  for (const value of [config.display_name, config.company_name, config.label]) {
    const trimmed = (value ?? "").trim();
    if (trimmed) return trimmed;
  }
  return null;
}

/**
 * Igual, pero buscando por id en una lista — el caso del historial, donde lo guardado es
 * el `config_id` de la corrida y no la instancia entera.
 *
 * ⚠️ Una corrida puede apuntar a una instancia que ya **no está** en la lista (se borró,
 * o al usuario le sacaron el acceso). Devuelve `null` y quien llama muestra el fallback:
 * pintar el UUID sería el mismo error que la tarjeta del historial cometía con el
 * `routine_id`.
 */
export function instanceLabelById(
  configs: OdooConfigSummary[] | undefined,
  configId: string | null | undefined
): string | null {
  if (!configId) return null;
  const found = instanceLabel(configs?.find((c) => c.id === configId));
  if (found) return found;
  /**
   * ⚠️ El caso especial de demo **se invirtió** con el parque de instancias
   * (PLAN_INSTANCIAS/05). Antes esto devolvía `"Demo"` ANTES de buscar, y con cuatro
   * instancias de demo eso llamaba igual a Kestrel Sales Group, Ladera Consultores,
   * Casa Mendieta y Distribuidora 21 — o sea, tapaba justo el dato que el cartel
   * existe para dar. Ahora la fila manda: una instancia del parque tiene
   * `display_name` de verdad y la precedencia normal alcanza.
   *
   * Queda sólo para el literal `"demo"`, que es el alias de compatibilidad y no
   * tiene fila: chats viejos, links compartidos, y el arranque sin catálogo cargado.
   */
  if (configId === "demo") return "Demo";
  return null;
}
