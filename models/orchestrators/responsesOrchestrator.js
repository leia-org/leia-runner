const OpenAI = require('openai');
const client = new OpenAI();
const BaseOrchestrator = require('./baseOrchestrator');

class ResponsesOrchestrator extends BaseOrchestrator {
  constructor() {
    super();
    this.name = 'responsesOrchestrator';
  }

  formatConversation(conversation = [], limit = 8) {
    if (!Array.isArray(conversation) || conversation.length === 0) {
      return 'Sin historial reciente.';
    }

    return conversation
      .slice(-limit)
      .map((message, index) => {
        const role = message.role || 'unknown';
        const leiaId = message.leiaId ? ` [LEIA ${message.leiaId}]` : '';
        const content = message.content || '';
        return `${index + 1}. ${role}${leiaId}: ${content}`;
      })
      .join('\n');
  }

  parseSelection(responseText, leias = []) {
    const fallbackText = typeof responseText === 'string' ? responseText.trim() : '';

    if (!fallbackText) {
      return null;
    }

    const cleanedText = fallbackText
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```$/i, '')
      .trim();

    try {
      const parsed = JSON.parse(cleanedText);
      const selectedLeiaId = parsed.selectedLeiaId || parsed.leiaId || parsed.id;

      if (selectedLeiaId) {
        return leias.find((leia) => leia.leiaId === selectedLeiaId) || null;
      }
    } catch {
      // Fallback to plain text parsing below.
    }

    return leias.find((leia) => cleanedText.includes(leia.leiaId)) || null;
  }

  async selectLeia(leias = [], conversation = []) {
    if (!Array.isArray(leias) || leias.length === 0) {
      return null;
    }

    const response = await client.responses.create({
      model: 'gpt-5.4-mini',
      instructions:
        'Eres un orquestador que selecciona la mejor LEIA para responder al mensaje recibido. Usa el historial reciente para entender el contexto del turno actual. Responde SOLO en JSON valido con la forma {"selectedLeiaId":"...","reason":"..."}.',
      input: [
        {
          role: 'system',
          content: `Contexto reciente de la conversación:\n${this.formatConversation(conversation)}\n\nLEIAs disponibles:\n${leias
            .map(
              (leia) =>
                `LEIA ID: ${leia.leiaId}\nInstrucciones: ${leia.instructions}\nSolucion: ${leia.solution}\nFormato de solucion: ${leia.solutionFormat}\nPrompt de evaluacion: ${leia.evaluationPrompt}`,
            )
            .join('\n\n')}`,
        },
      ],
      store: false,
    });
    console.log('Respuesta del orquestador:', response);
    const selectedLeia = this.parseSelection(response.output_text, leias);
    return selectedLeia;
  }

}

module.exports = new ResponsesOrchestrator();