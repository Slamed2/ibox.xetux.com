import OpenAI from 'openai';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

const openai = new OpenAI({ apiKey: config.OPENAI_API_KEY });

const SYSTEM_PROMPT = `Eres un asistente que analiza conversaciones de soporte técnico de la empresa ${config.COMPANY_NAME}.
Tu tarea es generar un informe breve y profesional de la conversación.

El informe debe incluir:
1. **Motivo de contacto**: ¿Por qué el cliente se comunicó?
2. **Resumen**: Breve descripción de lo que se discutió
3. **Resolución**: ¿Cómo se resolvió? ¿Quedó pendiente algo?
4. **Departamento**: ¿Qué área atendió la solicitud?

Responde en español. Sé conciso (máximo 200 palabras). No incluyas saludos ni despedidas del resumen.`;

export async function summarizeConversation(messages: Array<{ content: string; message_type: number; sender?: { name?: string; type?: string } }>): Promise<string> {
  // Build conversation text from messages
  const conversationText = messages
    .filter((m) => m.content && m.message_type !== 2) // Exclude activity messages
    .map((m) => {
      const sender = m.sender?.type === 'contact'
        ? `Cliente (${m.sender?.name ?? 'Desconocido'})`
        : `Agente (${m.sender?.name ?? 'Bot'})`;
      return `${sender}: ${m.content}`;
    })
    .join('\n');

  if (!conversationText.trim()) {
    return 'No hay mensajes para analizar en esta conversación.';
  }

  try {
    const response = await openai.chat.completions.create({
      model: config.OPENAI_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Analiza la siguiente conversación:\n\n${conversationText}` },
      ],
      max_tokens: config.OPENAI_MAX_TOKENS,
      temperature: config.OPENAI_TEMPERATURE,
    });

    return response.choices[0]?.message?.content ?? 'No se pudo generar el resumen.';
  } catch (err) {
    logger.error({ err }, 'OpenAI summarization failed');
    return 'Error al generar el resumen de la conversación.';
  }
}
