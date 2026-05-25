import {isAnthropicProvider, ANTHROPIC_MODELS, OPENAI_MODELS} from '@/lib/llm';

export async function GET() {
  return Response.json({
    provider: isAnthropicProvider() ? 'anthropic' : 'openai',
    anthropicModels: ANTHROPIC_MODELS,
    openaiModels: OPENAI_MODELS,
  });
}
