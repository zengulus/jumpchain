import type { Chain } from '../chain/types';
import type { ImportWarning, JsonMap, UnresolvedMapping } from '../common';
import type {
  ChainMakerV2CleanerResult,
  NormalizedImportModel,
  PreparedImportSession,
} from './types';
import { normalizeParticipationSelection } from '../jump/selection';
import { mapNormalizedImportToNativeBundle } from './chainmakerV2';
import { detectImportSource } from './sourceDetection';

const TEXT_SOURCE_VERSION = '1.0';
const PRECALCULATED_REASON = 'precalculated';
const CP_CURRENCY_KEY = '0';

interface ParsedSelectionEntry {
  name: string;
  value: number;
  description: string;
  annotation: string | null;
  sourceSectionTitle: string;
}

interface ParsedSelectionSection {
  title: string;
  total: number | null;
  entries: ParsedSelectionEntry[];
  notes: string[];
}

interface ParsedOriginEntry {
  label: string;
  summary: string;
  description: string;
}

interface ParsedJumpSummaryText {
  jumpTitle: string;
  chainTitle: string;
  jumperName: string;
  purchases: ParsedSelectionSection[];
  drawbacks: ParsedSelectionSection[];
  chainDrawbacks: ParsedSelectionSection[];
  origins: ParsedOriginEntry[];
  budgetSummary: {
    startingBudget: number | null;
    finalBudget: number | null;
    totalPointsSpent: number | null;
    remainingPoints: number | null;
    totalOriginCost: number | null;
  };
  unparsedBlocks: string[][];
  preservedNotes: string[];
}

const DEFAULT_CHAIN_SETTINGS: Chain['chainSettings'] = {
  chainDrawbacksForCompanions: false,
  chainDrawbacksSupplements: true,
  narratives: 'enabled',
  altForms: true,
};

const DEFAULT_BANK_SETTINGS: Chain['bankSettings'] = {
  enabled: false,
  maxDeposit: 200,
  depositRatio: 50,
  interestRate: 0,
};

function normalizeNewlines(value: string) {
  return value.replace(/\uFEFF/g, '').replace(/\r\n?/g, '\n');
}

function trimBlockEdges(lines: string[]) {
  let start = 0;
  let end = lines.length;

  while (start < end && lines[start]?.trim().length === 0) {
    start += 1;
  }

  while (end > start && lines[end - 1]?.trim().length === 0) {
    end -= 1;
  }

  return lines.slice(start, end);
}

function splitContentBlocks(rawText: string) {
  const lines = normalizeNewlines(rawText)
    .split('\n')
    .map((line) => line.replace(/\s+$/g, ''));
  const titleIndex = lines.findIndex((line) => line.trim().length > 0);

  if (titleIndex < 0) {
    throw new Error('The jump summary text file is empty.');
  }

  const titleLine = lines[titleIndex]!.trim();
  const contentLines = lines.slice(titleIndex + 1);
  const blocks: string[][] = [];
  let currentBlock: string[] = [];

  for (const line of contentLines) {
    if (/^\s*-{3,}\s*$/.test(line)) {
      const trimmedBlock = trimBlockEdges(currentBlock);

      if (trimmedBlock.length > 0) {
        blocks.push(trimmedBlock);
      }

      currentBlock = [];
      continue;
    }

    currentBlock.push(line);
  }

  const trailingBlock = trimBlockEdges(currentBlock);

  if (trailingBlock.length > 0) {
    blocks.push(trailingBlock);
  }

  return {
    titleLine,
    blocks,
  };
}

function parseNumberToken(value: string) {
  const normalized = value.replace(/,/g, '').trim();

  if (!/^[+-]?\d+(?:\.\d+)?$/.test(normalized)) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePointsSummaryLine(line: string) {
  const match = /^(Starting Budget|Final Budget|Total Points Spent|Remaining Points|Total Cost):\s*([+-]?\d[\d,]*(?:\.\d+)?)\s*CP\b/i.exec(
    line.trim(),
  );

  if (!match) {
    return null;
  }

  const amount = parseNumberToken(match[2] ?? '');

  if (amount === null) {
    return null;
  }

  return {
    label: match[1].toLowerCase(),
    amount,
  };
}

function parseSectionHeader(line: string) {
  const match = /^(.*?)\s*\[([+-]?\d[\d,]*(?:\.\d+)?)\s*CP(?:\s*\[[^\]]+\])?\]\s*:?\s*$/.exec(line.trim());

  if (!match) {
    return null;
  }

  return {
    title: match[1]?.trim() ?? 'Section',
    total: parseNumberToken(match[2] ?? ''),
  };
}

function appendDescriptionLine(lines: string[], nextLine: string) {
  const trimmedLine = nextLine.trim();

  if (trimmedLine.length === 0) {
    if (lines.length > 0 && lines[lines.length - 1] !== '') {
      lines.push('');
    }

    return;
  }

  lines.push(trimmedLine);
}

function finalizeDescription(lines: string[]) {
  return lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parseSelectionEntryStart(line: string, sectionTitle: string) {
  const content = line.replace(/^\s*-\s+/, '');
  const match = /^(.*)\s+\(([-+]?\d[\d,]*(?:\.\d+)?)\s*CP(?:\s*\[([^\]]+)\])?\)\s*:?\s*(.*)$/.exec(content);

  if (!match) {
    return null;
  }

  const value = parseNumberToken(match[2] ?? '');

  if (value === null) {
    return null;
  }

  const descriptionLines: string[] = [];
  appendDescriptionLine(descriptionLines, match[4] ?? '');

  return {
    name: match[1]?.trim() || 'Imported Selection',
    value,
    annotation: match[3]?.trim() ?? null,
    descriptionLines,
    sourceSectionTitle: sectionTitle,
  };
}

function parseSelectionSections(lines: string[]) {
  const sections: ParsedSelectionSection[] = [];
  const looseNotes: string[] = [];
  let currentSection: ParsedSelectionSection | null = null;
  let currentEntry:
    | (Omit<ParsedSelectionEntry, 'description'> & {
        descriptionLines: string[];
      })
    | null = null;

  const finishEntry = () => {
    if (!currentSection || !currentEntry) {
      return;
    }

    currentSection.entries.push({
      name: currentEntry.name,
      value: currentEntry.value,
      annotation: currentEntry.annotation,
      sourceSectionTitle: currentEntry.sourceSectionTitle,
      description: finalizeDescription(currentEntry.descriptionLines),
    });
    currentEntry = null;
  };

  const finishSection = () => {
    finishEntry();

    if (currentSection) {
      sections.push(currentSection);
      currentSection = null;
    }
  };

  for (const line of lines) {
    const trimmedLine = line.trim();

    if (trimmedLine.length === 0) {
      if (currentEntry) {
        appendDescriptionLine(currentEntry.descriptionLines, trimmedLine);
      }

      continue;
    }

    const summaryLine = parsePointsSummaryLine(trimmedLine);

    if (summaryLine) {
      finishEntry();
      looseNotes.push(trimmedLine);
      continue;
    }

    const sectionHeader = parseSectionHeader(trimmedLine);

    if (sectionHeader) {
      finishSection();
      currentSection = {
        title: sectionHeader.title,
        total: sectionHeader.total,
        entries: [],
        notes: [],
      };
      continue;
    }

    if (/^\s*-\s+/.test(line)) {
      const sectionTitle: string = currentSection?.title ?? 'Imported';
      const parsedEntry = parseSelectionEntryStart(line, sectionTitle);

      if (parsedEntry) {
        finishEntry();

        if (!currentSection) {
          currentSection = {
            title: sectionTitle,
            total: null,
            entries: [],
            notes: [],
          };
        }

        currentEntry = parsedEntry;
        continue;
      }
    }

    if (currentEntry) {
      appendDescriptionLine(currentEntry.descriptionLines, line);
    } else if (currentSection) {
      currentSection.notes.push(trimmedLine);
    } else {
      looseNotes.push(trimmedLine);
    }
  }

  finishSection();

  return {
    sections,
    looseNotes,
  };
}

function parseOriginStart(line: string) {
  const content = line.replace(/^\s*-\s+/, '');
  const colonIndex = content.indexOf(':');

  if (colonIndex < 0) {
    return null;
  }

  const label = content.slice(0, colonIndex).trim();
  const summary = content.slice(colonIndex + 1).trim();

  if (label.length === 0) {
    return null;
  }

  return {
    label,
    summary,
    descriptionLines: [] as string[],
  };
}

function parseOriginsBlock(lines: string[]) {
  const origins: ParsedOriginEntry[] = [];
  const looseNotes: string[] = [];
  let totalCost: number | null = null;
  let currentOrigin:
    | {
        label: string;
        summary: string;
        descriptionLines: string[];
      }
    | null = null;

  const finishOrigin = () => {
    if (!currentOrigin) {
      return;
    }

    origins.push({
      label: currentOrigin.label,
      summary: currentOrigin.summary,
      description: finalizeDescription(currentOrigin.descriptionLines),
    });
    currentOrigin = null;
  };

  for (const line of lines) {
    const trimmedLine = line.trim();

    if (trimmedLine.length === 0) {
      if (currentOrigin) {
        appendDescriptionLine(currentOrigin.descriptionLines, trimmedLine);
      }

      continue;
    }

    const summaryLine = parsePointsSummaryLine(trimmedLine);

    if (summaryLine) {
      finishOrigin();

      if (summaryLine.label === 'total cost') {
        totalCost = summaryLine.amount;
      } else {
        looseNotes.push(trimmedLine);
      }

      continue;
    }

    if (/^\s*-\s+/.test(line)) {
      const parsedOrigin = parseOriginStart(line);

      if (parsedOrigin) {
        finishOrigin();
        currentOrigin = parsedOrigin;
        continue;
      }
    }

    if (currentOrigin) {
      appendDescriptionLine(currentOrigin.descriptionLines, line);
    } else {
      looseNotes.push(trimmedLine);
    }
  }

  finishOrigin();

  return {
    origins,
    totalCost,
    looseNotes,
  };
}

function getJumperNameFromFileName(fileName: string | undefined) {
  if (!fileName) {
    return 'Imported Jumper';
  }

  const match = /\[([^\]]+)\](?:\.[^.]+)?$/.exec(fileName);
  return match?.[1]?.trim() || 'Imported Jumper';
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .trim();
}

function getChainTitle(jumpTitle: string, jumperName: string) {
  return jumperName === 'Imported Jumper' ? jumpTitle : `${jumpTitle} [${jumperName}]`;
}

function parseJumpSummaryText(rawText: string, fileName?: string): ParsedJumpSummaryText {
  const { titleLine, blocks } = splitContentBlocks(rawText);
  const jumpTitle = titleLine.replace(/:\s*$/, '').trim();

  if (jumpTitle.length === 0) {
    throw new Error('Unable to determine the jump title from the text summary.');
  }

  const parsed: ParsedJumpSummaryText = {
    jumpTitle,
    chainTitle: getChainTitle(jumpTitle, getJumperNameFromFileName(fileName)),
    jumperName: getJumperNameFromFileName(fileName),
    purchases: [],
    drawbacks: [],
    chainDrawbacks: [],
    origins: [],
    budgetSummary: {
      startingBudget: null,
      finalBudget: null,
      totalPointsSpent: null,
      remainingPoints: null,
      totalOriginCost: null,
    },
    unparsedBlocks: [],
    preservedNotes: [],
  };

  for (const block of blocks) {
    const firstLine = block.find((line) => line.trim().length > 0)?.trim();

    if (!firstLine) {
      continue;
    }

    if (firstLine === 'Budgets:') {
      const { sections, looseNotes } = parseSelectionSections(block.slice(1));

      for (const line of block.slice(1)) {
        const parsedSummary = parsePointsSummaryLine(line);

        if (!parsedSummary) {
          continue;
        }

        if (parsedSummary.label === 'starting budget') {
          parsed.budgetSummary.startingBudget = parsedSummary.amount;
        } else if (parsedSummary.label === 'final budget') {
          parsed.budgetSummary.finalBudget = parsedSummary.amount;
        } else if (parsedSummary.label === 'remaining points') {
          parsed.budgetSummary.remainingPoints = parsedSummary.amount;
        } else if (parsedSummary.label === 'total points spent') {
          parsed.budgetSummary.totalPointsSpent = parsedSummary.amount;
        }
      }

      parsed.drawbacks.push(
        ...sections.filter((section) => section.title.toLowerCase().includes('drawback') && !section.title.toLowerCase().includes('chain')),
      );
      parsed.chainDrawbacks.push(...sections.filter((section) => section.title.toLowerCase().includes('chain drawback')));
      parsed.preservedNotes.push(...looseNotes);
      continue;
    }

    if (firstLine === 'Origin & Background:') {
      const originsBlock = parseOriginsBlock(block.slice(1));
      parsed.origins = originsBlock.origins;
      parsed.budgetSummary.totalOriginCost = originsBlock.totalCost;
      parsed.preservedNotes.push(...originsBlock.looseNotes);
      continue;
    }

    if (firstLine === 'Purchases:') {
      const { sections, looseNotes } = parseSelectionSections(block.slice(1));
      parsed.purchases = sections;

      for (const line of block.slice(1)) {
        const parsedSummary = parsePointsSummaryLine(line);

        if (!parsedSummary) {
          continue;
        }

        if (parsedSummary.label === 'total points spent') {
          parsed.budgetSummary.totalPointsSpent = parsedSummary.amount;
        } else if (parsedSummary.label === 'remaining points') {
          parsed.budgetSummary.remainingPoints = parsedSummary.amount;
        }
      }

      parsed.preservedNotes.push(...looseNotes);
      continue;
    }

    let consumedSummaryLine = false;

    for (const line of block) {
      const parsedSummary = parsePointsSummaryLine(line);

      if (!parsedSummary) {
        continue;
      }

      consumedSummaryLine = true;

      if (parsedSummary.label === 'remaining points') {
        parsed.budgetSummary.remainingPoints = parsedSummary.amount;
      } else if (parsedSummary.label === 'total points spent') {
        parsed.budgetSummary.totalPointsSpent = parsedSummary.amount;
      } else if (parsedSummary.label === 'starting budget') {
        parsed.budgetSummary.startingBudget = parsedSummary.amount;
      } else if (parsedSummary.label === 'final budget') {
        parsed.budgetSummary.finalBudget = parsedSummary.amount;
      }
    }

    if (!consumedSummaryLine || block.some((line) => parsePointsSummaryLine(line) === null)) {
      parsed.unparsedBlocks.push(block);
    }
  }

  if (
    parsed.budgetSummary.remainingPoints === null &&
    parsed.budgetSummary.finalBudget !== null &&
    parsed.budgetSummary.totalPointsSpent !== null
  ) {
    parsed.budgetSummary.remainingPoints =
      parsed.budgetSummary.finalBudget - parsed.budgetSummary.totalPointsSpent;
  }

  if (parsed.purchases.reduce((total, section) => total + section.entries.length, 0) === 0) {
    throw new Error('No purchase entries were found in the jump summary text file.');
  }

  return parsed;
}

function createCurrencyDefinitions(remainingPoints: number) {
  return {
    [CP_CURRENCY_KEY]: {
      name: 'Choice Points',
      abbrev: 'CP',
      budget: remainingPoints,
      essential: true,
    },
  };
}

function getPurchaseTypeDefinition(sectionTitle: string, sectionIndex: number) {
  const normalizedTitle = slugify(sectionTitle);

  if (normalizedTitle === 'perk' || normalizedTitle === 'perks') {
    return {
      purchaseType: 0,
      subtypeKey: '0',
      definition: null,
    };
  }

  if (normalizedTitle === 'item' || normalizedTitle === 'items') {
    return {
      purchaseType: 1,
      subtypeKey: '1',
      definition: null,
    };
  }

  if (normalizedTitle.includes('power') || normalizedTitle.includes('subsystem')) {
    return {
      purchaseType: 2,
      subtypeKey: '10',
      definition: null,
    };
  }

  const fallbackSlug = normalizedTitle || `section-${sectionIndex + 1}`;
  const customSubtypeKey = `imported-${fallbackSlug}`;
  const isCompanionLike = normalizedTitle.includes('companion');

  return {
    purchaseType: isCompanionLike ? 2 : 3,
    subtypeKey: customSubtypeKey,
    definition: {
      name: sectionTitle,
      stipend: 0,
      currency: 0,
      type: isCompanionLike ? 2 : 3,
      essential: false,
    },
  };
}

function createSelectionRecord(
  entry: ParsedSelectionEntry,
  sectionDefinition: ReturnType<typeof getPurchaseTypeDefinition>,
) {
  return normalizeParticipationSelection({
    name: entry.name,
    summary: entry.name,
    description: entry.description,
    value: entry.value,
    currency: 0,
    free: true,
    costModifier: 0,
    purchaseValue: 0,
    discountSource: PRECALCULATED_REASON,
    selectionKind: 'purchase',
    purchaseType: sectionDefinition.purchaseType,
    subtype: sectionDefinition.subtypeKey,
    tags: [],
    importedSectionTitle: entry.sourceSectionTitle,
    priceAnnotation: entry.annotation ?? undefined,
    sourceType: 'jump-summary-text',
  }, 'purchase');
}

function createDrawbackRecord(entry: ParsedSelectionEntry) {
  return normalizeParticipationSelection({
    name: entry.name,
    summary: entry.name,
    description: entry.description,
    value: entry.value,
    currency: 0,
    free: true,
    costModifier: 0,
    purchaseValue: 0,
    discountSource: PRECALCULATED_REASON,
    selectionKind: 'drawback',
    tags: [],
    importedSectionTitle: entry.sourceSectionTitle,
    priceAnnotation: entry.annotation ?? undefined,
    sourceType: 'jump-summary-text',
  }, 'drawback');
}

function createOriginMetadata(origins: ParsedOriginEntry[]) {
  const originCategories: Record<string, { name: string; singleLine: boolean; default: string }> = {};
  const originCategoryList: string[] = [];
  const originSelections: Record<string, { cost: number; summary: string; description: string }> = {};
  const reservedKeys = new Set<string>();

  const takeKey = (label: string) => {
    const normalized = label.trim().toLowerCase();

    if (normalized === 'age' && !reservedKeys.has('0')) {
      reservedKeys.add('0');
      return '0';
    }

    if (normalized === 'gender' && !reservedKeys.has('1')) {
      reservedKeys.add('1');
      return '1';
    }

    if (normalized === 'location' && !reservedKeys.has('2')) {
      reservedKeys.add('2');
      return '2';
    }

    if (normalized === 'origin' && !reservedKeys.has('3')) {
      reservedKeys.add('3');
      return '3';
    }

    let customKey = `origin-${slugify(label) || 'custom'}`;
    let suffix = 2;

    while (reservedKeys.has(customKey)) {
      customKey = `origin-${slugify(label) || 'custom'}-${suffix}`;
      suffix += 1;
    }

    reservedKeys.add(customKey);
    return customKey;
  };

  for (const origin of origins) {
    const key = takeKey(origin.label);
    originCategories[key] = {
      name: origin.label,
      singleLine: !/location|origin/i.test(origin.label),
      default: origin.summary,
    };
    originCategoryList.push(key);
    originSelections[key] = {
      cost: 0,
      summary: origin.summary,
      description: origin.description,
    };
  }

  return {
    originCategories,
    originCategoryList,
    originSelections,
  };
}

function buildWarnings(parsed: ParsedJumpSummaryText): ImportWarning[] {
  const warnings: ImportWarning[] = [];

  if (parsed.chainDrawbacks.length > 0) {
    warnings.push({
      code: 'jump_summary_chain_drawbacks_preserved',
      message:
        'Chain drawback sections were preserved in import metadata but not converted into chainwide effects automatically.',
      severity: 'info',
      path: 'chain.importSourceMetadata.precalculatedBudgetSummary.chainDrawbacks',
    });
  }

  if (parsed.unparsedBlocks.length > 0) {
    warnings.push({
      code: 'jump_summary_unparsed_blocks_preserved',
      message: `Preserved ${parsed.unparsedBlocks.length} unparsed text block${
        parsed.unparsedBlocks.length === 1 ? '' : 's'
      } in import metadata for manual review.`,
      severity: 'warning',
      path: 'chain.importSourceMetadata.unparsedBlocks',
    });
  }

  return warnings;
}

function buildUnresolvedMappings(parsed: ParsedJumpSummaryText): UnresolvedMapping[] {
  const unresolvedMappings: UnresolvedMapping[] = [
    {
      path: 'participations.0.purchases',
      reason: 'Imported purchases were normalized to not spend budget and tagged with the reason "precalculated".',
      severity: 'info',
      preservedAt: 'participation.importSourceMetadata.precalculatedImport',
    },
  ];

  if (parsed.chainDrawbacks.length > 0) {
    unresolvedMappings.push({
      path: 'budgets.chainDrawbacks',
      reason: 'Chain drawback sections were preserved in metadata because this text format does not map cleanly to chainwide effects yet.',
      severity: 'info',
      rawFragment: parsed.chainDrawbacks,
      preservedAt: 'chain.importSourceMetadata.precalculatedBudgetSummary.chainDrawbacks',
    });
  }

  if (parsed.unparsedBlocks.length > 0) {
    unresolvedMappings.push({
      path: 'unparsedBlocks',
      reason: 'Some text blocks were preserved verbatim for review because they did not match the structured parser.',
      severity: 'warning',
      rawFragment: parsed.unparsedBlocks,
      preservedAt: 'chain.importSourceMetadata.unparsedBlocks',
    });
  }

  return unresolvedMappings;
}

function buildNormalizedImportModel(rawText: string, fileName?: string): NormalizedImportModel {
  const parsed = parseJumpSummaryText(rawText, fileName);
  const purchaseSubtypes: Record<string, JsonMap> = {
    '0': {
      name: 'Perk',
      stipend: 0,
      currency: 0,
      type: 0,
      essential: true,
    },
    '1': {
      name: 'Item',
      stipend: 0,
      currency: 0,
      type: 1,
      essential: true,
    },
    '10': {
      name: 'Subsystem',
      stipend: 0,
      currency: 0,
      type: 2,
      essential: true,
    },
  };
  const purchases = parsed.purchases.flatMap((section, sectionIndex) => {
    const definition = getPurchaseTypeDefinition(section.title, sectionIndex);

    if (definition.definition) {
      purchaseSubtypes[definition.subtypeKey] = definition.definition;
    }

    return section.entries.map((entry) => createSelectionRecord(entry, definition));
  });
  const drawbacks = parsed.drawbacks.flatMap((section) => section.entries.map((entry) => createDrawbackRecord(entry)));
  const originMetadata = createOriginMetadata(parsed.origins);
  const remainingPoints = parsed.budgetSummary.remainingPoints ?? 0;
  const currencies = createCurrencyDefinitions(remainingPoints);
  const warnings = buildWarnings(parsed);
  const unresolvedMappings = buildUnresolvedMappings(parsed);

  return {
    sourceType: 'jump-summary-text',
    sourceVersion: TEXT_SOURCE_VERSION,
    chain: {
      title: parsed.chainTitle,
      sourceVersion: TEXT_SOURCE_VERSION,
      chainSettings: DEFAULT_CHAIN_SETTINGS,
      bankSettings: DEFAULT_BANK_SETTINGS,
      importSourceMetadata: {
        fileName: fileName ?? null,
        rawText,
        jumpTitle: parsed.jumpTitle,
        jumperName: parsed.jumperName,
        precalculatedBudgetSummary: {
          ...parsed.budgetSummary,
          chainDrawbacks: parsed.chainDrawbacks,
          purchaseSections: parsed.purchases.map((section) => ({
            title: section.title,
            total: section.total,
            entryCount: section.entries.length,
          })),
          drawbackSections: parsed.drawbacks.map((section) => ({
            title: section.title,
            total: section.total,
            entryCount: section.entries.length,
          })),
        },
        preservedNotes: parsed.preservedNotes,
        unparsedBlocks: parsed.unparsedBlocks,
      },
    },
    jumpers: [
      {
        sourceKey: '0',
        sourceId: 0,
        name: parsed.jumperName,
        isPrimary: true,
        gender: '',
        originalAge: parseNumberToken(parsed.origins.find((origin) => origin.label.toLowerCase() === 'age')?.summary ?? ''),
        notes: '',
        originalFormSourceId: null,
        personality: {
          personality: '',
          motivation: '',
          likes: '',
          dislikes: '',
          quirks: '',
        },
        background: {
          summary: parsed.origins.find((origin) => origin.label.toLowerCase() === 'origin')?.summary ?? '',
          description: '',
        },
        importSourceMetadata: {
          fileName: fileName ?? null,
        },
      },
    ],
    companions: [],
    jumps: [
      {
        sourceKey: '0',
        sourceId: 0,
        title: parsed.jumpTitle,
        orderIndex: 0,
        status: 'current',
        duration: {
          years: 10,
          months: 0,
          days: 0,
        },
        characterSourceIds: [0],
        importSourceMetadata: {
          fileName: fileName ?? null,
          sourceType: 'jump-summary-text',
        },
      },
    ],
    participations: [
      {
        sourceJumpId: 0,
        sourceCharacterId: 0,
        status: 'active',
        notes: '',
        purchases,
        drawbacks,
        retainedDrawbacks: [],
        origins: originMetadata.originSelections,
        budgets: {},
        stipends: {},
        narratives: {
          accomplishments: '',
          challenges: '',
          goals: '',
        },
        altForms: [],
        bankDeposit: 0,
        currencyExchanges: [],
        supplementPurchases: {},
        supplementInvestments: {},
        drawbackOverrides: {},
        importSourceMetadata: {
          currencies,
          purchaseSubtypes,
          originCategories: originMetadata.originCategories,
          originCategoryList: originMetadata.originCategoryList,
          precalculatedImport: {
            reason: PRECALCULATED_REASON,
            fileName: fileName ?? null,
            startingBudget: parsed.budgetSummary.startingBudget,
            finalBudget: parsed.budgetSummary.finalBudget,
            totalPointsSpent: parsed.budgetSummary.totalPointsSpent,
            remainingPoints,
          },
        },
      },
    ],
    effects: [],
    bodymodProfiles: [],
    warnings,
    unresolvedMappings,
    summary: {
      chainName: parsed.chainTitle,
      jumperCount: 1,
      jumpCount: 1,
      chainDrawbackCount: 0,
      altformCount: 0,
      participationCount: 1,
    },
    preservedSourceSummary: {
      purchaseSectionCount: parsed.purchases.length,
      purchaseCount: purchases.length,
      drawbackCount: drawbacks.length,
      originCount: parsed.origins.length,
      chainDrawbackSectionCount: parsed.chainDrawbacks.length,
      remainingPoints,
      unparsedBlockCount: parsed.unparsedBlocks.length,
    },
  };
}

export function prepareJumpSummaryTextImportSession(rawText: string, options: { fileName?: string } = {}): PreparedImportSession {
  const detection = detectImportSource(rawText);

  if (detection.sourceType !== 'jump-summary-text' || !detection.isSupported) {
    throw new Error('The provided text file is not a supported jump summary import.');
  }

  const normalized = buildNormalizedImportModel(rawText, options.fileName);
  const bundle = mapNormalizedImportToNativeBundle(normalized);
  const cleaning: ChainMakerV2CleanerResult = {
    cleanedRaw: rawText,
    changes: [],
  };

  return {
    sourceDetection: detection,
    cleaning,
    source: rawText,
    normalized,
    bundle,
    importReport: bundle.importReports[0],
  };
}
