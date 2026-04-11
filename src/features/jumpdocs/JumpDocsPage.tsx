import { useMemo, useState, type ChangeEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useUiPreferences } from '../../app/UiPreferencesContext';
import type { AttachmentRef } from '../../domain/attachments/types';
import type { JumpDoc } from '../../domain/jumpdoc/types';
import { db } from '../../db/database';
import { createId } from '../../utils/id';
import { SearchHighlight } from '../search/SearchHighlight';
import { matchesSearchQuery } from '../search/searchUtils';
import { createBlankJumpDoc, deleteChainRecord, saveChainRecord } from '../workspace/records';
import { AutosaveStatusIndicator, EmptyWorkspaceCard, JsonEditorField, StatusNoticeBanner, WorkspaceModuleHeader, type StatusNotice } from '../workspace/shared';
import { useAutosaveRecord } from '../workspace/useAutosaveRecord';
import { useChainWorkspace } from '../workspace/useChainWorkspace';
import { JumpDocPdfViewer } from './JumpDocPdfViewer';

function countTemplates(jumpDoc: JumpDoc) {
  return jumpDoc.origins.length + jumpDoc.purchases.length + jumpDoc.drawbacks.length + jumpDoc.scenarios.length + jumpDoc.companions.length;
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Unable to read PDF data.'));
      }
    });
    reader.addEventListener('error', () => reject(reader.error ?? new Error('Unable to read PDF data.')));
    reader.readAsDataURL(file);
  });
}

export function JumpDocsPage() {
  const { simpleMode } = useUiPreferences();
  const { chainId, workspace } = useChainWorkspace();
  const [searchParams, setSearchParams] = useSearchParams();
  const [notice, setNotice] = useState<StatusNotice | null>(null);
  const searchQuery = searchParams.get('search') ?? '';
  const selectedJumpDocId = searchParams.get('jumpdoc');
  const filteredJumpDocs = workspace.jumpDocs.filter((jumpDoc) =>
    matchesSearchQuery(searchQuery, jumpDoc.title, jumpDoc.author, jumpDoc.source, jumpDoc.notes, jumpDoc.importSourceMetadata),
  );
  const selectedJumpDoc =
    filteredJumpDocs.find((jumpDoc) => jumpDoc.id === selectedJumpDocId) ?? filteredJumpDocs[0] ?? null;
  const attachmentsById = useMemo(
    () => new Map(workspace.attachments.map((attachment) => [attachment.id, attachment])),
    [workspace.attachments],
  );
  const jumpDocAutosave = useAutosaveRecord(selectedJumpDoc, {
    onSave: async (nextValue) => {
      await saveChainRecord(db.jumpDocs, nextValue);
    },
    getErrorMessage: (error) => error instanceof Error ? error.message : 'Unable to save JumpDoc.',
  });
  const draftJumpDoc = jumpDocAutosave.draft ?? selectedJumpDoc;
  const selectedPdfAttachment = draftJumpDoc?.pdfAttachmentId ? attachmentsById.get(draftJumpDoc.pdfAttachmentId) : null;
  const pdfSource = selectedPdfAttachment?.dataUrl ?? draftJumpDoc?.pdfUrl ?? null;
  const pdfFileName = selectedPdfAttachment?.fileName ?? selectedPdfAttachment?.label ?? draftJumpDoc?.pdfUrl ?? undefined;

  async function handleCreateJumpDoc() {
    if (!workspace.activeBranch) {
      return;
    }

    const jumpDoc = createBlankJumpDoc(chainId, workspace.activeBranch.id);

    try {
      await saveChainRecord(db.jumpDocs, jumpDoc);
      setSearchParams((currentParams) => {
        const nextParams = new URLSearchParams(currentParams);
        nextParams.set('jumpdoc', jumpDoc.id);
        return nextParams;
      });
      setNotice({ tone: 'success', message: 'Created a local JumpDoc shell.' });
    } catch (error) {
      setNotice({ tone: 'error', message: error instanceof Error ? error.message : 'Unable to create JumpDoc.' });
    }
  }

  async function handleDeleteJumpDoc(jumpDoc: JumpDoc) {
    try {
      await deleteChainRecord(db.jumpDocs, jumpDoc.id, chainId);
      setSearchParams((currentParams) => {
        const nextParams = new URLSearchParams(currentParams);
        nextParams.delete('jumpdoc');
        return nextParams;
      });
      setNotice({ tone: 'success', message: 'Deleted the local JumpDoc.' });
    } catch (error) {
      setNotice({ tone: 'error', message: error instanceof Error ? error.message : 'Unable to delete JumpDoc.' });
    }
  }

  async function handlePdfFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file || !draftJumpDoc) {
      return;
    }

    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setNotice({ tone: 'error', message: 'Choose a PDF file.' });
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      const now = new Date().toISOString();
      const attachment: AttachmentRef = {
        id: createId('attachment'),
        chainId,
        branchId: draftJumpDoc.branchId,
        createdAt: now,
        updatedAt: now,
        scopeType: 'branch',
        ownerEntityType: 'branch',
        ownerEntityId: draftJumpDoc.branchId,
        label: file.name,
        kind: 'file',
        mimeType: file.type || 'application/pdf',
        fileName: file.name,
        dataUrl,
        storage: 'embedded',
      };

      await saveChainRecord(db.attachments, attachment);
      jumpDocAutosave.updateDraft({
        ...draftJumpDoc,
        pdfAttachmentId: attachment.id,
        pdfUrl: null,
      });
      setNotice({ tone: 'success', message: 'Attached the PDF locally.' });
    } catch (error) {
      setNotice({ tone: 'error', message: error instanceof Error ? error.message : 'Unable to attach PDF.' });
    }
  }

  function updateDraft(updater: (current: JumpDoc) => JumpDoc) {
    if (!draftJumpDoc) {
      return;
    }

    jumpDocAutosave.updateDraft(updater(draftJumpDoc));
  }

  if (!workspace.activeBranch) {
    return <EmptyWorkspaceCard title="No active branch" body="Create or recover a branch before editing JumpDocs." />;
  }

  return (
    <div className="stack">
      <WorkspaceModuleHeader
        title="Local JumpDocs"
        description={
          simpleMode
            ? 'Create a structured local jump document. PDF annotation comes after the template data is in place.'
            : 'Local-only JumpDoc metadata, currencies, origins, purchase templates, drawbacks, scenarios, and companions.'
        }
        badge={`${workspace.jumpDocs.length} docs`}
      />

      <StatusNoticeBanner notice={notice} />

      <section className="card stack">
        <div className="actions">
          <button className="button" type="button" onClick={() => void handleCreateJumpDoc()}>
            Add JumpDoc
          </button>
        </div>
        {workspace.jumpDocs.length > 1 || searchQuery ? (
          <label className="field">
            <span>Search JumpDocs</span>
            <input
              value={searchQuery}
              placeholder="title, author, source..."
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
      </section>

      {workspace.jumpDocs.length === 0 ? (
        <EmptyWorkspaceCard title="No JumpDocs yet" body="Create the first local JumpDoc shell, then fill in the structured sections." />
      ) : (
        <section className="grid grid--two">
          <aside className="card stack">
            <div className="section-heading">
              <h3>JumpDocs</h3>
              <span className="pill">{filteredJumpDocs.length}</span>
            </div>
            <div className="selection-list">
              {filteredJumpDocs.map((jumpDoc) => (
                <button
                  key={jumpDoc.id}
                  className={`selection-list__item${selectedJumpDoc?.id === jumpDoc.id ? ' is-active' : ''}`}
                  type="button"
                  onClick={() =>
                    setSearchParams((currentParams) => {
                      const nextParams = new URLSearchParams(currentParams);
                      nextParams.set('jumpdoc', jumpDoc.id);
                      return nextParams;
                    })
                  }
                >
                  <strong><SearchHighlight text={jumpDoc.title} query={searchQuery} /></strong>
                  <span>{countTemplates(jumpDoc)} templates</span>
                </button>
              ))}
            </div>
          </aside>

          {draftJumpDoc ? (
            <article className="card stack">
              <div className="section-heading">
                <h3>{draftJumpDoc.title}</h3>
                <AutosaveStatusIndicator status={jumpDocAutosave.status} />
              </div>

              <div className="field-grid field-grid--two">
                <label className="field">
                  <span>Title</span>
                  <input value={draftJumpDoc.title} onChange={(event) => updateDraft((current) => ({ ...current, title: event.target.value }))} />
                </label>
                <label className="field">
                  <span>Author</span>
                  <input value={draftJumpDoc.author} onChange={(event) => updateDraft((current) => ({ ...current, author: event.target.value }))} />
                </label>
              </div>

              <label className="field">
                <span>Source</span>
                <input value={draftJumpDoc.source} onChange={(event) => updateDraft((current) => ({ ...current, source: event.target.value }))} />
              </label>

              <label className="field">
                <span>PDF URL or local reference</span>
                <input value={draftJumpDoc.pdfUrl ?? ''} onChange={(event) => updateDraft((current) => ({ ...current, pdfUrl: event.target.value || null }))} />
              </label>

              <section className="stack stack--compact">
                <div className="actions">
                  <label className="button">
                    Attach local PDF
                    <input className="visually-hidden" type="file" accept="application/pdf,.pdf" onChange={(event) => void handlePdfFileChange(event)} />
                  </label>
                  {draftJumpDoc.pdfAttachmentId ? (
                    <button
                      className="button button--secondary"
                      type="button"
                      onClick={() => updateDraft((current) => ({ ...current, pdfAttachmentId: null }))}
                    >
                      Detach PDF
                    </button>
                  ) : null}
                </div>
                {selectedPdfAttachment ? <p className="muted">Using local file: {selectedPdfAttachment.fileName ?? selectedPdfAttachment.label}</p> : null}
              </section>

              <JumpDocPdfViewer
                source={pdfSource}
                fileName={pdfFileName}
                annotations={draftJumpDoc.pdfAnnotationBounds ?? []}
                onAnnotationsChange={(pdfAnnotationBounds) => updateDraft((current) => ({ ...current, pdfAnnotationBounds }))}
              />

              <label className="field">
                <span>Notes</span>
                <textarea rows={4} value={draftJumpDoc.notes} onChange={(event) => updateDraft((current) => ({ ...current, notes: event.target.value }))} />
              </label>

              <div className="summary-grid">
                <article className="metric"><strong>{Object.keys(draftJumpDoc.currencies).length}</strong><span>Currencies</span></article>
                <article className="metric"><strong>{draftJumpDoc.origins.length}</strong><span>Origins</span></article>
                <article className="metric"><strong>{draftJumpDoc.purchases.length}</strong><span>Purchases</span></article>
                <article className="metric"><strong>{draftJumpDoc.drawbacks.length}</strong><span>Drawbacks</span></article>
                <article className="metric"><strong>{draftJumpDoc.scenarios.length}</strong><span>Scenarios</span></article>
                <article className="metric"><strong>{draftJumpDoc.companions.length}</strong><span>Companions</span></article>
              </div>

              <details className="details-panel">
                <summary className="details-panel__summary">
                  <span>Structured template JSON</span>
                  <span className="pill">v1 editor</span>
                </summary>
                <div className="details-panel__body">
                  <JsonEditorField
                    label="JumpDoc structure"
                    value={draftJumpDoc}
                    onValidChange={(value) => {
                      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                        jumpDocAutosave.updateDraft(value as JumpDoc);
                      }
                    }}
                  />
                </div>
              </details>

              <div className="actions">
                <button className="button button--secondary" type="button" onClick={() => void handleDeleteJumpDoc(draftJumpDoc)}>
                  Delete JumpDoc
                </button>
              </div>
            </article>
          ) : null}
        </section>
      )}
    </div>
  );
}
