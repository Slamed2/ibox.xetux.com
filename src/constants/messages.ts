// ─── Consultoría Venezuela custom messages ─────────────────────────────────

export const CONSULTORIA_VE_GREETING =
  '¡Buen día! ☀️ Qué gusto saludarte.\nLe saluda el equipo del Departamento de Consultoría Xetux Venezuela. Estamos aquí para ayudarte a impulsar y optimizar tu negocio. Cuéntanos, ¿en qué podemos acompañarte el día de hoy?';

export const CONSULTORIA_VE_OUT_OF_HOURS =
  '🕐 ¡Gracias por escribirnos a Xetux!\nEn este momento nuestro equipo se encuentra en su descanso. Nuestro horario de atención en vivo es de 9:00 am a 6:00 pm, todos los días.\n\n¡Pero descuida! Tu mensaje ya quedó guardado con prioridad en nuestro sistema. A primera hora al retomar nuestro turno, un especialista te atenderá sin falta. ¡Que tengas un feliz resto del día! 😊';

// Cierre por motivo declarado por el agente en el formulario de la extensión.
// La etiqueta la pone la extensión ANTES de resolver, así que llega en el
// payload del webhook. Pedido por Thalía (consultoría) el 28-ago-2026: mandar
// "tu caso fue resuelto" cuando el cliente simplemente dejó de escribir era
// falso, y encima no distinguía a quien nunca llegó a plantear nada.

// La firma cambia según el departamento: consultoría tiene voz propia y la
// conserva también en estos cierres. Soporte y el resto usan la genérica.
export const FIRMA_CONSULTORIA_VE =
  '¡Gracias por confiar en Consultoría Xetux! Que tengas un feliz día. 😁';

export function sinRespuestaFarewell(surveyUrl: string, firma: string): string {
  return `👋 No obtuvimos respuesta de tu parte, así que cerramos el ticket por ahora.\nSi tu caso sigue abierto, escríbenos y lo retomamos de inmediato.\n\nSi ya quedó resuelto, nos ayudarías mucho respondiendo esta breve encuesta de 1 minuto: ${surveyUrl} ${firma}`;
}

export function sinCasoFarewell(firma: string): string {
  return `👋 Cerramos esta conversación porque no llegamos a recibir tu consulta.\nCuando quieras, escríbenos de nuevo y con gusto te atendemos. ${firma}`;
}

export const CONSULTORIA_VE_FAREWELL =
  '👋 ¡Tu requerimiento ha sido procesado con éxito!\nNos ayudarías mucho respondiendo esta breve encuesta de 1 minuto: https://forms.gle/8Tv3jKP5WTziFPqD8 ¡Gracias por confiar en Consultoría Xetux! Que tengas un feliz día. 😁';

// ─── Triage de entrada (falla de sistema) ──────────────────────────────────

export const SYSTEM_FAILURE_APOLOGY =
  'Entendemos lo crítico que es esto para tu negocio y ya le dimos máxima prioridad a tu caso.\nUn agente de soporte ya está tomando tu caso. ¡Quédate tranquilo, lo solucionaremos juntos!';

// ─── Shared messages ────────────────────────────────────────────────────────

export const DEPARTMENT_SWITCH_HINT =
  '(Si necesitas cambiar de área, puedes usar el menú ☰ en la parte inferior).';
