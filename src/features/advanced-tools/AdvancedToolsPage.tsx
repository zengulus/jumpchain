import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useUiPreferences } from '../../app/UiPreferencesContext';
import { db } from '../../db/database';
import { collectWorkspaceTags, formatTagList, normalizeTagKey, normalizeTagList } from '../../utils/tags';
import { saveChainRecord, saveParticipationRecord } from '../workspace/records';
import { StatusNoticeBanner, TagEditorField, WorkspaceModuleHeader, type StatusNotice } from '../workspace/shared';
import { useChainWorkspace } from '../workspace/useChainWorkspace';
import {
  applyTagsToNoteAuditEntry,
  applyTagsToSelectionAuditEntry,
  buildTagAuditEntries,
  filterUntaggedEntries,
  type TagAuditEntry,
} from './tagAudit';

export function AdvancedToolsPage() {
  const { simpleMode } = useUiPreferences();
  const { chainId, workspace } = useChainWorkspace();
  const [targetTags, setTargetTags] = useState<string[]>([]);
  const [tagDrafts, setTagDrafts] = useState<Record<string, string[]>>({});
  const [savingEntryIds, setSavingEntryIds] = useState<string[]>([]);
  const [notice, setNotice] = useState<StatusNotice | null>(null);
  const tagSuggestions = useMemo(
    () =>
      collectWorkspaceTags({
        notes: workspace.notes,
        participations: workspace.participations,
      }),
    [workspace.notes, workspace.participations],
  );
  const auditEntries = useMemo(
    () =>
      buildTagAuditEntries({
        chainId,
        workspace,
      }),
    [chainId, workspace],
  );
  const matchingEntries = useMemo(
    () => filterUntaggedEntries(auditEntries, targetTags),
    [auditEntries, targetTags],
  );
  const noteCount = matchingEntries.filter((entry) => entry.kind === 'note').length;
  const selectionCount = matchingEntries.filter((entry) => entry.kind === 'selection').length;

  function getDraftTags(entry: TagAuditEntry) {
    return tagDrafts[entry.id] ?? entry.tags;
  }

  function tagsMatch(left: string[], right: string[]) {
    const normalizedLeft = normalizeTagList(left);
    const normalizedRight = normalizeTagList(right);

    return (
      normalizedLeft.length === normalizedRight.length &&
      normalizedLeft.every((tag, index) => normalizeTagKey(tag) === normalizeTagKey(normalizedRight[index]))
    );
  }

  function updateDraft(entryId: string, nextTags: string[]) {
    setTagDrafts((currentDrafts) => ({
      ...currentDrafts,
      [entryId]: normalizeTagList(nextTags),
    }));
  }

  function clearDraft(entryId: string) {
    setTagDrafts((currentDrafts) => {
      if (!(entryId in currentDrafts)) {
        return currentDrafts;
      }

      const nextDrafts = { ...currentDrafts };
      delete nextDrafts[entryId];
      return nextDrafts;
    });
  }

  async function saveEntryTags(entry: TagAuditEntry, nextTags = getDraftTags(entry)) {
    setSavingEntryIds((currentIds) => [...currentIds, entry.id]);

    try {
      if (entry.kind === 'note') {
        const note = workspace.notes.find((candidate) => candidate.id === entry.noteId);

        if (!note) {
          throw new Error('Unable to find that note in the active branch anymore.');
        }

        await saveChainRecord(db.notes, applyTagsToNoteAuditEntry(note, nextTags));
      } else {
        const participation = workspace.participations.find((candidate) => candidate.id === entry.participationId);

        if (!participation) {
          throw new Error('Unable to find that participation in the active branch anymore.');
        }

        await saveParticipationRecord(applyTagsToSelectionAuditEntry(participation, entry, nextTags));
      }

      clearDraft(entry.id);
      setNotice({
        tone: 'success',
        message: `Updated tags for "${entry.title}".`,
      });
    } catch (error) {
      setNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : `Unable to save tags for "${entry.title}".`,
      });
    } finally {
      setSavingEntryIds((currentIds) => currentIds.filter((candidateId) => candidateId !== entry.id));
    }
  }

  async function applyTargetTags(entry: TagAuditEntry) {
    const nextTags = normalizeTagList([...getDraftTags(entry), ...targetTags]);
    await saveEntryTags(entry, nextTags);
  }

  return (
    <div className="stack">
      <WorkspaceModuleHeader
        title="Advanced Tools"
        description={
          simpleMode
            ? 'Power-user utilities live here so the main workflow stays calmer. Find Untagged helps you catch notes and purchases that still need your tag pass.'
            : 'Power-user auditing and maintenance utilities for the active branch. Find Untagged inspects notes plus participation selections and links back to the right editor.'
        }
        badge={`${auditEntries.length} records audited`}
      />

      <StatusNoticeBanner notice={notice} />

      <section className="card stack">
        <div className="section-heading">
          <div className="stack stack--compact">
            <h3>Find Untagged</h3>
            <p className="workspace-sidebar-copy">
              Leave the tag list empty to find records with no tags at all. Add one or more tags to find records that do not use any of them yet.
            </p>
          </div>
          <div className="inline-meta">
            <span className="pill pill--soft">{matchingEntries.length} matches</span>
            <span className="pill pill--soft">{selectionCount} selections</span>
            <span className="pill pill--soft">{noteCount} notes</span>
          </div>
        </div>

        <TagEditorField
          label="Target tags"
          tags={targetTags}
          suggestions={tagSuggestions}
          placeholder="knowledge, social, archive"
          emptyMessage="No target tags selected. This will only show completely untagged records."
          hint="Press Enter or comma to add more than one tag."
          addLabel="Add Filter Tag"
          onChange={setTargetTags}
        />

        <p className="field-hint">
          {targetTags.length === 0
            ? 'Showing records that have no tags yet.'
            : `Showing records that are missing all of these tags: ${formatTagList(targetTags)}.`}
        </p>
      </section>

      {matchingEntries.length === 0 ? (
        <section className="card stack">
          <h3>Nothing missing</h3>
          <p>
            {targetTags.length === 0
              ? 'Every audited note and selection already has at least one tag.'
              : 'Every audited note and selection already uses at least one of the target tags.'}
          </p>
        </section>
      ) : (
        <section className="search-page__results">
          {matchingEntries.map((entry) => (
            <article className="search-page__result" key={entry.id}>
              <Link className="search-page__result-link" to={entry.to}>
                <div className="search-page__result-topline">
                  <div className="stack stack--compact">
                    <strong>{entry.title}</strong>
                    <span className="search-page__result-subtitle">{entry.subtitle}</span>
                  </div>
                  <span className="pill pill--soft">{entry.kindLabel}</span>
                </div>
                <p className="search-page__result-subtitle">
                  {entry.tags.length > 0 ? `Current tags: ${entry.tags.join(', ')}` : 'No tags yet.'}
                </p>
              </Link>

              <TagEditorField
                label="Edit tags here"
                tags={getDraftTags(entry)}
                suggestions={normalizeTagList([...tagSuggestions, ...targetTags, ...entry.tags])}
                placeholder="knowledge, social, archive"
                emptyMessage="This record is still untagged."
                addLabel="Add Tag"
                onChange={(nextTags) => updateDraft(entry.id, nextTags)}
              />

              <div className="actions">
                {targetTags.length > 0 ? (
                  <button
                    className="button button--secondary"
                    type="button"
                    onClick={() => void applyTargetTags(entry)}
                    disabled={savingEntryIds.includes(entry.id)}
                  >
                    {savingEntryIds.includes(entry.id) ? 'Saving...' : 'Apply Target Tags'}
                  </button>
                ) : null}
                <button
                  className="button"
                  type="button"
                  onClick={() => void saveEntryTags(entry)}
                  disabled={savingEntryIds.includes(entry.id) || tagsMatch(getDraftTags(entry), entry.tags)}
                >
                  {savingEntryIds.includes(entry.id) ? 'Saving...' : 'Save Tags'}
                </button>
                {!tagsMatch(getDraftTags(entry), entry.tags) ? (
                  <button
                    className="button button--secondary"
                    type="button"
                    onClick={() => clearDraft(entry.id)}
                    disabled={savingEntryIds.includes(entry.id)}
                  >
                    Reset
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
