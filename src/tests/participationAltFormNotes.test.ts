import { createBlankAltFormNoteEntry, readAltFormNoteFields, updateAltFormNoteEntry } from '../features/participation/altFormNotes';

describe('participation alt-form notes', () => {
  it('creates a blank structured alt-form note entry', () => {
    expect(createBlankAltFormNoteEntry()).toEqual({
      name: '',
      source: '',
      notes: '',
    });
  });

  it('reads useful fields from imported alt-form-like records', () => {
    expect(
      readAltFormNoteFields({
        name: 'Dire Wolf Form',
        species: 'Wolf',
        physicalDescription: 'Large grey wolf.',
        capabilities: 'Enhanced scent tracking.',
      }),
    ).toEqual({
      name: 'Dire Wolf Form',
      source: 'Wolf',
      notes: 'Large grey wolf.\nEnhanced scent tracking.',
    });
  });

  it('preserves extra fields when updating a structured alt-form note', () => {
    expect(
      updateAltFormNoteEntry(
        {
          name: 'Crow Form',
          source: 'Druid perk',
          notes: 'Small and fast.',
          importedTag: 'keep-me',
        },
        {
          notes: 'Small, fast, and ideal for scouting.',
        },
      ),
    ).toEqual({
      name: 'Crow Form',
      source: 'Druid perk',
      notes: 'Small, fast, and ideal for scouting.',
      importedTag: 'keep-me',
    });
  });

  it('preserves primitive legacy values when converting them into editable notes', () => {
    expect(
      updateAltFormNoteEntry('Dragon Form', {
        source: 'Legacy import',
      }),
    ).toEqual({
      preservedRawValue: 'Dragon Form',
      source: 'Legacy import',
    });
  });
});
