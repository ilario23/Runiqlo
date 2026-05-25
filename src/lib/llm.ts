import {createOpenAI} from '@ai-sdk/openai';
import {createAnthropic} from '@ai-sdk/anthropic';

export const isAnthropicProvider = () =>
  process.env.LLM_PROVIDER === 'anthropic';

export const ANTHROPIC_MODELS = [
  {id: 'claude-opus-4-7',          label: 'Claude Opus 4.7',    tier: 'powerful'},
  {id: 'claude-sonnet-4-6',        label: 'Claude Sonnet 4.6',  tier: 'balanced'},
  {id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5',  tier: 'fast'},
] as const;

export const OPENAI_MODELS = [
  {id: 'gpt-5.5',      label: 'GPT-5.5',       tier: 'powerful'},
  {id: 'gpt-5.4',      label: 'GPT-5.4',       tier: 'balanced'},
  {id: 'gpt-5.4-mini', label: 'GPT-5.4 mini',  tier: 'fast'},
] as const;

const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-4-6';
const DEFAULT_OPENAI_MODEL    = 'gpt-5.4';

export const getLLMModel = (modelOverride?: string | null) => {
  if (isAnthropicProvider()) {
    const modelId = modelOverride ?? DEFAULT_ANTHROPIC_MODEL;
    const anthropic = createAnthropic({apiKey: process.env.ANTHROPIC_API_KEY!});
    return anthropic(modelId);
  }
  const modelId = modelOverride ?? DEFAULT_OPENAI_MODEL;
  const openai = createOpenAI({apiKey: process.env.OPENAI_API_KEY!});
  return openai(modelId);
};
