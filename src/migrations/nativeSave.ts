import type { NativeSaveEnvelope } from '../domain/save';
import { NativeSaveEnvelopeSchema } from '../schemas';
import { CURRENT_SCHEMA_VERSION } from '../app/config';

export function migrateNativeSaveEnvelope(raw: unknown): NativeSaveEnvelope {
  const envelope = NativeSaveEnvelopeSchema.parse(raw);

  switch (envelope.schemaVersion) {
    case CURRENT_SCHEMA_VERSION:
      return envelope;
    default:
      throw new Error(`Unsupported native schema version: ${envelope.schemaVersion}`);
  }
}
