/** Current default Modulon model shown in the composer. */
export const MODULON_CHAT_MODEL_LABEL = 'Modulon M0.1';

/** Models shown in the primary picker column. */
export const PRIMARY_MODULON_MODELS = [
  { id: 'modulon', label: MODULON_CHAT_MODEL_LABEL, provider: 'modulon' },
];

/** Retired Modulon versions — still routed through the Modulon API. */
export const LEGACY_MODULON_MODELS = [
  { id: 'modulon-m0.0', label: 'Modulon M0.0', provider: 'modulon', disabled: true },
];

export const PROVIDER_MODELS = {
  anthropic: {
    label: 'Anthropic',
    models: [
      { id: 'claude-opus-4-5', label: 'Claude Opus 4.5' },
      { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
      { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
    ],
  },
  openai: {
    label: 'OpenAI',
    models: [
      { id: 'gpt-4o', label: 'GPT-4o' },
      { id: 'gpt-4o-mini', label: 'GPT-4o mini' },
      { id: 'o3-mini', label: 'o3-mini' },
    ],
  },
  google: {
    label: 'Google',
    models: [
      { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
      { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
    ],
  },
  xai: {
    label: 'xAI',
    models: [
      { id: 'grok-3', label: 'Grok 3' },
      { id: 'grok-3-mini', label: 'Grok 3 mini' },
    ],
  },
  deepseek: {
    label: 'DeepSeek',
    models: [
      { id: 'deepseek-chat', label: 'DeepSeek V3' },
      { id: 'deepseek-reasoner', label: 'DeepSeek R1' },
    ],
  },
};

export function isSameModel(a, b) {
  return a?.id === b?.id && a?.provider === b?.provider;
}

export function providerGroupsWithKeys(apiKeys = {}) {
  return Object.entries(PROVIDER_MODELS).filter(([pid]) => Boolean(apiKeys[pid]));
}
