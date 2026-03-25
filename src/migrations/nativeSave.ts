import type { NativeSaveEnvelope } from '../domain/save';
import { CURRENT_SCHEMA_VERSION } from '../app/config';
import { NativeSaveEnvelopeHeaderSchema, validateNativeSaveEnvelope } from '../schemas';

export function migrateV1Envelope(raw: unknown): NativeSaveEnvelope {
  return validateNativeSaveEnvelope(raw);
}

export function migrateNativeSaveEnvelope(raw: unknown): NativeSaveEnvelope {
  const header = NativeSaveEnvelopeHeaderSchema.parse(raw);

  switch (header.schemaVersion) {
    case CURRENT_SCHEMA_VERSION:
      return migrateV1Envelope(raw);
    default:
      throw new Error(`Unsupported native schema version: ${header.schemaVersion}`);
  }
}
