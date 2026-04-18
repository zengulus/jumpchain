import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { db } from '../../db/database';
import type { BodymodProfile, IconicSelection } from '../../domain/bodymod/types';
import type { BranchWorkspace } from '../../domain/chain/selectors';
import type { ParticipationSelection, SelectionAccessibilityStatus } from '../../domain/jump/selection';
import { createId } from '../../utils/id';
import { SearchHighlight } from '../search/SearchHighlight';
import { matchesSearchQuery, withSearchParams } from '../search/searchUtils';
import { saveChainEntity, saveChainRecord, saveParticipationRecord } from '../workspace/records';
import { EmptyWorkspaceCard, WorkspaceModuleHeader } from '../workspace/shared';
import { useAutosaveRecord } from '../workspace/useAutosaveRecord';
import { useChainWorkspace } from '../workspace/useChainWorkspace';

type MasterBuildCategory = 'all' | 'perk' | 'item' | 'location' | 'iconic';
type MergeBuildCategory = 'perk' | 'item' | 'location';
type WorkspaceParticipation = BranchWorkspace['participations'][number];
type RestrictableBuildEntry = ParticipationSelection | IconicSelection;
type RestrictionSettings = {
  activeLevel: number;
  levelCount: number;
  hideRestricted: boolean;
};

interface MasterBuildEntry {
  id: string;
  category: Exclude<MasterBuildCategory, 'all'>;
  categoryLabel: string;
  selection: RestrictableBuildEntry;
  selectionIndex: number;
  sourceType: 'purchase' | 'iconic';
  participation?: WorkspaceParticipation;
  profile?: BodymodProfile;
  jumpId: string;
  jumpTitle: string;
  jumpOrder: number;
  participantId: string;
  participantName: string;
  participantKind: 'jumper' | 'companion' | 'participant';
  to: string;
}

const categoryOptions: Array<{ id: MasterBuildCategory; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'perk', label: 'Perks' },
  { id: 'item', label: 'Items' },
  { id: 'location', label: 'Locations' },
  { id: 'iconic', label: 'Iconic' },
];

const mergeCategoryOptions: Array<{ id: MergeBuildCategory; label: string }> = [
  { id: 'perk', label: 'Perk' },
  { id: 'item', label: 'Item' },
  { id: 'location', label: 'Location' },
];

const accessibilityOptions: Array<{ id: SelectionAccessibilityStatus; label: string }> = [
  { id: 'unlocked', label: 'Unlocked' },
  { id: 'not-yet-unlocked', label: 'Not yet unlocked' },
  { id: 'suppressed', label: 'Suppressed' },
];

const MASTER_BUILD_RESTRICTIONS_METADATA_KEY = 'masterBuildRestrictions';
const DEFAULT_RESTRICTION_SETTINGS: RestrictionSettings = {
  activeLevel: 0,
  levelCount: 3,
  hideRestricted: false,
};

interface ChainLineSpec {
  id: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

interface ChainLinkSpec {
  id: string;
  x: number;
  y: number;
  angle: number;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getOptionalNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function getOptionalString(value: unknown) {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function getNonNegativeInteger(value: unknown, fallback: number) {
  const parsed = getOptionalNumber(value);

  if (parsed === null) {
    return fallback;
  }

  return Math.max(0, Math.floor(parsed));
}

function getSelectionRestrictionLevel(selection: RestrictableBuildEntry) {
  return getNonNegativeInteger(selection.restrictionLevel, 0);
}

function getSelectionAccessibilityStatus(selection: RestrictableBuildEntry): SelectionAccessibilityStatus {
  return selection.accessibilityStatus === 'not-yet-unlocked' || selection.accessibilityStatus === 'suppressed'
    ? selection.accessibilityStatus
    : 'unlocked';
}

function formatAccessibilityStatus(status: SelectionAccessibilityStatus) {
  return accessibilityOptions.find((option) => option.id === status)?.label ?? 'Unlocked';
}

function readRestrictionSettings(value: unknown): RestrictionSettings {
  const record = asRecord(value);
  const levelCount = getNonNegativeInteger(record.levelCount, DEFAULT_RESTRICTION_SETTINGS.levelCount);

  return {
    activeLevel: Math.min(getNonNegativeInteger(record.activeLevel, DEFAULT_RESTRICTION_SETTINGS.activeLevel), levelCount),
    levelCount,
    hideRestricted: record.hideRestricted === true,
  };
}

function normalizeRestrictionSettings(value: RestrictionSettings): RestrictionSettings {
  const levelCount = Math.max(0, Math.floor(value.levelCount));

  return {
    levelCount,
    activeLevel: Math.min(Math.max(0, Math.floor(value.activeLevel)), levelCount),
    hideRestricted: value.hideRestricted,
  };
}

function isParticipationSelection(selection: RestrictableBuildEntry): selection is ParticipationSelection {
  return 'selectionKind' in selection;
}

function isSelectionHidden(selection: RestrictableBuildEntry) {
  return isParticipationSelection(selection) && selection.hidden === true;
}

function getMergedFromCount(selection: RestrictableBuildEntry) {
  return isParticipationSelection(selection) ? selection.mergedFrom?.length ?? 0 : 0;
}

function getSelectionTitle(selection: RestrictableBuildEntry) {
  return selection.title.trim() || selection.summary?.trim() || 'Untitled purchase';
}

function getSelectionDescription(selection: RestrictableBuildEntry) {
  return isParticipationSelection(selection) ? selection.description : selection.summary;
}

function getSelectionTags(selection: RestrictableBuildEntry) {
  return isParticipationSelection(selection) ? selection.tags : [selection.kind, selection.source].filter(Boolean);
}

function isPurchaseEntry(
  entry: MasterBuildEntry | undefined,
): entry is MasterBuildEntry & { sourceType: 'purchase'; selection: ParticipationSelection; participation: WorkspaceParticipation } {
  return Boolean(entry) && entry?.sourceType === 'purchase' && Boolean(entry.participation) && isParticipationSelection(entry.selection);
}

function getSelectionCategory(selection: ParticipationSelection): MasterBuildEntry['category'] | null {
  if (selection.purchaseSection === 'perk' || selection.purchaseSection === 'item' || selection.purchaseSection === 'location') {
    return selection.purchaseSection;
  }

  const record = asRecord(selection);
  const subtypeKey = getOptionalString(record.subtype) ?? getOptionalString(record.subtypeKey);
  const purchaseType = getOptionalNumber(record.purchaseType) ?? getOptionalNumber(record._type);

  if (purchaseType === 1 || subtypeKey === '1') {
    return 'item';
  }

  if (purchaseType === 4 || subtypeKey === '2') {
    return 'location';
  }

  if (purchaseType === 0 || subtypeKey === '0' || purchaseType === null) {
    return 'perk';
  }

  return null;
}

function formatCategoryLabel(category: MasterBuildEntry['category']) {
  switch (category) {
    case 'perk':
      return 'Perk';
    case 'item':
      return 'Item';
    case 'location':
      return 'Location';
    case 'iconic':
      return 'Iconic';
  }
}

function formatCost(selection: ParticipationSelection) {
  if (selection.free || selection.costModifier === 'free') {
    return 'Free';
  }

  const currency = selection.currencyKey.trim() || '0';
  return `${selection.purchaseValue} ${currency === '0' ? 'CP' : currency}`;
}

function getPurchaseTypeForCategory(category: MergeBuildCategory) {
  switch (category) {
    case 'item':
      return 1;
    case 'location':
      return 4;
    case 'perk':
    default:
      return 0;
  }
}

function getDefaultSubtypeForCategory(category: MergeBuildCategory) {
  switch (category) {
    case 'item':
      return '1';
    case 'location':
      return '2';
    case 'perk':
    default:
      return '0';
  }
}

function getParticipantName(workspace: BranchWorkspace, participation: WorkspaceParticipation) {
  const jumper = workspace.jumpers.find((entry) => entry.id === participation.participantId);

  if (jumper) {
    return {
      name: jumper.name,
      kind: 'jumper' as const,
    };
  }

  const companion = workspace.companions.find((entry) => entry.id === participation.participantId);

  if (companion) {
    return {
      name: companion.name,
      kind: 'companion' as const,
    };
  }

  return {
    name: 'Participant',
    kind: 'participant' as const,
  };
}

function readCategory(value: string | null): MasterBuildCategory {
  return categoryOptions.some((option) => option.id === value)
    ? (value as MasterBuildCategory)
    : 'all';
}

function buildChainLinks(line: ChainLineSpec): ChainLinkSpec[] {
  const deltaX = line.endX - line.startX;
  const deltaY = line.endY - line.startY;
  const length = Math.hypot(deltaX, deltaY);

  if (length <= 0) {
    return [];
  }

  const linkWidth = 44;
  const spacing = 34;
  const linkCount = Math.max(3, Math.floor(length / spacing));
  const unitX = deltaX / length;
  const unitY = deltaY / length;
  const angle = Math.atan2(deltaY, deltaX) * (180 / Math.PI);
  const firstDistance = linkWidth / 2;
  const usableLength = Math.max(1, length - linkWidth);
  const step = linkCount > 1 ? usableLength / (linkCount - 1) : 0;

  return Array.from({ length: linkCount }, (_, index) => {
    const distance = firstDistance + index * step;

    return {
      id: `${line.id}-${index}`,
      x: line.startX + unitX * distance,
      y: line.startY + unitY * distance,
      angle,
    };
  });
}

function MasterBuildChainOverlay() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const node = ref.current;

    if (!node) {
      return;
    }

    const measuredNode = node;

    function updateSize() {
      const rect = measuredNode.getBoundingClientRect();
      setSize((current) =>
        Math.abs(current.width - rect.width) < 1 && Math.abs(current.height - rect.height) < 1
          ? current
          : { width: rect.width, height: rect.height },
      );
    }

    updateSize();

    const observer = new ResizeObserver(updateSize);
    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  const width = Math.max(0, Math.round(size.width));
  const height = Math.max(0, Math.round(size.height));
  const chainLines = useMemo(() => {
    if (width <= 0 || height <= 0) {
      return [];
    }

    const xInset = Math.min(40, Math.max(18, width * 0.045));
    const yInset = Math.min(28, Math.max(14, height * 0.12));

    return [
      {
        id: 'forward',
        startX: xInset,
        startY: yInset,
        endX: width - xInset,
        endY: height - yInset,
      },
      {
        id: 'backward',
        startX: width - xInset,
        startY: yInset,
        endX: xInset,
        endY: height - yInset,
      },
    ].flatMap(buildChainLinks);
  }, [height, width]);

  return (
    <div className="master-build-entry__chains" aria-hidden="true" ref={ref}>
      {width > 0 && height > 0 ? (
        <svg className="master-build-entry__chain-svg" viewBox={`0 0 ${width} ${height}`} focusable="false">
          {chainLines.map((link) => (
            <g key={link.id} transform={`translate(${link.x} ${link.y}) rotate(${link.angle})`}>
              <rect className="master-build-entry__chain-link" x="-22" y="-9" width="44" height="18" rx="9" />
            </g>
          ))}
        </svg>
      ) : null}
    </div>
  );
}

export function MasterBuildOverviewPage() {
  const { chainId, workspace } = useChainWorkspace();
  const chainAutosave = useAutosaveRecord(workspace.chain, {
    onSave: async (nextValue) => {
      await saveChainEntity(nextValue);
    },
  });
  const draftChain = chainAutosave.draft ?? workspace.chain;
  const rawChainMetadata = asRecord(draftChain.importSourceMetadata);
  const restrictionSettings = readRestrictionSettings(rawChainMetadata[MASTER_BUILD_RESTRICTIONS_METADATA_KEY]);
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedEntryIds, setSelectedEntryIds] = useState<string[]>([]);
  const [mergeTitle, setMergeTitle] = useState('');
  const [mergeDescription, setMergeDescription] = useState('');
  const [mergeCategory, setMergeCategory] = useState<MergeBuildCategory>('perk');
  const [showMergedComponents, setShowMergedComponents] = useState(false);
  const [includeIconic, setIncludeIconic] = useState(false);
  const [mergeStatus, setMergeStatus] = useState<string | null>(null);
  const [restrictionStatus, setRestrictionStatus] = useState<string | null>(null);
  const searchQuery = searchParams.get('search') ?? '';
  const activeCategory = readCategory(searchParams.get('category'));
  const jumpFilter = searchParams.get('jump') ?? 'all';
  const participantFilter = searchParams.get('participant') ?? 'all';

  const entries = useMemo(() => {
    const purchaseEntries = workspace.participations.flatMap<MasterBuildEntry>((participation) => {
      const jump = workspace.jumps.find((entry) => entry.id === participation.jumpId);
      const participant = getParticipantName(workspace, participation);

      return participation.purchases.flatMap((selection, index) => {
        const category = getSelectionCategory(selection);

        if (!category) {
          return [];
        }

        const jumpTitle = jump?.title ?? 'Unknown jump';
        const tab = category === 'location' ? 'locations' : `${category}s`;

        return [{
          id: `${participation.id}:${selection.id ?? index}:${category}`,
          category,
          categoryLabel: formatCategoryLabel(category),
          selection,
          selectionIndex: index,
          sourceType: 'purchase' as const,
          participation,
          jumpId: participation.jumpId,
          jumpTitle,
          jumpOrder: jump?.orderIndex ?? Number.MAX_SAFE_INTEGER,
          participantId: participation.participantId,
          participantName: participant.name,
          participantKind: participant.kind,
          to: withSearchParams(`/chains/${chainId}/jumps/${participation.jumpId}`, {
            participant: participation.participantId,
            panel: 'participation',
            participationTab: tab,
            search: searchQuery,
          }),
        }];
      });
    });

    const iconicEntries = includeIconic
      ? workspace.bodymodProfiles.flatMap<MasterBuildEntry>((profile) => {
          const jumper = workspace.jumpers.find((entry) => entry.id === profile.jumperId);
          const participantName = jumper?.name ?? 'Jumper';

          return profile.iconicSelections.flatMap((selection, index) =>
            getSelectionTitle(selection).trim().length > 0 || selection.source.trim().length > 0 || selection.summary.trim().length > 0
              ? [{
                  id: `${profile.id}:iconic:${index}`,
                  category: 'iconic' as const,
                  categoryLabel: 'Iconic',
                  selection,
                  selectionIndex: index,
                  sourceType: 'iconic' as const,
                  profile,
                  jumpId: 'iconic',
                  jumpTitle: 'Iconic',
                  jumpOrder: -1,
                  participantId: profile.jumperId,
                  participantName,
                  participantKind: 'jumper' as const,
                  to: withSearchParams(`/chains/${chainId}/bodymod`, {
                    jumper: profile.jumperId,
                    search: searchQuery,
                  }),
                }]
              : [],
          );
        })
      : [];

    return [...iconicEntries, ...purchaseEntries].sort((left, right) =>
    left.jumpOrder - right.jumpOrder ||
    left.jumpTitle.localeCompare(right.jumpTitle) ||
    left.participantName.localeCompare(right.participantName) ||
    getSelectionTitle(left.selection).localeCompare(getSelectionTitle(right.selection)),
    );
  }, [
    chainId,
    includeIconic,
    searchQuery,
    workspace.bodymodProfiles,
    workspace.companions,
    workspace.jumpers,
    workspace.jumps,
    workspace.participations,
  ]);

  const visibleEntryIds = useMemo(() => new Set(entries.map((entry) => entry.id)), [entries]);

  useEffect(() => {
    setSelectedEntryIds((currentIds) => currentIds.filter((entryId) => visibleEntryIds.has(entryId)));
  }, [visibleEntryIds]);

  const selectedEntries = selectedEntryIds
    .map((entryId) => entries.find((entry) => entry.id === entryId))
    .filter(isPurchaseEntry);

  useEffect(() => {
    if (selectedEntries.length === 0) {
      return;
    }

    if (mergeTitle.trim().length === 0) {
      setMergeTitle(`Merged ${formatCategoryLabel(selectedEntries[0].category)}`);
    }

    if (mergeDescription.trim().length === 0) {
      setMergeDescription(
        selectedEntries
          .map((entry) => `${getSelectionTitle(entry.selection)} (${entry.jumpTitle}, ${entry.participantName})`)
          .join('\n'),
      );
    }

    setMergeCategory(selectedEntries[0].category as MergeBuildCategory);
  }, [selectedEntryIds]);

  const visibleEntries = entries.filter((entry) => {
    const isRestricted = getSelectionRestrictionLevel(entry.selection) > restrictionSettings.activeLevel;

    return (showMergedComponents || !isSelectionHidden(entry.selection)) &&
      (!restrictionSettings.hideRestricted || !isRestricted) &&
      (activeCategory === 'all' || entry.category === activeCategory) &&
      (jumpFilter === 'all' || entry.jumpId === jumpFilter) &&
      (participantFilter === 'all' || entry.participantId === participantFilter) &&
      matchesSearchQuery(
        searchQuery,
        getSelectionTitle(entry.selection),
        entry.selection.summary,
        getSelectionDescription(entry.selection),
        getSelectionTags(entry.selection),
        entry.categoryLabel,
        entry.jumpTitle,
        entry.participantName,
      );
  });
  const counts = {
    perk: entries.filter((entry) => entry.category === 'perk' && !isSelectionHidden(entry.selection)).length,
    item: entries.filter((entry) => entry.category === 'item' && !isSelectionHidden(entry.selection)).length,
    location: entries.filter((entry) => entry.category === 'location' && !isSelectionHidden(entry.selection)).length,
    iconic: entries.filter((entry) => entry.category === 'iconic' && !isSelectionHidden(entry.selection)).length,
  };
  const hiddenMergedCount = entries.filter((entry) => isSelectionHidden(entry.selection)).length;
  const restrictedCount = entries.filter((entry) =>
    !isSelectionHidden(entry.selection) && getSelectionRestrictionLevel(entry.selection) > restrictionSettings.activeLevel,
  ).length;
  const inaccessibleCount = entries.filter((entry) =>
    !isSelectionHidden(entry.selection) && getSelectionAccessibilityStatus(entry.selection) !== 'unlocked',
  ).length;
  const maxEntryRestrictionLevel = Math.max(0, ...entries.map((entry) => getSelectionRestrictionLevel(entry.selection)));
  const activeRestrictionLevelOptions = Array.from({ length: restrictionSettings.levelCount + 1 }, (_, level) => level);
  const entryRestrictionLevelOptions = Array.from(
    { length: Math.max(restrictionSettings.levelCount, maxEntryRestrictionLevel) + 1 },
    (_, level) => level,
  );
  const jumpOptions = workspace.jumps.slice().sort((left, right) => left.orderIndex - right.orderIndex);
  const participantOptions = Array.from(
    new Map(entries.map((entry) => [entry.participantId, entry.participantName])).entries(),
  ).sort((left, right) => left[1].localeCompare(right[1]));
  const getCategoryCount = (category: MasterBuildCategory) =>
    category === 'all'
      ? entries.filter((entry) => !isSelectionHidden(entry.selection)).length
      : counts[category];

  function updateFilter(key: string, value: string) {
    setSearchParams((currentParams) => {
      const nextParams = new URLSearchParams(currentParams);

      if (value === 'all' || value.trim().length === 0) {
        nextParams.delete(key);
      } else {
        nextParams.set(key, value);
      }

      return nextParams;
    });
  }

  function updateRestrictionSettings(nextSettings: RestrictionSettings) {
    chainAutosave.updateDraft({
      ...draftChain,
      importSourceMetadata: {
        ...rawChainMetadata,
        [MASTER_BUILD_RESTRICTIONS_METADATA_KEY]: normalizeRestrictionSettings(nextSettings),
      },
    });
  }

  function toggleSelectedEntry(entryId: string, selected: boolean) {
    setMergeStatus(null);
    setSelectedEntryIds((currentIds) => {
      if (selected) {
        return currentIds.includes(entryId) ? currentIds : [...currentIds, entryId];
      }

      return currentIds.filter((currentId) => currentId !== entryId);
    });
  }

  async function handleCreateMergedEntry() {
    if (selectedEntries.length < 2) {
      setMergeStatus('Select at least two visible entries to merge.');
      return;
    }

    const mergedId = createId('selection');
    const targetParticipation = selectedEntries[0].participation;
    const selectedKeys = new Set(selectedEntries.map((entry) => `${entry.participation.id}:${entry.selectionIndex}`));
    const sourceRefs = selectedEntries.map((entry) => {
      const sourceId = entry.selection.id ?? createId('selection');

      return {
        id: sourceId,
        title: getSelectionTitle(entry.selection),
        purchaseSection: entry.category as MergeBuildCategory,
        participationId: entry.participation.id,
        jumpId: entry.jumpId,
        participantName: entry.participantName,
        jumpTitle: entry.jumpTitle,
        sourcePurchaseId: entry.selection.sourcePurchaseId ?? null,
      };
    });
    const sourceIdByKey = new Map(
      selectedEntries.map((entry, index) => [`${entry.participation.id}:${entry.selectionIndex}`, sourceRefs[index].id]),
    );
    const mergedValue = selectedEntries.reduce((total, entry) => total + (getOptionalNumber(entry.selection.value) ?? 0), 0);
    const mergedSpend = selectedEntries.reduce((total, entry) => total + (getOptionalNumber(entry.selection.purchaseValue) ?? 0), 0);
    const mergedTags = Array.from(new Set(selectedEntries.flatMap((entry) => entry.selection.tags)));
    const mergedRestrictionLevel = Math.max(...selectedEntries.map((entry) => getSelectionRestrictionLevel(entry.selection)));
    const mergedAccessibilityStatus = selectedEntries
      .map((entry) => getSelectionAccessibilityStatus(entry.selection))
      .find((status) => status !== 'unlocked');
    const mergedSelection: ParticipationSelection = {
      id: mergedId,
      selectionKind: 'purchase',
      title: mergeTitle.trim() || `Merged ${formatCategoryLabel(mergeCategory)}`,
      summary: mergeTitle.trim() || `Merged ${formatCategoryLabel(mergeCategory)}`,
      description: mergeDescription.trim(),
      value: mergedValue,
      currencyKey: selectedEntries[0].selection.currencyKey || '0',
      purchaseValue: mergedSpend,
      costModifier: mergedSpend === 0 ? 'free' : 'custom',
      purchaseSection: mergeCategory,
      subtypeKey: getDefaultSubtypeForCategory(mergeCategory),
      purchaseType: getPurchaseTypeForCategory(mergeCategory),
      tags: mergedTags,
      free: mergedSpend === 0,
      restrictionLevel: mergedRestrictionLevel > 0 ? mergedRestrictionLevel : undefined,
      accessibilityStatus: mergedAccessibilityStatus,
      mergedFrom: sourceRefs,
      sourcePurchaseId: null,
      sourceJumpDocId: null,
      sourceTemplateId: null,
      importSourceMetadata: {
        mergeCreatedAt: new Date().toISOString(),
      },
    };
    const affectedParticipations = workspace.participations
      .filter((participation) => selectedEntries.some((entry) => entry.participation.id === participation.id))
      .map((participation) => {
        const purchases = participation.purchases.map((purchase, index) => {
          const selectedKey = `${participation.id}:${index}`;

          if (!selectedKeys.has(selectedKey)) {
            return purchase;
          }

          return {
            ...purchase,
            id: sourceIdByKey.get(selectedKey) ?? purchase.id ?? createId('selection'),
            hidden: true,
            mergedIntoId: mergedId,
          };
        });

        return {
          ...participation,
          purchases: participation.id === targetParticipation.id ? [...purchases, mergedSelection] : purchases,
        };
      });

    try {
      setMergeStatus('Creating merged entry...');
      await Promise.all(affectedParticipations.map((participation) => saveParticipationRecord(participation)));
      setSelectedEntryIds([]);
      setMergeTitle('');
      setMergeDescription('');
      setMergeStatus(`Created "${mergedSelection.title}" from ${selectedEntries.length} entries.`);
    } catch (error) {
      setMergeStatus(error instanceof Error ? error.message : 'Unable to create the merged entry.');
    }
  }

  async function updateEntryRestriction(
    entry: MasterBuildEntry,
    patch: Pick<Partial<RestrictableBuildEntry>, 'restrictionLevel' | 'accessibilityStatus'>,
  ) {
    try {
      setRestrictionStatus('Saving restriction...');

      if (isPurchaseEntry(entry)) {
        const purchases = entry.participation.purchases.map((purchase, index) =>
          index === entry.selectionIndex
            ? {
                ...purchase,
                ...patch,
              }
            : purchase,
        );

        await saveParticipationRecord({
          ...entry.participation,
          purchases,
        });
      } else if (entry.sourceType === 'iconic' && entry.profile) {
        const iconicSelections = entry.profile.iconicSelections.map((selection, index) =>
          index === entry.selectionIndex
            ? {
                ...selection,
                ...patch,
              }
            : selection,
        );

        await saveChainRecord(db.bodymodProfiles, {
          ...entry.profile,
          iconicSelections,
        });
      }

      setRestrictionStatus('Restriction saved.');
    } catch (error) {
      setRestrictionStatus(error instanceof Error ? error.message : 'Unable to save restriction.');
    }
  }

  if (!workspace.activeBranch) {
    return <EmptyWorkspaceCard title="No active branch" body="Create or restore a branch before reviewing the master build." />;
  }

  return (
    <div className="stack">
      <WorkspaceModuleHeader
        title="Master Build Overview"
        description="Live filter every perk, item, and location across the active branch."
        badge={workspace.activeBranch.title}
        actions={workspace.currentJump ? (
          <Link className="button button--secondary" to={`/chains/${chainId}/jumps/${workspace.currentJump.id}`}>
            Open Current Jump
          </Link>
        ) : null}
      />

      <section className="section-surface stack">
        <div className="section-heading">
          <div className="stack stack--compact">
            <h3>Restrictions</h3>
            <p className="editor-section__copy">
              Set the viewed restriction level. Entries with a higher required level are restricted until this level reaches them.
            </p>
          </div>
          <span className="pill">{restrictedCount} restricted</span>
        </div>
        <div className="field-grid field-grid--three">
          <label className="field">
            <span>Restriction Level</span>
            <select
              value={restrictionSettings.activeLevel}
              onChange={(event) => updateRestrictionSettings({
                ...restrictionSettings,
                activeLevel: getNonNegativeInteger(event.target.value, 0),
              })}
            >
              {activeRestrictionLevelOptions.map((level) => (
                <option key={`active-restriction-level-${level}`} value={level}>
                  Level {level}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Configured Levels</span>
            <input
              min={0}
              type="number"
              value={restrictionSettings.levelCount}
              onChange={(event) => updateRestrictionSettings({
                ...restrictionSettings,
                levelCount: getNonNegativeInteger(event.target.value, DEFAULT_RESTRICTION_SETTINGS.levelCount),
              })}
            />
          </label>
          <label className="field checkbox-row master-build-toggle">
            <input
              type="checkbox"
              checked={restrictionSettings.hideRestricted}
              onChange={(event) => updateRestrictionSettings({
                ...restrictionSettings,
                hideRestricted: event.target.checked,
              })}
            />
            <span>Hide currently restricted entries</span>
          </label>
        </div>
        <div className="inline-meta">
          <span className="pill pill--soft">{inaccessibleCount} not fully accessible</span>
          <button
            className={`choice-chip${includeIconic ? ' is-active' : ''}`}
            type="button"
            onClick={() => setIncludeIconic((current) => !current)}
          >
            <span>Include Iconic?</span>
            <span>{includeIconic ? 'Yes' : 'No'}</span>
          </button>
          <span className="pill pill--soft">
            Settings {chainAutosave.status.phase === 'dirty' || chainAutosave.status.phase === 'saving' ? 'saving' : 'saved'}
          </span>
          {restrictionStatus ? <span className="pill pill--soft">{restrictionStatus}</span> : null}
        </div>
      </section>

      <section className="card stack">
        <div className="section-heading">
          <h3>Build Totals</h3>
          <span className="pill">{entries.length} tracked</span>
        </div>
        <div className="summary-grid">
          <article className="metric">
            <strong>{counts.perk}</strong>
            <span>Perks</span>
          </article>
          <article className="metric">
            <strong>{counts.item}</strong>
            <span>Items</span>
          </article>
          <article className="metric">
            <strong>{counts.location}</strong>
            <span>Locations</span>
          </article>
          <article className="metric">
            <strong>{counts.iconic}</strong>
            <span>Iconic</span>
          </article>
          <article className="metric">
            <strong>{visibleEntries.length}</strong>
            <span>Shown</span>
          </article>
          <article className="metric">
            <strong>{restrictedCount}</strong>
            <span>Restricted</span>
          </article>
          <article className="metric">
            <strong>{inaccessibleCount}</strong>
            <span>Tagged Inaccessible</span>
          </article>
        </div>
      </section>

      <section className="section-surface stack">
        <div className="section-heading">
          <h3>Filters</h3>
          <span className="pill">{visibleEntries.length} results</span>
        </div>
        <div className="field-grid field-grid--three">
          <label className="field">
            <span>Search</span>
            <input
              value={searchQuery}
              placeholder="name, notes, tags, jump, participant..."
              onChange={(event) => updateFilter('search', event.target.value)}
            />
          </label>
          <label className="field">
            <span>Jump</span>
            <select value={jumpFilter} onChange={(event) => updateFilter('jump', event.target.value)}>
              <option value="all">All jumps</option>
              {includeIconic ? <option value="iconic">Iconic</option> : null}
              {jumpOptions.map((jump) => (
                <option key={jump.id} value={jump.id}>
                  {jump.title}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Participant</span>
            <select value={participantFilter} onChange={(event) => updateFilter('participant', event.target.value)}>
              <option value="all">All participants</option>
              {participantOptions.map(([participantId, participantName]) => (
                <option key={participantId} value={participantId}>
                  {participantName}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="chip-grid">
          {categoryOptions.map((option) => (
            <button
              key={option.id}
              className={`choice-chip${activeCategory === option.id ? ' is-active' : ''}`}
              type="button"
              onClick={() => updateFilter('category', option.id)}
            >
              <span>{option.label}</span>
              <span>{getCategoryCount(option.id)}</span>
            </button>
          ))}
          <button
            className={`choice-chip${showMergedComponents ? ' is-active' : ''}`}
            type="button"
            onClick={() => setShowMergedComponents((current) => !current)}
          >
            <span>Merged Components</span>
            <span>{showMergedComponents ? 'Shown' : hiddenMergedCount}</span>
          </button>
        </div>
      </section>

      <section className="section-surface stack">
        <div className="section-heading">
          <div className="stack stack--compact">
            <h3>Merge Entries</h3>
            <p className="editor-section__copy">
              Select two or more visible purchases below, then create one new build entry. The originals stay on their participation pages as merged components.
            </p>
          </div>
          <span className="pill">{selectedEntries.length} selected</span>
        </div>

        {selectedEntries.length > 0 ? (
          <div className="selection-editor-list">
            <article className="selection-editor">
              <div className="selection-editor__header">
                <div className="stack stack--compact">
                  <strong>Merged entry details</strong>
                  <div className="inline-meta">
                    {selectedEntries.slice(0, 4).map((entry) => (
                      <span className="pill pill--soft" key={`selected-${entry.id}`}>
                        {getSelectionTitle(entry.selection)}
                      </span>
                    ))}
                    {selectedEntries.length > 4 ? <span className="pill pill--soft">+{selectedEntries.length - 4} more</span> : null}
                  </div>
                </div>
                <button className="button button--secondary" type="button" onClick={() => setSelectedEntryIds([])}>
                  Clear
                </button>
              </div>

              <div className="field-grid field-grid--three">
                <label className="field">
                  <span>Title</span>
                  <input value={mergeTitle} onChange={(event) => setMergeTitle(event.target.value)} />
                </label>
                <label className="field">
                  <span>Category</span>
                  <select
                    value={mergeCategory}
                    onChange={(event) => setMergeCategory(event.target.value as MergeBuildCategory)}
                  >
                    {mergeCategoryOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Starting cost</span>
                  <input
                    readOnly
                    value={selectedEntries.reduce((total, entry) => total + (getOptionalNumber(entry.selection.purchaseValue) ?? 0), 0)}
                  />
                </label>
              </div>

              <label className="field">
                <span>Description</span>
                <textarea
                  rows={4}
                  value={mergeDescription}
                  onChange={(event) => setMergeDescription(event.target.value)}
                />
              </label>

              <div className="actions">
                <button
                  className="button"
                  type="button"
                  disabled={selectedEntries.length < 2 || mergeStatus === 'Creating merged entry...'}
                  onClick={() => void handleCreateMergedEntry()}
                >
                  {mergeStatus === 'Creating merged entry...' ? 'Creating...' : 'Create Merged Entry'}
                </button>
                {mergeStatus ? <span className="pill pill--soft">{mergeStatus}</span> : null}
              </div>
            </article>
          </div>
        ) : (
          <p className="editor-section__empty">Choose entries from the purchases list to start a merge.</p>
        )}
      </section>

      <section className="card stack">
        <div className="section-heading">
          <h3>Build Entries</h3>
          <span className="pill">{visibleEntries.length}</span>
        </div>

        {visibleEntries.length === 0 ? (
          <p className="editor-section__empty">No perks, items, locations, or included Iconic entries match the current filters.</p>
        ) : (
          <div className="selection-editor-list">
            {visibleEntries.map((entry) => {
              const entryRestrictionLevel = getSelectionRestrictionLevel(entry.selection);
              const entryAccessibilityStatus = getSelectionAccessibilityStatus(entry.selection);
              const isRestricted = entryRestrictionLevel > restrictionSettings.activeLevel;
              const isInaccessible = entryAccessibilityStatus !== 'unlocked';

              return (
              <article
                className={[
                  'selection-editor',
                  'master-build-entry',
                  isRestricted ? 'is-restricted' : '',
                  isInaccessible ? 'is-inaccessible' : '',
                ].filter(Boolean).join(' ')}
                key={entry.id}
              >
                {isRestricted ? <MasterBuildChainOverlay /> : null}
                <div className="selection-editor__header">
                  <div className="stack stack--compact">
                    <label className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={selectedEntryIds.includes(entry.id)}
                        disabled={entry.sourceType !== 'purchase' || isSelectionHidden(entry.selection)}
                        onChange={(event) => toggleSelectedEntry(entry.id, event.target.checked)}
                      />
                      <strong>
                        <SearchHighlight text={getSelectionTitle(entry.selection)} query={searchQuery} />
                      </strong>
                    </label>
                    <div className="inline-meta">
                      <span className="pill">{entry.categoryLabel}</span>
                      {isParticipationSelection(entry.selection) ? (
                        <span className="pill pill--soft">{formatCost(entry.selection)}</span>
                      ) : (
                        <span className="pill pill--soft">{entry.selection.kind}</span>
                      )}
                      <span className="pill">{entry.jumpTitle}</span>
                      <span className="pill">{entry.participantName}</span>
                      <span className="pill pill--soft">Level {entryRestrictionLevel}</span>
                      {isRestricted ? <span className="pill">Restricted</span> : null}
                      {isInaccessible ? <span className="pill">{formatAccessibilityStatus(entryAccessibilityStatus)}</span> : null}
                      {getMergedFromCount(entry.selection) > 0 ? (
                        <span className="pill">Merged From {getMergedFromCount(entry.selection)}</span>
                      ) : null}
                      {isSelectionHidden(entry.selection) ? <span className="pill">Merged Component</span> : null}
                    </div>
                  </div>
                  <Link className="button button--secondary" to={entry.to}>
                    Open
                  </Link>
                </div>
                <div className="field-grid field-grid--two master-build-entry__restriction-controls">
                  <label className="field">
                    <span>Entry restriction level</span>
                    <select
                      value={entryRestrictionLevel}
                      onChange={(event) => void updateEntryRestriction(entry, {
                        restrictionLevel: getNonNegativeInteger(event.target.value, 0) || undefined,
                      })}
                    >
                      {entryRestrictionLevelOptions.map((level) => (
                        <option key={`${entry.id}:restriction-level:${level}`} value={level}>
                          {level === 0 ? 'Unconfigured / Level 0' : `Level ${level}`}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Inaccessible tag</span>
                    <select
                      value={entryAccessibilityStatus}
                      onChange={(event) => {
                        const nextStatus = event.target.value as SelectionAccessibilityStatus;
                        void updateEntryRestriction(entry, {
                          accessibilityStatus: nextStatus === 'unlocked' ? undefined : nextStatus,
                        });
                      }}
                    >
                      {accessibilityOptions.map((option) => (
                        <option key={`${entry.id}:accessibility:${option.id}`} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {getSelectionDescription(entry.selection).trim().length > 0 ? (
                  <p className="editor-section__copy">
                    <SearchHighlight text={getSelectionDescription(entry.selection)} query={searchQuery} />
                  </p>
                ) : null}
                {isParticipationSelection(entry.selection) && entry.selection.mergedFrom && entry.selection.mergedFrom.length > 0 ? (
                  <div className="stack stack--compact">
                    <strong>Merged From</strong>
                    <div className="chip-grid">
                      {entry.selection.mergedFrom.map((source, index) => (
                        <span className="token" key={`${entry.id}:merged-from:${source.id ?? index}`}>
                          <SearchHighlight
                            text={[
                              source.title,
                              source.jumpTitle ? `@ ${source.jumpTitle}` : null,
                              source.participantName ? `(${source.participantName})` : null,
                            ].filter(Boolean).join(' ')}
                            query={searchQuery}
                          />
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
                {getSelectionTags(entry.selection).length > 0 ? (
                  <div className="chip-grid">
                    {getSelectionTags(entry.selection).map((tag) => (
                      <span className="token" key={`${entry.id}:${tag}`}>
                        <SearchHighlight text={tag} query={searchQuery} />
                      </span>
                    ))}
                  </div>
                ) : null}
              </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
