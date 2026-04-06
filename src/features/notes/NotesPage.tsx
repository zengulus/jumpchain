import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useUiPreferences } from '../../app/UiPreferencesContext';
import { noteTypes, scopeTypes, type OwnerEntityType, type ScopeType } from '../../domain/common';
import type { Note } from '../../domain/notes/types';
import { db } from '../../db/database';
import { collectWorkspaceTags } from '../../utils/tags';
import { SearchHighlight } from '../search/SearchHighlight';
import { matchesSearchQuery } from '../search/searchUtils';
import { createBlankNote, deleteChainRecord, saveChainRecord } from '../workspace/records';
import {
  AutosaveStatusIndicator,
  EmptyWorkspaceCard,
  PlainLanguageHint,
  ReadinessPill,
  StatusNoticeBanner,
  TagEditorField,
  type StatusNotice,
  WorkspaceModuleHeader,
} from '../workspace/shared';
import { useAutosaveRecord } from '../workspace/useAutosaveRecord';
import { useChainWorkspace } from '../workspace/useChainWorkspace';

type NoteFilter = 'all' | Note['noteType'];

function getOwnerOptions(workspace: ReturnType<typeof useChainWorkspace>['workspace']) {
  const jumpNameById = new Map(workspace.jumps.map((jump) => [jump.id, jump.title]));
  const participantNameById = new Map([
    ...workspace.jumpers.map((jumper) => [jumper.id, jumper.name] as const),
    ...workspace.companions.map((companion) => [companion.id, companion.name] as const),
  ]);

  return {
    chain: [{ value: workspace.chain.id, label: workspace.chain.title }],
    jump: workspace.jumps.map((jump) => ({ value: jump.id, label: jump.title })),
    jumper: workspace.jumpers.map((jumper) => ({ value: jumper.id, label: jumper.name })),
    companion: workspace.companions.map((companion) => ({ value: companion.id, label: companion.name })),
    participation: workspace.participations.map((participation) => ({
      value: participation.id,
      label: `${participantNameById.get(participation.participantId) ?? 'Participant'} @ ${jumpNameById.get(participation.jumpId) ?? 'Jump'}`,
    })),
    snapshot: workspace.snapshots.map((snapshot) => ({ value: snapshot.id, label: snapshot.title })),
  } as const;
}

function getDefaultScopedNoteFields(ownerEntityType: OwnerEntityType | null, ownerEntityId: string | null, chainId: string) {
  if (!ownerEntityType || !ownerEntityId) {
    return {
      ownerEntityType: 'chain' as const,
      ownerEntityId: chainId,
      scopeType: 'chain' as const,
      noteType: 'chain' as const,
    };
  }

  switch (ownerEntityType) {
    case 'jump':
      return {
        ownerEntityType,
        ownerEntityId,
        scopeType: 'jump' as const,
        noteType: 'jump' as const,
      };
    case 'jumper':
      return {
        ownerEntityType,
        ownerEntityId,
        scopeType: 'jumper' as const,
        noteType: 'jumper' as const,
      };
    case 'companion':
      return {
        ownerEntityType,
        ownerEntityId,
        scopeType: 'companion' as const,
        noteType: 'companion' as const,
      };
    case 'participation':
      return {
        ownerEntityType,
        ownerEntityId,
        scopeType: 'participation' as const,
        noteType: 'participation' as const,
      };
    case 'snapshot':
      return {
        ownerEntityType,
        ownerEntityId,
        scopeType: 'snapshot' as const,
        noteType: 'snapshot' as const,
      };
    case 'chain':
    default:
      return {
        ownerEntityType: 'chain' as const,
        ownerEntityId,
        scopeType: 'chain' as const,
        noteType: 'chain' as const,
      };
  }
}

export function NotesPage() {
  const { simpleMode } = useUiPreferences();
  const { chainId, workspace } = useChainWorkspace();
  const [searchParams, setSearchParams] = useSearchParams();
  const [noteFilter, setNoteFilter] = useState<NoteFilter>('all');
  const [notice, setNotice] = useState<StatusNotice | null>(null);
  const selectedNoteId = searchParams.get('note');
  const searchQuery = searchParams.get('search') ?? '';
  const focusedOwnerType = searchParams.get('ownerType') as OwnerEntityType | null;
  const focusedOwnerId = searchParams.get('ownerId');
  const focusedNotes = workspace.notes.filter((note) => {
    if (focusedOwnerType && note.ownerEntityType !== focusedOwnerType) {
      return false;
    }

    if (focusedOwnerId && note.ownerEntityId !== focusedOwnerId) {
      return false;
    }

    return true;
  });
  const filteredNotes = focusedNotes.filter(
    (note) =>
      (noteFilter === 'all' || note.noteType === noteFilter) &&
      matchesSearchQuery(searchQuery, note.title, note.content, note.tags, note.noteType),
  );
  const selectedNote = filteredNotes.find((note) => note.id === selectedNoteId) ?? filteredNotes[0] ?? null;
  const ownerOptions = getOwnerOptions(workspace);
  const noteAutosave = useAutosaveRecord(selectedNote, {
    onSave: async (nextValue) => {
      await saveChainRecord(db.notes, nextValue);
    },
    getErrorMessage: (error) => (error instanceof Error ? error.message : 'Unable to save note changes.'),
  });
  const draftNote = noteAutosave.draft ?? selectedNote;
  const selectedOwnerOptions =
    draftNote && draftNote.ownerEntityType in ownerOptions
      ? ownerOptions[draftNote.ownerEntityType as keyof typeof ownerOptions]
      : [];
  const tagSuggestions = collectWorkspaceTags({
    notes: draftNote
      ? [...workspace.notes.filter((note) => note.id !== draftNote.id), draftNote]
      : workspace.notes,
    participations: workspace.participations,
  });
  const hasNoteSearch = searchQuery.trim().length > 0;
  const showNoteSearch = focusedNotes.length > 1 || hasNoteSearch;
  const showNoteTypeFilter = focusedNotes.length > 1 || noteFilter !== 'all';
  const showNoteFilterCount = hasNoteSearch || noteFilter !== 'all';
  const showNoteSelectionRail = filteredNotes.length > 1 || hasNoteSearch || noteFilter !== 'all';

  async function handleCreateNote() {
    if (!workspace.activeBranch) {
      return;
    }

    const note = {
      ...createBlankNote(chainId, workspace.activeBranch.id, workspace.chain.id),
      ...getDefaultScopedNoteFields(focusedOwnerType, focusedOwnerId, workspace.chain.id),
    };

    try {
      await saveChainRecord(db.notes, note);
      setSearchParams((currentParams) => {
        const nextParams = new URLSearchParams(currentParams);
        nextParams.set('note', note.id);
        return nextParams;
      });
      setNotice({
        tone: 'success',
        message: 'Created a new note.',
      });
    } catch (error) {
      setNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Unable to create note.',
      });
    }
  }

  async function handleDeleteNote() {
    if (!selectedNote) {
      return;
    }

    try {
      await deleteChainRecord(db.notes, selectedNote.id, chainId);
      setSearchParams((currentParams) => {
        const nextParams = new URLSearchParams(currentParams);
        nextParams.delete('note');
        return nextParams;
      });
      setNotice({
        tone: 'success',
        message: 'Note deleted.',
      });
    } catch (error) {
      setNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Unable to delete note.',
      });
    }
  }

  if (!workspace.activeBranch) {
    return <EmptyWorkspaceCard title="No active branch" body="Create or restore a branch before editing notes." />;
  }

  return (
    <div className="stack">
      <WorkspaceModuleHeader
        title="Notes"
        description={
          simpleMode
            ? 'Capture reminders, rulings, and freeform context tied to the chain.'
            : 'Chain, jump, jumper, companion, participation, and snapshot notes from one place, with live filters and autosave.'
        }
        badge={`${workspace.notes.length} total`}
        actions={
          <>
            <button className="button" type="button" onClick={() => void handleCreateNote()}>
              Add Note
            </button>
            {focusedOwnerType && focusedOwnerId ? (
              <button
                className="button button--secondary"
                type="button"
                onClick={() =>
                  setSearchParams((currentParams) => {
                    const nextParams = new URLSearchParams(currentParams);
                    nextParams.delete('ownerType');
                    nextParams.delete('ownerId');
                    return nextParams;
                  })
                }
              >
                Clear Owner Focus
              </button>
            ) : null}
          </>
        }
      />

      <StatusNoticeBanner notice={notice} />
      <AutosaveStatusIndicator status={noteAutosave.status} />

      {simpleMode ? (
        <section className="section-surface stack stack--compact">
          <div className="section-heading">
            <h3>When to use this page</h3>
            <ReadinessPill tone="optional" />
          </div>
          <PlainLanguageHint term="Note" meaning="a saved reminder, ruling, or journal entry attached to part of the chain." />
          <p>Open Notes when you want a saved reminder, ruling, or journal entry tied to the chain or a specific record.</p>
        </section>
      ) : null}

      {workspace.notes.length === 0 ? (
        <EmptyWorkspaceCard
          title="No notes yet"
          body={
            simpleMode
              ? 'Add a note when you want to save a reminder, ruling, or journal entry for this chain.'
              : 'Create the first chain note or attach notes directly to jumps, jumpers, participations, and snapshots.'
          }
          action={
            <button className="button" type="button" onClick={() => void handleCreateNote()}>
              Create First Note
            </button>
          }
        />
      ) : (
        <section className={showNoteSelectionRail ? 'workspace-two-column' : 'stack'}>
          {showNoteSelectionRail ? (
            <aside className="card stack">
              <div className="section-heading">
                <h3>{showNoteSearch || showNoteTypeFilter ? 'Filters' : 'Notes'}</h3>
                {showNoteFilterCount ? <span className="pill">{filteredNotes.length} shown</span> : null}
              </div>
              {showNoteSearch ? (
                <label className="field">
                  <span>Search notes</span>
                  <input
                    value={searchQuery}
                    placeholder="title, content, tags..."
                    onChange={(event) =>
                      setSearchParams((currentParams) => {
                        const nextParams = new URLSearchParams(currentParams);

                        if (event.target.value.trim()) {
                          nextParams.set('search', event.target.value);
                        } else {
                          nextParams.delete('search');
                        }

                        return nextParams;
                      })
                    }
                  />
                </label>
              ) : null}
              {showNoteTypeFilter ? (
                <label className="field">
                  <span>Note type</span>
                  <select value={noteFilter} onChange={(event) => setNoteFilter(event.target.value as NoteFilter)}>
                    <option value="all">all</option>
                    {noteTypes.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              <div className="selection-list">
                {filteredNotes.map((note) => (
                  <button
                    key={note.id}
                    className={`selection-list__item${selectedNote?.id === note.id ? ' is-active' : ''}`}
                    type="button"
                    onClick={() =>
                      setSearchParams((currentParams) => {
                        const nextParams = new URLSearchParams(currentParams);
                        nextParams.set('note', note.id);
                        return nextParams;
                      })
                    }
                  >
                    <strong>
                      <SearchHighlight text={note.title} query={searchQuery} />
                    </strong>
                    <span>
                      <SearchHighlight text={note.noteType} query={searchQuery} />
                    </span>
                  </button>
                ))}
              </div>
            </aside>
          ) : null}

          <article className="card stack">
            {selectedNote ? (
              <>
                <div className="section-heading">
                  <h3>
                    <SearchHighlight text={selectedNote.title} query={searchQuery} />
                  </h3>
                  <button className="button button--secondary" type="button" onClick={() => void handleDeleteNote()}>
                    Delete
                  </button>
                </div>

                <section className="stack stack--compact">
                  <h4>Core</h4>
                  <div className="field-grid field-grid--two">
                    <label className="field">
                      <span>Title</span>
                      <input
                        value={draftNote?.title ?? ''}
                        onChange={(event) =>
                          noteAutosave.updateDraft({
                            ...(draftNote ?? selectedNote),
                            title: event.target.value,
                          } as Note)
                        }
                      />
                    </label>
                    <label className="field">
                      <span>Note type</span>
                      <select
                        value={draftNote?.noteType ?? 'chain'}
                        onChange={(event) =>
                          noteAutosave.updateDraft({
                            ...(draftNote ?? selectedNote),
                            noteType: event.target.value as Note['noteType'],
                          } as Note)
                        }
                      >
                        {noteTypes.map((type) => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <label className="field">
                    <span>Content</span>
                    <textarea
                      rows={10}
                      value={draftNote?.content ?? ''}
                      onChange={(event) =>
                        noteAutosave.updateDraft({
                          ...(draftNote ?? selectedNote),
                          content: event.target.value,
                        } as Note)
                      }
                    />
                  </label>
                </section>

                {simpleMode ? (
                  <details className="details-panel">
                    <summary className="details-panel__summary">
                      <span>Attachment and tags</span>
                      <span className="pill">Optional</span>
                    </summary>
                    <div className="details-panel__body stack stack--compact">
                      <div className="field-grid field-grid--two">
                        <label className="field">
                          <span>Scope</span>
                          <select
                            value={draftNote?.scopeType ?? 'chain'}
                            onChange={(event) =>
                              noteAutosave.updateDraft({
                                ...(draftNote ?? selectedNote),
                                scopeType: event.target.value as ScopeType,
                              } as Note)
                            }
                          >
                            {scopeTypes.map((scope) => (
                              <option key={scope} value={scope}>
                                {scope}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="field">
                          <span>Owner type</span>
                          <select
                            value={draftNote?.ownerEntityType ?? 'chain'}
                            onChange={(event) => {
                              const ownerEntityType = event.target.value as OwnerEntityType;
                              const nextOwnerOptions =
                                ownerEntityType in ownerOptions
                                  ? ownerOptions[ownerEntityType as keyof typeof ownerOptions]
                                  : [{ value: draftNote?.ownerEntityId ?? workspace.chain.id, label: draftNote?.ownerEntityId ?? workspace.chain.id }];

                              noteAutosave.updateDraft({
                                ...(draftNote ?? selectedNote),
                                ownerEntityType,
                                ownerEntityId: nextOwnerOptions[0]?.value ?? draftNote?.ownerEntityId ?? workspace.chain.id,
                              } as Note);
                            }}
                          >
                            <option value="chain">chain</option>
                            <option value="jump">jump</option>
                            <option value="jumper">jumper</option>
                            <option value="companion">companion</option>
                            <option value="participation">participation</option>
                            <option value="snapshot">snapshot</option>
                          </select>
                        </label>
                      </div>

                      <label className="field">
                        <span>Owner target</span>
                        {selectedOwnerOptions.length > 0 ? (
                          <select
                            value={draftNote?.ownerEntityId ?? ''}
                            onChange={(event) =>
                              noteAutosave.updateDraft({
                                ...(draftNote ?? selectedNote),
                                ownerEntityId: event.target.value,
                              } as Note)
                            }
                          >
                            {selectedOwnerOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            value={draftNote?.ownerEntityId ?? ''}
                            onChange={(event) =>
                              noteAutosave.updateDraft({
                                ...(draftNote ?? selectedNote),
                                ownerEntityId: event.target.value,
                              } as Note)
                            }
                          />
                        )}
                      </label>

                      <TagEditorField
                        label="Tags"
                        tags={draftNote?.tags ?? []}
                        suggestions={tagSuggestions}
                        placeholder="journal, rules, branching"
                        onChange={(nextTags) =>
                          noteAutosave.updateDraft({
                            ...(draftNote ?? selectedNote),
                            tags: nextTags,
                          } as Note)
                        }
                      />
                    </div>
                  </details>
                ) : (
                  <>
                    <div className="field-grid field-grid--two">
                      <label className="field">
                        <span>Scope</span>
                        <select
                          value={draftNote?.scopeType ?? 'chain'}
                          onChange={(event) =>
                            noteAutosave.updateDraft({
                              ...(draftNote ?? selectedNote),
                              scopeType: event.target.value as ScopeType,
                            } as Note)
                          }
                        >
                          {scopeTypes.map((scope) => (
                            <option key={scope} value={scope}>
                              {scope}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        <span>Owner type</span>
                        <select
                          value={draftNote?.ownerEntityType ?? 'chain'}
                          onChange={(event) => {
                            const ownerEntityType = event.target.value as OwnerEntityType;
                            const nextOwnerOptions =
                              ownerEntityType in ownerOptions
                                ? ownerOptions[ownerEntityType as keyof typeof ownerOptions]
                                : [{ value: draftNote?.ownerEntityId ?? workspace.chain.id, label: draftNote?.ownerEntityId ?? workspace.chain.id }];

                            noteAutosave.updateDraft({
                              ...(draftNote ?? selectedNote),
                              ownerEntityType,
                              ownerEntityId: nextOwnerOptions[0]?.value ?? draftNote?.ownerEntityId ?? workspace.chain.id,
                            } as Note);
                          }}
                        >
                          <option value="chain">chain</option>
                          <option value="jump">jump</option>
                          <option value="jumper">jumper</option>
                          <option value="companion">companion</option>
                          <option value="participation">participation</option>
                          <option value="snapshot">snapshot</option>
                        </select>
                      </label>
                    </div>

                    <label className="field">
                      <span>Owner target</span>
                      {selectedOwnerOptions.length > 0 ? (
                        <select
                          value={draftNote?.ownerEntityId ?? ''}
                          onChange={(event) =>
                            noteAutosave.updateDraft({
                              ...(draftNote ?? selectedNote),
                              ownerEntityId: event.target.value,
                            } as Note)
                          }
                        >
                          {selectedOwnerOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          value={draftNote?.ownerEntityId ?? ''}
                          onChange={(event) =>
                            noteAutosave.updateDraft({
                              ...(draftNote ?? selectedNote),
                              ownerEntityId: event.target.value,
                            } as Note)
                          }
                        />
                      )}
                    </label>

                    <TagEditorField
                      label="Tags"
                      tags={draftNote?.tags ?? []}
                      suggestions={tagSuggestions}
                      placeholder="journal, rules, branching"
                      onChange={(nextTags) =>
                        noteAutosave.updateDraft({
                          ...(draftNote ?? selectedNote),
                          tags: nextTags,
                        } as Note)
                      }
                    />
                  </>
                )}
              </>
            ) : (
              <p>No notes match the current filters.</p>
            )}
          </article>
        </section>
      )}
    </div>
  );
}
