import {createOpenAI} from '@ai-sdk/openai';
import {createAnthropic} from '@ai-sdk/anthropic';

export const isAnthropicProvider = () =>
  process.env.LLM_PROVIDER === 'anthropic';

export const getLLMModel = () => {
  if (isAnthropicProvider()) {
    const anthropic = createAnthropic({apiKey: process.env.ANTHROPIC_API_KEY!});
    return anthropic('claude-sonnet-4-6');
  }
  const openai = createOpenAI({apiKey: process.env.OPENAI_API_KEY!});
  return openai('gpt-4o-mini');
};
