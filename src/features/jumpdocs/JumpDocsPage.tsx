import { useMemo, useState, type ChangeEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useUiPreferences } from '../../app/UiPreferencesContext';
import type { AttachmentRef } from '../../domain/attachments/types';
import type { JumpDoc, JumpDocPdfAnnotation } from '../../domain/jumpdoc/types';
import type { ParticipationSelection } from '../../domain/jump/selection';
import type { WorkspaceParticipation } from '../../domain/jump/types';
import { db } from '../../db/database';
import { switchActiveJump } from '../../db/persistence';
import { createId } from '../../utils/id';
import { SearchHighlight } from '../search/SearchHighlight';
import { matchesSearchQuery, withSearchParams } from '../search/searchUtils';
import { createBlankJump, createBlankJumpDoc, createBlankParticipation, deleteChainRecord, saveChainRecord, saveParticipationRecord } from '../workspace/records';
import { AutosaveStatusIndicator, EmptyWorkspaceCard, JsonEditorField, StatusNoticeBanner, WorkspaceModuleHeader, type StatusNotice } from '../workspace/shared';
import { useAutosaveRecord } from '../workspace/useAutosaveRecord';
import { useChainWorkspace } from '../workspace/useChainWorkspace';
import { JumpDocPdfViewer } from './JumpDocPdfViewer';

function countTemplates(jumpDoc: JumpDoc) {
  return jumpDoc.origins.length + jumpDoc.purchases.length + jumpDoc.drawbacks.length + jumpDoc.scenarios.length + jumpDoc.companions.length;
}

function getAnnotationExportLabel(annotation: JumpDocPdfAnnotation) {
  if (annotation.exportKind === 'purchase') {
    return annotation.purchaseSection === 'item' ? 'Item' : annotation.purchaseSection === 'subsystem' ? 'Subsystem' : 'Perk';
  }

  return annotation.exportKind[0]?.toUpperCase() + annotation.exportKind.slice(1);
}

function createTemplateFromAnnotation(jumpDoc: JumpDoc, annotation: JumpDocPdfAnnotation) {
  const templateId = annotation.exportedTemplateId ?? createId(`jumpdoc_${annotation.exportKind}`);
  const bounds = [{
    page: annotation.page,
    x: annotation.x,
    y: annotation.y,
    width: annotation.width,
    height: annotation.height,
  }];
  const costs = annotation.costAmount === null
    ? []
    : [{ amount: annotation.costAmount, currencyKey: annotation.currencyKey || '0' }];
  const baseTemplate = {
    id: templateId,
    title: annotation.label || annotation.extractedText.slice(0, 54) || `Page ${annotation.page} selection`,
    description: annotation.extractedText,
    costs,
    bounds,
    alternativeCosts: [],
    prerequisites: [],
    tags: [],
    importSourceMetadata: {
      sourceAnnotationId: annotation.id,
      sourceJumpDocId: jumpDoc.id,
      sourcePage: annotation.page,
      notes: annotation.notes,
    },
  };

  return { templateId, baseTemplate };
}

function upsertById<T extends { id: string }>(records: T[], record: T) {
  return records.some((entry) => entry.id === record.id)
    ? records.map((entry) => entry.id === record.id ? record : entry)
    : [...records, record];
}

function upsertSelection(records: ParticipationSelection[], record: ParticipationSelection) {
  if (!record.id) {
    return [...records, record];
  }

  return records.some((entry) => entry.id === record.id)
    ? records.map((entry) => entry.id === record.id ? record : entry)
    : [...records, record];
}

function applyAnnotationTemplateExport(jumpDoc: JumpDoc, annotation: JumpDocPdfAnnotation) {
  const { templateId, baseTemplate } = createTemplateFromAnnotation(jumpDoc, annotation);
  const exportedAnnotation = { ...annotation, exportedTemplateId: templateId };
  const nextAnnotations = jumpDoc.pdfAnnotationBounds.map((entry) => entry.id === annotation.id ? exportedAnnotation : entry);

  if (annotation.exportKind === 'drawback') {
    return {
      jumpDoc: {
        ...jumpDoc,
        pdfAnnotationBounds: nextAnnotations,
        drawbacks: upsertById(jumpDoc.drawbacks, {
          ...baseTemplate,
          templateKind: 'drawback' as const,
          durationYears: null,
        }),
      },
      exportedAnnotation,
    };
  }

  if (annotation.exportKind === 'origin') {
    return {
      jumpDoc: {
        ...jumpDoc,
        pdfAnnotationBounds: nextAnnotations,
        origins: upsertById(jumpDoc.origins, {
          id: templateId,
          categoryKey: 'origin',
          title: baseTemplate.title,
          description: baseTemplate.description,
          cost: baseTemplate.costs[0] ?? { amount: 0, currencyKey: annotation.currencyKey || '0' },
          bounds: baseTemplate.bounds,
          importSourceMetadata: baseTemplate.importSourceMetadata,
        }),
      },
      exportedAnnotation,
    };
  }

  if (annotation.exportKind === 'scenario') {
    return {
      jumpDoc: {
        ...jumpDoc,
        pdfAnnotationBounds: nextAnnotations,
        scenarios: upsertById(jumpDoc.scenarios, {
          ...baseTemplate,
          templateKind: 'scenario' as const,
          rewards: [],
        }),
      },
      exportedAnnotation,
    };
  }

  if (annotation.exportKind === 'companion') {
    return {
      jumpDoc: {
        ...jumpDoc,
        pdfAnnotationBounds: nextAnnotations,
        companions: upsertById(jumpDoc.companions, {
          ...baseTemplate,
          templateKind: 'companion' as const,
          count: 1,
          allowances: {},
          stipends: {},
        }),
      },
      exportedAnnotation,
    };
  }

  return {
    jumpDoc: {
      ...jumpDoc,
      pdfAnnotationBounds: nextAnnotations,
      purchases: upsertById(jumpDoc.purchases, {
        ...baseTemplate,
        templateKind: 'purchase' as const,
        purchaseSection: annotation.purchaseSection ?? 'perk',
        subtypeKey: null,
        temporary: false,
        comboBoosts: [],
      }),
    },
    exportedAnnotation,
  };
}

function applyAnnotationParticipationExport(
  jumpDoc: JumpDoc,
  participation: WorkspaceParticipation,
  annotation: JumpDocPdfAnnotation,
): WorkspaceParticipation {
  const selection = getSelectionFromAnnotation(jumpDoc, annotation);

  if (annotation.exportKind === 'drawback') {
    return {
      ...participation,
      drawbacks: upsertSelection(participation.drawbacks, selection),
    };
  }

  if (annotation.exportKind === 'origin') {
    return {
      ...participation,
      origins: {
        ...participation.origins,
        [selection.id ?? annotation.id]: {
          summary: selection.title,
          description: selection.description,
          sourceJumpDocId: jumpDoc.id,
          sourceAnnotationId: annotation.id,
        },
      },
    };
  }

  if (annotation.exportKind === 'note') {
    return {
      ...participation,
      notes: [participation.notes, `${selection.title}: ${selection.description}`].filter(Boolean).join('\n\n'),
    };
  }

  return {
    ...participation,
    purchases: upsertSelection(participation.purchases, selection),
  };
}

function getSelectionFromAnnotation(jumpDoc: JumpDoc, annotation: JumpDocPdfAnnotation): ParticipationSelection {
  const value = annotation.costAmount ?? 0;
  const selectionKind =
    annotation.exportKind === 'drawback'
      ? 'drawback'
      : annotation.exportKind === 'scenario'
        ? 'scenario'
        : annotation.exportKind === 'companion'
          ? 'companion-import'
          : 'purchase';

  return {
    id: annotation.exportedTemplateId ?? createId('jumpdoc_selection'),
    selectionKind,
    title: annotation.label || annotation.extractedText.slice(0, 54) || `Page ${annotation.page} selection`,
    summary: annotation.label || annotation.extractedText.slice(0, 54) || `Page ${annotation.page} selection`,
    description: annotation.extractedText,
    value,
    currencyKey: annotation.currencyKey || '0',
    purchaseValue: selectionKind === 'drawback' ? 0 : value,
    costModifier: value === 0 ? 'free' : 'full',
    purchaseSection: annotation.exportKind === 'purchase' ? annotation.purchaseSection ?? 'perk' : undefined,
    subtypeKey: null,
    purchaseType:
      annotation.purchaseSection === 'item'
        ? 1
        : annotation.purchaseSection === 'subsystem'
          ? 2
          : annotation.exportKind === 'purchase'
            ? 0
            : null,
    tags: [],
    free: value === 0,
    sourceJumpDocId: jumpDoc.id,
    sourceTemplateId: annotation.exportedTemplateId ?? null,
    importSourceMetadata: {
      sourceAnnotationId: annotation.id,
      sourceJumpDocTitle: jumpDoc.title,
      sourcePage: annotation.page,
      notes: annotation.notes,
      rawFragment: annotation,
    },
  };
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
  const navigate = useNavigate();
  const { simpleMode } = useUiPreferences();
  const { chainId, workspace } = useChainWorkspace();
  const [searchParams, setSearchParams] = useSearchParams();
  const [notice, setNotice] = useState<StatusNotice | null>(null);
  const [jumpToLinkId, setJumpToLinkId] = useState('');
  const [exportJumpId, setExportJumpId] = useState('');
  const [exportParticipantId, setExportParticipantId] = useState('');
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
  const linkedJumps = draftJumpDoc
    ? workspace.jumps.filter((jump) => (jump.jumpDocIds ?? []).includes(draftJumpDoc.id))
    : [];
  const unlinkedJumps = draftJumpDoc
    ? workspace.jumps.filter((jump) => !(jump.jumpDocIds ?? []).includes(draftJumpDoc.id))
    : [];
  const targetJump = linkedJumps.find((jump) => jump.id === exportJumpId) ?? linkedJumps[0] ?? null;
  const jumpParticipants = targetJump
    ? workspace.participations.filter((participation) => participation.jumpId === targetJump.id)
    : [];
  const targetParticipation =
    jumpParticipants.find((participation) => participation.participantId === exportParticipantId) ??
    jumpParticipants[0] ??
    null;
  const participantNameById = new Map([
    ...workspace.jumpers.map((jumper) => [jumper.id, jumper.name] as const),
    ...workspace.companions.map((companion) => [companion.id, companion.name] as const),
  ]);

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

  async function handleStartJumpFromJumpDoc(jumpDoc: JumpDoc) {
    if (!workspace.activeBranch) {
      return;
    }

    const jump = {
      ...createBlankJump(chainId, workspace.activeBranch.id, workspace.jumps.length),
      title: jumpDoc.title,
      jumpDocIds: [jumpDoc.id],
      importSourceMetadata: {
        sourceJumpDocId: jumpDoc.id,
        sourceJumpDocTitle: jumpDoc.title,
      },
    };

    try {
      await saveChainRecord(db.jumps, jump);

      if (!workspace.currentJump) {
        await switchActiveJump(chainId, jump.id);
      }

      navigate(withSearchParams(`/chains/${chainId}/jumps/${jump.id}`, { guide: simpleMode ? '1' : null }));
      setNotice({ tone: 'success', message: 'Started a jump from this JumpDoc.' });
    } catch (error) {
      setNotice({ tone: 'error', message: error instanceof Error ? error.message : 'Unable to start a jump from this JumpDoc.' });
    }
  }

  async function handleLinkJump(jumpDoc: JumpDoc) {
    const jump = workspace.jumps.find((entry) => entry.id === jumpToLinkId);

    if (!jump) {
      return;
    }

    try {
      await saveChainRecord(db.jumps, {
        ...jump,
        jumpDocIds: Array.from(new Set([...(jump.jumpDocIds ?? []), jumpDoc.id])),
      });
      setJumpToLinkId('');
      setNotice({ tone: 'success', message: 'Added the jump to this JumpDoc.' });
    } catch (error) {
      setNotice({ tone: 'error', message: error instanceof Error ? error.message : 'Unable to add the jump to this JumpDoc.' });
    }
  }

  async function handleUnlinkJump(jumpId: string, jumpDoc: JumpDoc) {
    const jump = workspace.jumps.find((entry) => entry.id === jumpId);

    if (!jump) {
      return;
    }

    try {
      await saveChainRecord(db.jumps, {
        ...jump,
        jumpDocIds: (jump.jumpDocIds ?? []).filter((jumpDocId) => jumpDocId !== jumpDoc.id),
      });
      setNotice({ tone: 'success', message: 'Removed the jump from this JumpDoc.' });
    } catch (error) {
      setNotice({ tone: 'error', message: error instanceof Error ? error.message : 'Unable to remove the jump from this JumpDoc.' });
    }
  }

  function updateDraft(updater: (current: JumpDoc) => JumpDoc) {
    if (!draftJumpDoc) {
      return;
    }

    jumpDocAutosave.updateDraft(updater(draftJumpDoc));
  }

  function updateAnnotation(annotationId: string, updater: (annotation: JumpDocPdfAnnotation) => JumpDocPdfAnnotation) {
    updateDraft((current) => ({
      ...current,
      pdfAnnotationBounds: current.pdfAnnotationBounds.map((annotation) =>
        annotation.id === annotationId ? updater(annotation) : annotation,
      ),
    }));
  }

  function deleteAnnotation(annotationId: string) {
    updateDraft((current) => ({
      ...current,
      pdfAnnotationBounds: current.pdfAnnotationBounds.filter((annotation) => annotation.id !== annotationId),
    }));
    setNotice({ tone: 'success', message: 'Deleted the annotation.' });
  }

  async function exportAnnotations(annotations: JumpDocPdfAnnotation[]) {
    if (!draftJumpDoc || !targetJump || !targetParticipation) {
      setNotice({ tone: 'error', message: 'Link a jump and choose a participant before exporting to the chain.' });
      return;
    }

    if (annotations.length === 0) {
      setNotice({ tone: 'error', message: 'Add an annotation before exporting to the jump.' });
      return;
    }

    let nextJumpDoc = draftJumpDoc;
    const exportedAnnotations: JumpDocPdfAnnotation[] = [];

    for (const annotation of annotations) {
      const result = applyAnnotationTemplateExport(nextJumpDoc, annotation);
      nextJumpDoc = result.jumpDoc;
      exportedAnnotations.push(result.exportedAnnotation);
    }

    jumpDocAutosave.updateDraft(nextJumpDoc);

    let nextParticipation = targetParticipation;

    for (const exportedAnnotation of exportedAnnotations) {
      nextParticipation = applyAnnotationParticipationExport(nextJumpDoc, nextParticipation, exportedAnnotation);
    }

    try {
      await saveParticipationRecord(nextParticipation);
    } catch (error) {
      setNotice({ tone: 'error', message: error instanceof Error ? error.message : 'Unable to export annotations to the jump.' });
      return;
    }

    setNotice({
      tone: 'success',
      message: annotations.length === 1
        ? `Exported annotation to ${targetJump.title} as ${getAnnotationExportLabel(annotations[0])}.`
        : `Exported ${annotations.length} annotations to ${targetJump.title}.`,
    });
  }

  async function exportAnnotation(annotation: JumpDocPdfAnnotation) {
    await exportAnnotations([annotation]);
  }

  async function handleCreateParticipationTarget() {
    if (!targetJump) {
      return;
    }

    const primaryJumper = workspace.jumpers.find((jumper) => jumper.isPrimary) ?? workspace.jumpers[0] ?? null;

    if (!primaryJumper) {
      setNotice({ tone: 'error', message: 'Add a jumper before exporting JumpDoc selections.' });
      return;
    }

    try {
      const participation = createBlankParticipation(chainId, targetJump.branchId, targetJump.id, {
        participantId: primaryJumper.id,
        participantKind: 'jumper',
      });
      await saveParticipationRecord(participation);

      if (!targetJump.participantJumperIds.includes(primaryJumper.id)) {
        await saveChainRecord(db.jumps, {
          ...targetJump,
          participantJumperIds: [...targetJump.participantJumperIds, primaryJumper.id],
        });
      }

      setExportParticipantId(primaryJumper.id);
      setNotice({ tone: 'success', message: `Created a participation for ${primaryJumper.name}.` });
    } catch (error) {
      setNotice({ tone: 'error', message: error instanceof Error ? error.message : 'Unable to create a participation target.' });
    }
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
        <section className="workspace-two-column">
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

              <section className="stack stack--compact">
                <div className="actions">
                  <button className="button" type="button" onClick={() => void handleStartJumpFromJumpDoc(draftJumpDoc)}>
                    Start jump from this JumpDoc
                  </button>
                </div>
                {linkedJumps.length > 0 ? (
                  <div className="selection-list selection-list--compact">
                    {linkedJumps.map((jump) => (
                      <div key={jump.id} className="selection-list__item">
                        <strong>{jump.title}</strong>
                        <span>{jump.status}</span>
                        <button className="button button--secondary" type="button" onClick={() => void handleUnlinkJump(jump.id, draftJumpDoc)}>
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="muted">No jumps use this JumpDoc yet.</p>
                )}
                {unlinkedJumps.length > 0 ? (
                  <div className="field-grid field-grid--two">
                    <label className="field">
                      <span>Add existing jump</span>
                      <select value={jumpToLinkId} onChange={(event) => setJumpToLinkId(event.target.value)}>
                        <option value="">Choose a jump...</option>
                        {unlinkedJumps.map((jump) => (
                          <option key={jump.id} value={jump.id}>{jump.title}</option>
                        ))}
                      </select>
                    </label>
                    <div className="field field--inline-actions">
                      <span>Connect</span>
                      <button className="button button--secondary" type="button" disabled={!jumpToLinkId} onClick={() => void handleLinkJump(draftJumpDoc)}>
                        Add jump
                      </button>
                    </div>
                  </div>
                ) : null}
              </section>

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

              {draftJumpDoc.pdfAnnotationBounds.length > 0 ? (
                <section className="jumpdoc-annotation-panel stack stack--compact">
                  <div className="section-heading">
                    <h3>Annotation exports</h3>
                    <div className="inline-meta">
                      <span className="pill">{draftJumpDoc.pdfAnnotationBounds.length}</span>
                      <button
                        className="button button--secondary"
                        type="button"
                        disabled={!targetJump || !targetParticipation}
                        onClick={() => void exportAnnotations(draftJumpDoc.pdfAnnotationBounds)}
                      >
                        Export all to jump
                      </button>
                    </div>
                  </div>
                  <div className="field-grid field-grid--two">
                    <label className="field">
                      <span>Target jump</span>
                      <select
                        value={targetJump?.id ?? ''}
                        onChange={(event) => {
                          setExportJumpId(event.target.value);
                          setExportParticipantId('');
                        }}
                      >
                        {linkedJumps.length === 0 ? <option value="">Link or start a jump first</option> : null}
                        {linkedJumps.map((jump) => (
                          <option key={jump.id} value={jump.id}>{jump.title}</option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>Target participant</span>
                      <select value={targetParticipation?.participantId ?? ''} onChange={(event) => setExportParticipantId(event.target.value)}>
                        {jumpParticipants.length === 0 ? <option value="">No participation yet</option> : null}
                        {jumpParticipants.map((participation) => (
                          <option key={participation.id} value={participation.participantId}>
                            {participantNameById.get(participation.participantId) ?? participation.participantId}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {targetJump && jumpParticipants.length === 0 ? (
                    <div className="actions">
                      <button className="button button--secondary" type="button" onClick={() => void handleCreateParticipationTarget()}>
                        Create primary jumper participation
                      </button>
                    </div>
                  ) : null}
                  <div className="stack stack--compact">
                    {draftJumpDoc.pdfAnnotationBounds.map((annotation) => (
                      <article key={annotation.id} className="jumpdoc-annotation-editor stack stack--compact">
                        <div className="field-grid field-grid--three">
                          <label className="field">
                            <span>Name</span>
                            <input
                              value={annotation.label}
                              onChange={(event) => updateAnnotation(annotation.id, (current) => ({ ...current, label: event.target.value }))}
                            />
                          </label>
                          <label className="field">
                            <span>Export as</span>
                            <select
                              value={annotation.exportKind === 'purchase' ? annotation.purchaseSection ?? 'perk' : annotation.exportKind}
                              onChange={(event) => {
                                const value = event.target.value;
                                updateAnnotation(annotation.id, (current) =>
                                  value === 'perk' || value === 'item' || value === 'subsystem' || value === 'other'
                                    ? { ...current, exportKind: 'purchase', purchaseSection: value }
                                    : { ...current, exportKind: value as JumpDocPdfAnnotation['exportKind'], purchaseSection: current.purchaseSection },
                                );
                              }}
                            >
                              <option value="perk">Perk</option>
                              <option value="item">Item</option>
                              <option value="subsystem">Subsystem</option>
                              <option value="other">Other purchase</option>
                              <option value="drawback">Drawback</option>
                              <option value="origin">Origin</option>
                              <option value="scenario">Scenario</option>
                              <option value="companion">Companion</option>
                            </select>
                          </label>
                          <label className="field">
                            <span>Cost</span>
                            <input
                              inputMode="decimal"
                              value={annotation.costAmount ?? ''}
                              placeholder="optional"
                              onChange={(event) => {
                                const parsed = Number(event.target.value);
                                updateAnnotation(annotation.id, (current) => ({
                                  ...current,
                                  costAmount: event.target.value.trim() === '' || !Number.isFinite(parsed) ? null : parsed,
                                }));
                              }}
                            />
                          </label>
                        </div>
                        <div className="field-grid field-grid--two">
                          <label className="field">
                            <span>Currency</span>
                            <select
                              value={annotation.currencyKey || '0'}
                              onChange={(event) => updateAnnotation(annotation.id, (current) => ({ ...current, currencyKey: event.target.value }))}
                            >
                              {Object.entries(draftJumpDoc.currencies).map(([currencyKey, currency]) => (
                                <option key={currencyKey} value={currencyKey}>{currency.name || currency.abbrev || currencyKey}</option>
                              ))}
                            </select>
                          </label>
                          <div className="field field--inline-actions">
                            <span>{annotation.exportedTemplateId ? 'Update template' : 'Create template'}</span>
                            <button className="button button--secondary" type="button" disabled={!targetJump || !targetParticipation} onClick={() => void exportAnnotation(annotation)}>
                              Export to jump
                            </button>
                            <button className="button button--danger" type="button" onClick={() => deleteAnnotation(annotation.id)}>
                              Delete
                            </button>
                          </div>
                        </div>
                        <label className="field">
                          <span>Text</span>
                          <textarea
                            rows={3}
                            value={annotation.extractedText}
                            onChange={(event) => updateAnnotation(annotation.id, (current) => ({ ...current, extractedText: event.target.value }))}
                          />
                        </label>
                      </article>
                    ))}
                  </div>
                </section>
              ) : null}

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
