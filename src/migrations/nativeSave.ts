import type { NativeChainBundle, NativeSaveEnvelope } from '../domain/save';
import { CURRENT_SCHEMA_VERSION } from '../app/config';
import { NativeSaveEnvelopeHeaderSchema, validateNativeSaveEnvelope } from '../schemas';

function migrateV1Bundle(bundle: NativeChainBundle): NativeChainBundle {
  const companionIds = new Set(bundle.companions.map((companion) => companion.id));

  return {
    ...bundle,
    chain: {
      ...bundle.chain,
      schemaVersion: CURRENT_SCHEMA_VERSION,
    },
    jumps: bundle.jumps.map((jump) => ({
      ...jump,
      participantJumperIds: jump.participantJumperIds.filter((participantId) => !companionIds.has(participantId)),
    })),
    participations: bundle.participations.filter((participation) => !companionIds.has(participation.jumperId)),
    companionParticipations: bundle.participations
      .filter((participation) => companionIds.has(participation.jumperId))
      .map((participation) => {
        const { jumperId, ...rest } = participation;

        return {
          ...rest,
          companionId: jumperId,
        };
      }),
  };
}

export function migrateV1Envelope(raw: unknown): NativeSaveEnvelope {
  const envelope = validateNativeSaveEnvelope(raw);

  return validateNativeSaveEnvelope({
    ...envelope,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    chains: envelope.chains.map((bundle) => migrateV1Bundle(bundle)),
  });
}

export function migrateNativeSaveEnvelope(raw: unknown): NativeSaveEnvelope {
  const header = NativeSaveEnvelopeHeaderSchema.parse(raw);

  switch (header.schemaVersion) {
    case 1:
      return migrateV1Envelope(raw);
    case CURRENT_SCHEMA_VERSION:
      return validateNativeSaveEnvelope(raw);
    default:
      throw new Error(`Unsupported native schema version: ${header.schemaVersion}`);
  }
}
