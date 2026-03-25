import type { SourceDetectionResult } from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function detectImportSource(raw: unknown): SourceDetectionResult {
  if (!isRecord(raw)) {
    return {
      sourceType: 'unknown',
      isSupported: false,
      reasons: ['Payload is not a JSON object.'],
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
