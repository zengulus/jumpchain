import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useUiPreferences } from '../../app/UiPreferencesContext';
import { collectWorkspaceTags, formatTagList } from '../../utils/tags';
import { TagEditorField, WorkspaceModuleHeader } from '../workspace/shared';
import { useChainWorkspace } from '../workspace/useChainWorkspace';
import { buildTagAuditEntries, filterUntaggedEntries } from './tagAudit';

export function AdvancedToolsPage() {
  const { simpleMode } = useUiPreferences();
  const { chainId, workspace } = useChainWorkspace();
  const [targetTags, setTargetTags] = useState<string[]>([]);
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
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
