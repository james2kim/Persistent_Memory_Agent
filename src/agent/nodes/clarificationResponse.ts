import type { AgentState } from '../../schemas/types';
import { model } from '../constants';

const CLARIFICATION_SYSTEM_MESSAGE = `You are a Study Assistant Agent. The user asked something that is outside your core domain or requires clarification.

Your job:
1. Briefly acknowledge the question (1 sentence max)
2. Politely explain you're focused on study-related help
3. Offer to help with something in your domain

Keep it short - 2-3 sentences total. No lectures, no apologies, no emojis.

Examples:
- "Stock tips aren't really my area. I'm better at helping with your study goals - want to review any materials or check on your progress?"
- "I'd need more context to help with that. What specifically are you trying to learn or accomplish?"
- "That's outside my wheelhouse. Anything study-related I can help with?"`;

export const clarificationResponse = async (state: AgentState) => {
  const aiMessage = await model.invoke([
    { role: 'system', content: CLARIFICATION_SYSTEM_MESSAGE },
    { role: 'user', content: state.userQuery },
  ]);

  const response =
    typeof aiMessage.content === 'string' ? aiMessage.content : JSON.stringify(aiMessage.content);

  return {
    messages: [aiMessage],
    response,
  };
};
