import type { SourceDetectionResult } from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function matchesJumpSummaryTextSignature(rawText: string) {
  const normalizedText = rawText.replace(/\r\n?/g, '\n');
  const firstMeaningfulLine =
    normalizedText
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? '';

  if (!firstMeaningfulLine.endsWith(':')) {
    return false;
  }

  return ['Budgets:', 'Origin & Background:', 'Purchases:'].every((heading) => normalizedText.includes(heading));
}

export function detectImportSource(raw: unknown): SourceDetectionResult {
  if (typeof raw === 'string') {
    if (matchesJumpSummaryTextSignature(raw)) {
      return {
        sourceType: 'jump-summary-text',
        sourceVersion: '1.0',
        isSupported: true,
        reasons: ['Detected jump summary text headings: Budgets, Origin & Background, Purchases.'],
      };
    }

    return {
      sourceType: 'unknown',
      isSupported: false,
      reasons: ['Text payload does not match a supported jump summary import shape.'],
    };
  }

  if (!isRecord(raw)) {
    return {
      sourceType: 'unknown',
      isSupported: false,
      reasons: ['Payload is neither a JSON object nor a supported jump summary text file.'],
    };
  }

  if (
    typeof raw.formatVersion === 'string' &&
    typeof raw.schemaVersion === 'number' &&
    Array.isArray(raw.chains)
  ) {
    return {
      sourceType: 'native',
      sourceVersion: String(raw.schemaVersion),
      isSupported: true,
      reasons: ['Detected native save envelope fields: formatVersion, schemaVersion, chains.'],
    };
  }

  if (
    typeof raw.versionNumber === 'string' &&
    isRecord(raw.characters) &&
    isRecord(raw.jumps)
  ) {
    return {
      sourceType: 'chainmaker-v2',
      sourceVersion: raw.versionNumber,
      isSupported: raw.versionNumber === '2.0',
      reasons: ['Detected ChainMaker-style fields: versionNumber, characters, jumps.'],
    };
  }

  return {
    sourceType: 'unknown',
    isSupported: false,
    reasons: ['No supported source signature matched the uploaded JSON.'],
  };
}
