export interface ParticipationAltFormNoteFields {
  name: string;
  source: string;
  notes: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function readString(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function firstNonEmptyString(...values: unknown[]) {
  for (const value of values) {
    const text = readString(value).trim();

    if (text.length > 0) {
      return text;
    }
  }

  return '';
}

function joinNonEmptyLines(...values: unknown[]) {
  return values
    .map((value) => readString(value).trim())
    .filter((value) => value.length > 0)
    .join('\n');
}

function createEditableAltFormRecord(value: unknown) {
  const record = asRecord(value);

  if (record) {
    return { ...record };
  }

  return value === undefined ? {} : { preservedRawValue: value };
}

export function createBlankAltFormNoteEntry() {
  return {
    name: '',
    source: '',
    notes: '',
  } as Record<string, unknown>;
}

export function readAltFormNoteFields(value: unknown): ParticipationAltFormNoteFields {
  const record = asRecord(value);

  if (!record) {
    const fallback = readString(value).trim();

    return {
      name: fallback,
      source: '',
      notes: '',
    };
  }

  const descriptionNotes = joinNonEmptyLines(record.physicalDescription, record.capabilities);

  return {
    name: firstNonEmptyString(record.name, record.title, record.formName, record.label),
    source: firstNonEmptyString(record.source, record.origin, record.species),
    notes: firstNonEmptyString(record.notes, record.summary, record.description, descriptionNotes),
  };
}

export function updateAltFormNoteEntry(
  value: unknown,
  patch: Partial<ParticipationAltFormNoteFields>,
) {
  return {
    ...createEditableAltFormRecord(value),
    ...patch,
  } as Record<string, unknown>;
}
