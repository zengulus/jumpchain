import { useState } from 'react';
import { noteTypes, scopeTypes, type OwnerEntityType, type ScopeType } from '../../domain/common';
import type { Note } from '../../domain/notes/types';
import { db } from '../../db/database';
import { createBlankNote, deleteChainRecord, saveChainRecord } from '../workspace/records';
import { EmptyWorkspaceCard, StatusNoticeBanner, type StatusNotice, WorkspaceModuleHeader } from '../workspace/shared';
import { useChainWorkspace } from '../workspace/useChainWorkspace';

type NoteFilter = 'all' | Note['noteType'];

function getOwnerOptions(workspace: ReturnType<typeof useChainWorkspace>['workspace']) {
  return {
    chain: [{ value: workspace.chain.id, label: workspace.chain.title }],
    jump: workspace.jumps.map((jump) => ({ value: jump.id, label: jump.title })),
    jumper: workspace.jumpers.map((jumper) => ({ value: jumper.id, label: jumper.name })),
    participation: workspace.participations.map((participation) => ({
      value: participation.id,
      label: `${workspace.jumpers.find((jumper) => jumper.id === participation.jumperId)?.name ?? 'Jumper'} @ ${
        workspace.jumps.find((jump) => jump.id === participation.jumpId)?.title ?? 'Jump'
      }`,
    })),
    snapshot: workspace.snapshots.map((snapshot) => ({ value: snapshot.id, label: snapshot.title })),
  } as const;
}

export function NotesPage() {
  const { chainId, workspace } = useChainWorkspace();
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [noteFilter, setNoteFilter] = useState<NoteFilter>('all');
  const [notice, setNotice] = useState<StatusNotice | null>(null);
  const filteredNotes = workspace.notes.filter((note) => noteFilter === 'all' || note.noteType === noteFilter);
  const selectedNote = workspace.notes.find((note) => note.id === selectedNoteId) ?? filteredNotes[0] ?? workspace.notes[0] ?? null;
  const ownerOptions = getOwnerOptions(workspace);
  const selectedOwnerOptions =
    selectedNote && selectedNote.ownerEntityType in ownerOptions
      ? ownerOptions[selectedNote.ownerEntityType as keyof typeof ownerOptions]
      : [];

  async function handleCreateNote() {
    if (!workspace.activeBranch) {
      return;
    }

    const note = createBlankNote(chainId, workspace.activeBranch.id, workspace.chain.id);

    try {
      await saveChainRecord(db.notes, note);
      setSelectedNoteId(note.id);
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

  async function saveSelectedNote(nextValue: Note | null) {
    if (!nextValue) {
      return;
    }

    try {
      await saveChainRecord(db.notes, nextValue);
      setNotice({
        tone: 'success',
        message: 'Note changes autosaved.',
      });
    } catch (error) {
      setNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Unable to save note.',
      });
    }
  }

  async function handleDeleteNote() {
    if (!selectedNote) {
      return;
    }

    try {
      await deleteChainRecord(db.notes, selectedNote.id, chainId);
      setSelectedNoteId(null);
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
        description="Chain, jump, jumper, participation, and snapshot notes from one place, with live filters and autosave."
        badge={`${workspace.notes.length} total`}
        actions={
          <button className="button" type="button" onClick={() => void handleCreateNote()}>
            Add Note
          </button>
        }
      />

      <StatusNoticeBanner notice={notice} />

      {workspace.notes.length === 0 ? (
        <EmptyWorkspaceCard
          title="No notes yet"
          body="Create the first chain note or attach notes directly to jumps, jumpers, participations, and snapshots."
          action={
            <button className="button" type="button" onClick={() => void handleCreateNote()}>
              Create First Note
            </button>
          }
        />
      ) : (
        <section className="workspace-two-column">
          <aside className="card stack">
            <div className="section-heading">
              <h3>Filters</h3>
              <span className="pill">{filteredNotes.length} shown</span>
            </div>
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

            <div className="selection-list">
              {filteredNotes.map((note) => (
                <button
                  key={note.id}
                  className={`selection-list__item${selectedNote?.id === note.id ? ' is-active' : ''}`}
                  type="button"
                  onClick={() => setSelectedNoteId(note.id)}
                >
                  <strong>{note.title}</strong>
                  <span>{note.noteType}</span>
                </button>
              ))}
            </div>
          </aside>

          <article className="card stack">
            {selectedNote ? (
              <>
                <div className="section-heading">
                  <h3>{selectedNote.title}</h3>
                  <button className="button button--secondary" type="button" onClick={() => void handleDeleteNote()}>
                    Delete
                  </button>
                </div>

                <div className="field-grid field-grid--two">
                  <label className="field">
                    <span>Title</span>
                    <input
                      value={selectedNote.title}
                      onChange={(event) =>
                        void saveSelectedNote({
                          ...selectedNote,
                          title: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Note type</span>
                    <select
                      value={selectedNote.noteType}
                      onChange={(event) =>
                        void saveSelectedNote({
                          ...selectedNote,
                          noteType: event.target.value as Note['noteType'],
                        })
                      }
                    >
                      {noteTypes.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Scope</span>
                    <select
                      value={selectedNote.scopeType}
                      onChange={(event) =>
                        void saveSelectedNote({
                          ...selectedNote,
                          scopeType: event.target.value as ScopeType,
                        })
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
                      value={selectedNote.ownerEntityType}
                      onChange={(event) => {
                        const ownerEntityType = event.target.value as OwnerEntityType;
                        const nextOwnerOptions =
                          ownerEntityType in ownerOptions
                            ? ownerOptions[ownerEntityType as keyof typeof ownerOptions]
                            : [{ value: selectedNote.ownerEntityId, label: selectedNote.ownerEntityId }];

                        void saveSelectedNote({
                          ...selectedNote,
                          ownerEntityType,
                          ownerEntityId: nextOwnerOptions[0]?.value ?? selectedNote.ownerEntityId,
                        });
                      }}
                    >
                      <option value="chain">chain</option>
                      <option value="jump">jump</option>
                      <option value="jumper">jumper</option>
                      <option value="participation">participation</option>
                      <option value="snapshot">snapshot</option>
                    </select>
                  </label>
                </div>

                <label className="field">
                  <span>Owner target</span>
                  {selectedOwnerOptions.length > 0 ? (
                    <select
                      value={selectedNote.ownerEntityId}
                      onChange={(event) =>
                        void saveSelectedNote({
                          ...selectedNote,
                          ownerEntityId: event.target.value,
                        })
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
                      value={selectedNote.ownerEntityId}
                      onChange={(event) =>
                        void saveSelectedNote({
                          ...selectedNote,
                          ownerEntityId: event.target.value,
                        })
                      }
                    />
                  )}
                </label>

                <label className="field">
                  <span>Content</span>
                  <textarea
                    rows={10}
                    value={selectedNote.content}
                    onChange={(event) =>
                      void saveSelectedNote({
                        ...selectedNote,
                        content: event.target.value,
                      })
                    }
                  />
                </label>

                <label className="field">
                  <span>Tags</span>
                  <input
                    value={selectedNote.tags.join(', ')}
                    onChange={(event) =>
                      void saveSelectedNote({
                        ...selectedNote,
                        tags: event.target.value
                          .split(',')
                          .map((entry) => entry.trim())
                          .filter(Boolean),
                      })
                    }
                    placeholder="journal, rules, branching"
                  />
                </label>
              </>
            ) : null}
          </article>
        </section>
      )}
    </div>
  );
}
