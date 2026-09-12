/** Conservative UTF-8 bound, with a separate reserve for provider chat templates. */
export function estimateTokens(text: string): number { return new TextEncoder().encode(text).length; }
export function inputBudget(provider: { contextWindow: number; maxOutput: number }): number {
  return provider.contextWindow - provider.maxOutput - 512;
}
