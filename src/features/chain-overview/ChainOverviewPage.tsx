import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { db } from '../../db/database';
import { getEffectiveCurrentJumpState } from '../../domain/chain/selectors';
import { switchActiveBranch, switchActiveJump } from '../../db/persistence';
import {
  createBlankBodymodProfile,
  createBlankJump,
  createBlankJumper,
  saveChainRecord,
  syncJumpParticipantMembership,
} from '../workspace/records';
import { StatusNoticeBanner, type StatusNotice, WorkspaceModuleHeader } from '../workspace/shared';
import { useChainWorkspace } from '../workspace/useChainWorkspace';

type OverviewStepTone = 'ready' | 'attention' | 'blocked';

interface OverviewStepAction {
  kind: 'link' | 'button';
  label: string;
  to?: string;
  onClick?: () => Promise<void> | void;
}

interface OverviewSetupStep {
  id: string;
  title: string;
  description: string;
  context?: string;
  tone: OverviewStepTone;
  primaryAction: OverviewStepAction;
}

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString();
}

function formatCountLabel(value: number, singular: string, plural = `${singular}s`) {
  return `${value} ${value === 1 ? singular : plural}`;
}

function getStepStatusLabel(tone: OverviewStepTone) {
  switch (tone) {
    case 'ready':
      return 'Ready';
    case 'attention':
      return 'Needs setup';
    default:
      return 'Waiting';
  }
}

function getStepPillClassName(tone: OverviewStepTone) {
  switch (tone) {
    case 'ready':
      return 'pill pill--success';
    case 'attention':
      return 'pill pill--warning';
    default:
      return 'pill pill--muted';
  }
}

export function ChainOverviewPage() {
  const { chainId, bundle, workspace } = useChainWorkspace();
  const [searchParams, setSearchParams] = useSearchParams();
  const [notice, setNotice] = useState<StatusNotice | null>(null);
  const effectiveState = getEffectiveCurrentJumpState(workspace);
  const latestSnapshot = workspace.snapshots.slice().sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
  const hasJumpers = workspace.jumpers.length > 0;
  const hasJumps = workspace.jumps.length > 0;
  const currentJump = workspace.currentJump;
  const selectedJumper =
    workspace.jumpers.find((jumper) => jumper.id === searchParams.get('jumper')) ??
    workspace.jumpers[0] ??
    null;
  const selectedJumperId = selectedJumper?.id ?? '';
  const selectedIconicProfile = selectedJumper
    ? workspace.bodymodProfiles.find((profile) => profile.jumperId === selectedJumper.id) ?? null
    : null;
  const firstJump = workspace.jumps[0] ?? null;
  const selectedParticipation =
    currentJump && selectedJumper
      ? workspace.participations.find((participation) => participation.jumpId === currentJump.id && participation.jumperId === selectedJumper.id) ?? null
      : null;

  function buildSearch(nextJumperId = selectedJumperId) {
    const nextSearchParams = new URLSearchParams(searchParams);

    if (nextJumperId) {
      nextSearchParams.set('jumper', nextJumperId);
    } else {
      nextSearchParams.delete('jumper');
    }

    const nextSearch = nextSearchParams.toString();
    return nextSearch.length > 0 ? `?${nextSearch}` : '';
  }

  function getJumpEditorPath(nextJumpId?: string | null) {
    const jumpId = nextJumpId ?? currentJump?.id ?? workspace.jumps[0]?.id ?? null;

    if (!jumpId) {
      return `/chains/${chainId}/jumps`;
    }

    return `/chains/${chainId}/jumps/${jumpId}`;
  }

  function getBodymodPath(nextJumperId = selectedJumperId) {
    if (!selectedJumper) {
      return `/chains/${chainId}/jumpers`;
    }

    return `/chains/${chainId}/bodymod${buildSearch(nextJumperId)}`;
  }

  function getParticipationPath(nextJumperId = selectedJumperId) {
    if (!selectedJumper) {
      return `/chains/${chainId}/jumpers`;
    }

    if (!currentJump) {
      return `/chains/${chainId}/jumps`;
    }

    return `/chains/${chainId}/participation/${currentJump.id}${buildSearch(nextJumperId)}`;
  }

  function handleFocusedJumperChange(nextJumperId: string) {
    setSearchParams((currentParams) => {
      const nextParams = new URLSearchParams(currentParams);

      if (nextJumperId) {
        nextParams.set('jumper', nextJumperId);
      } else {
        nextParams.delete('jumper');
      }

      return nextParams;
    });
  }

  async function handleCreateJumper() {
    if (!workspace.activeBranch) {
      return;
    }

    const jumper = createBlankJumper(chainId, workspace.activeBranch.id);

    try {
      await saveChainRecord(db.jumpers, jumper);
      handleFocusedJumperChange(jumper.id);
      setNotice({
        tone: 'success',
        message: 'Created a new jumper from Overview.',
      });
    } catch (error) {
      setNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Unable to create a jumper from Overview.',
      });
    }
  }

  async function handleCreateJump() {
    if (!workspace.activeBranch) {
      return;
    }

    const jump = createBlankJump(chainId, workspace.activeBranch.id, workspace.jumps.length);

    try {
      await saveChainRecord(db.jumps, jump);

      if (!workspace.currentJump) {
        await switchActiveJump(chainId, jump.id);
      }

      setNotice({
        tone: 'success',
        message: 'Created a new jump from Overview.',
      });
    } catch (error) {
      setNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Unable to create a jump from Overview.',
      });
    }
  }

  async function handleSetCurrentJump(nextJumpId: string) {
    try {
      await switchActiveJump(chainId, nextJumpId);
      setNotice({
        tone: 'success',
        message: 'Current jump updated from Overview.',
      });
    } catch (error) {
      setNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Unable to change the current jump from Overview.',
      });
    }
  }

  async function handleCreateIconic() {
    if (!workspace.activeBranch || !selectedJumper) {
      return;
    }

    try {
      await saveChainRecord(
        db.bodymodProfiles,
        createBlankBodymodProfile(chainId, workspace.activeBranch.id, selectedJumper.id),
      );
      setNotice({
        tone: 'success',
        message: `Created an Iconic profile for ${selectedJumper.name}.`,
      });
    } catch (error) {
      setNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Unable to create an Iconic profile from Overview.',
      });
    }
  }

  async function handleCreateParticipation() {
    if (!currentJump || !selectedJumper) {
      return;
    }

    try {
      await syncJumpParticipantMembership(chainId, currentJump, selectedJumper.id, true);
      setNotice({
        tone: 'success',
        message: `Created participation for ${selectedJumper.name} in ${currentJump.title}.`,
      });
    } catch (error) {
      setNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Unable to create participation from Overview.',
      });
    }
  }

  const setupSteps: OverviewSetupStep[] = [
    {
      id: 'jumper',
      title: hasJumpers ? `Jumpers ready: ${formatCountLabel(workspace.jumpers.length, 'jumper')}` : 'Create your first jumper',
      description: hasJumpers
        ? `Character-focused systems now have someone to hang off. ${selectedJumper ? `${selectedJumper.name} is the current focus.` : 'Pick a focus jumper any time.'}`
        : 'Iconic, participation, and jumper-owned notes all start here.',
      context: hasJumpers
        ? `Open ${selectedJumper?.name ?? 'the roster'} to keep identity, background, and concept notes aligned.`
        : 'Start with at least one jumper before worrying about Iconic or participation.',
      tone: hasJumpers ? 'ready' : 'attention',
      primaryAction: hasJumpers
        ? {
            kind: 'link',
            label: `Open ${selectedJumper?.name ?? 'Jumpers'}`,
            to: `/chains/${chainId}/jumpers${buildSearch(selectedJumperId)}`,
          }
        : {
            kind: 'button',
            label: 'Create First Jumper',
            onClick: () => handleCreateJumper(),
          },
    },
    {
      id: 'jump',
      title: hasJumps ? `Jumps ready: ${formatCountLabel(workspace.jumps.length, 'jump')}` : 'Create your first jump',
      description: hasJumps
        ? `${currentJump ? `${currentJump.title} is active right now.` : 'A jump exists, but none is marked current yet.'}`
        : 'Timeline, participation, and current-jump rules become meaningful once a jump exists.',
      context: hasJumps
        ? 'Open the jump editor to maintain order, status, and participant membership.'
        : 'Even a rough placeholder jump is enough to unlock the rest of the jump-specific workflow.',
      tone: hasJumps ? 'ready' : 'attention',
      primaryAction: hasJumps
        ? {
            kind: 'link',
            label: `Open ${currentJump?.title ?? 'Jumps'}`,
            to: getJumpEditorPath(),
          }
        : {
            kind: 'button',
            label: 'Create First Jump',
            onClick: () => handleCreateJump(),
          },
    },
    {
      id: 'current-jump',
      title: currentJump ? 'Current jump selected' : 'Choose the current jump',
      description: currentJump
        ? `${currentJump.title} drives participation focus, current-jump rules, and the live summary below.`
        : hasJumps
          ? 'Pick which existing jump is currently in play so the rest of the workspace can follow it.'
          : 'There is no jump to select yet. Create one first, then pick the active jump here.',
      context: currentJump
        ? 'Use the selector in Active Context to switch focus without leaving Overview.'
        : hasJumps
          ? 'If you are mid-chain, choosing the current jump is usually the next control step after creating jumps.'
          : 'This stays blocked until at least one jump exists.',
      tone: currentJump ? 'ready' : hasJumps ? 'attention' : 'blocked',
      primaryAction: currentJump
        ? {
            kind: 'link',
            label: 'Switch or Review Current Jump',
            to: getJumpEditorPath(),
          }
        : firstJump && workspace.jumps.length === 1
          ? {
              kind: 'button',
              label: `Make ${firstJump.title} Current`,
              onClick: () => handleSetCurrentJump(firstJump.id),
            }
          : hasJumps
            ? {
                kind: 'link',
                label: 'Open Jumps',
                to: `/chains/${chainId}/jumps`,
              }
            : {
                kind: 'button',
                label: 'Create First Jump',
                onClick: () => handleCreateJump(),
              },
    },
    {
      id: 'iconic',
      title: selectedJumper ? `Iconic for ${selectedJumper.name}` : 'Create a jumper before Iconic',
      description: selectedJumper
        ? selectedIconicProfile
          ? 'The focused jumper already has a jumper-tied Iconic profile.'
          : 'Iconic is now explicitly per-jumper. Create or fill the profile for the currently focused jumper.'
        : 'There is no jumper to attach an Iconic profile to yet.',
      context: selectedJumper
        ? selectedIconicProfile
          ? 'Open the profile to keep preserved concept selections aligned with the jumper.'
          : 'Once a jumper exists, this becomes a direct setup step instead of a floating chain-wide system.'
        : 'Add a jumper first, then the Iconic workflow will know who it belongs to.',
      tone: selectedIconicProfile ? 'ready' : selectedJumper ? 'attention' : 'blocked',
      primaryAction: selectedIconicProfile
        ? {
            kind: 'link',
            label: 'Open Iconic',
            to: getBodymodPath(),
          }
        : selectedJumper
          ? {
              kind: 'button',
              label: 'Create Iconic',
              onClick: () => handleCreateIconic(),
            }
          : {
              kind: 'button',
              label: 'Create First Jumper',
              onClick: () => handleCreateJumper(),
            },
    },
    {
      id: 'participation',
      title: selectedJumper && currentJump ? `${selectedJumper.name} @ ${currentJump.title}` : 'Wire participation',
      description: selectedJumper && currentJump
        ? selectedParticipation
          ? 'A participation record exists for the focused jumper in the current jump.'
          : 'Create the participation record that holds perks, items, drawbacks, budgets, and jump-specific notes.'
        : selectedJumper
          ? hasJumps
            ? 'Pick the current jump first, then wire the focused jumper into it.'
            : 'Create a jump first, then add participation for the focused jumper.'
          : 'Participation needs both a jumper and a current jump.',
      context: selectedJumper && currentJump
        ? selectedParticipation
          ? 'Open the participation editor to keep imports, purchases, and narratives in sync.'
          : 'This is usually the last missing setup step before ordinary jump-by-jump editing feels smooth.'
        : 'This stays blocked until the chain has both a jumper focus and a current jump.',
      tone: selectedParticipation ? 'ready' : selectedJumper && currentJump ? 'attention' : 'blocked',
      primaryAction: selectedParticipation
        ? {
            kind: 'link',
            label: 'Open Participation',
            to: getParticipationPath(),
          }
        : selectedJumper && currentJump
          ? {
              kind: 'button',
              label: 'Add Participation',
              onClick: () => handleCreateParticipation(),
            }
          : hasJumpers
            ? {
                kind: 'link',
                label: 'Choose Current Jump',
                to: `/chains/${chainId}/jumps`,
              }
            : {
                kind: 'button',
                label: 'Create First Jumper',
                onClick: () => handleCreateJumper(),
              },
    },
  ];

  const readyStepCount = setupSteps.filter((step) => step.tone === 'ready').length;
  const nextSetupStep =
    setupSteps.find((step) => step.tone === 'attention') ??
    setupSteps.find((step) => step.tone === 'blocked') ??
    null;

  const workSurfaceCards = [
    {
      id: 'jumpers',
      title: selectedJumper ? `Focused Jumper: ${selectedJumper.name}` : 'Jumpers',
      description: selectedJumper
        ? 'Identity, background, and concept edits for the jumper currently driving Iconic and participation routes.'
        : 'Create and manage the chain’s character roster.',
      to: `/chains/${chainId}/jumpers${buildSearch(selectedJumperId)}`,
    },
    {
      id: 'jumps',
      title: currentJump ? `Current Jump: ${currentJump.title}` : 'Jumps',
      description: currentJump
        ? 'Ordering, duration, status, and jump-level context live here.'
        : 'Open the jump registry to create or choose the current jump.',
      to: getJumpEditorPath(),
    },
    {
      id: 'iconic',
      title: selectedJumper ? `Iconic: ${selectedJumper.name}` : 'Iconic',
      description: selectedJumper
        ? selectedIconicProfile
          ? 'The preserved concept sheet for the focused jumper.'
          : 'No Iconic profile exists yet for the focused jumper.'
        : 'Add a jumper first to unlock Iconic.',
      to: getBodymodPath(),
    },
    {
      id: 'participation',
      title: selectedJumper && currentJump ? `Participation: ${selectedJumper.name}` : 'Participation',
      description: selectedJumper && currentJump
        ? selectedParticipation
          ? `Open ${selectedJumper.name}'s live record inside ${currentJump.title}.`
          : `Create ${selectedJumper.name}'s participation record inside ${currentJump.title}.`
        : 'Needs both a jumper focus and a current jump.',
      to: getParticipationPath(),
    },
    {
      id: 'personal-reality',
      title: 'Personal Reality',
      description: 'Supplement budgeting, page-by-page purchases, and warehouse continuity.',
      to: `/chains/${chainId}/personal-reality`,
    },
    {
      id: 'rules',
      title: currentJump ? 'Current Jump Rules' : 'Chainwide Rules',
      description: currentJump
        ? 'Warehouse, powers, items, and supplement access for the active jump.'
        : 'Review baseline chain rules while the first jump is still being scaffolded.',
      to: currentJump ? `/chains/${chainId}/current-jump-rules` : `/chains/${chainId}/rules`,
    },
    {
      id: 'notes',
      title: 'Notes',
      description: 'Capture chain decisions, planning notes, and continuity reminders without leaving the workspace.',
      to: `/chains/${chainId}/notes`,
    },
    {
      id: 'recovery',
      title: 'Backups & Branches',
      description: 'Snapshots, branch switching, exports, and restore controls.',
      to: `/chains/${chainId}/backups`,
    },
  ];

  async function handleBranchChange(branchId: string) {
    try {
      await switchActiveBranch(chainId, branchId);
      setNotice({
        tone: 'success',
        message: 'Active branch updated.',
      });
    } catch (error) {
      setNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Unable to switch branches.',
      });
    }
  }

  async function handleJumpChange(jumpId: string | null) {
    try {
      await switchActiveJump(chainId, jumpId);
      setNotice({
        tone: 'success',
        message: 'Current jump selection updated.',
      });
    } catch (error) {
      setNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Unable to switch the current jump.',
      });
    }
  }

  return (
    <div className="stack">
      <WorkspaceModuleHeader
        title="Chain Overview"
        description="Setup dashboard for branch focus, current jump control, and the next chain actions that still matter."
        badge={`${readyStepCount}/${setupSteps.length} setup steps ready`}
        actions={
          <>
            <Link className="button button--secondary" to={`/chains/${chainId}/timeline`}>
              Open Timeline
            </Link>
            <Link className="button button--secondary" to={`/chains/${chainId}/backups`}>
              Backups & Branches
            </Link>
          </>
        }
      />

      <StatusNoticeBanner notice={notice} />

      <section className="grid grid--two">
        <article className="card stack">
          <div className="section-heading">
            <h3>Setup Snapshot</h3>
            <span className="pill pill--soft">{workspace.branches.length} branches</span>
          </div>
          <div className="inline-meta">
            <span className="metric">
              <strong>{workspace.jumpers.length}</strong>
              Jumpers
            </span>
            <span className="metric">
              <strong>{workspace.companions.length}</strong>
              Companions
            </span>
            <span className="metric">
              <strong>{workspace.jumps.length}</strong>
              Jumps
            </span>
            <span className="metric">
              <strong>{workspace.bodymodProfiles.length}</strong>
              Iconic Profiles
            </span>
            <span className="metric">
              <strong>{workspace.participations.length}</strong>
              Participations
            </span>
            <span className="metric">
              <strong>{workspace.snapshots.length}</strong>
              Snapshots
            </span>
          </div>
          <div className="guidance-strip guidance-strip--accent">
            <strong>{nextSetupStep ? 'Setup still in progress.' : 'Core setup is in place.'}</strong>
            <p>
              {nextSetupStep
                ? `${nextSetupStep.title}: ${nextSetupStep.description}`
                : 'Jumpers, jumps, current jump focus, Iconic, and participation are all represented for the current context.'}
            </p>
          </div>
          <p>
            Native format <strong>{bundle.chain.formatVersion}</strong> | updated {formatTimestamp(bundle.chain.updatedAt)}
          </p>
          <p>
            Narratives: <strong>{bundle.chain.chainSettings.narratives}</strong> | Alt forms:{' '}
            <strong>{bundle.chain.chainSettings.altForms ? 'enabled' : 'disabled'}</strong> | Bank:{' '}
            <strong>{bundle.chain.bankSettings.enabled ? 'enabled' : 'disabled'}</strong>
          </p>
        </article>

        <article className="card stack">
          <div className="section-heading">
            <h3>Active Context</h3>
            <span className="pill">{workspace.activeBranch?.title ?? 'No branch'}</span>
          </div>
          <label className="field">
            <span>Active branch</span>
            <select
              value={workspace.activeBranch?.id ?? ''}
              onChange={(event) => void handleBranchChange(event.target.value)}
            >
              {workspace.branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.title}
                </option>
              ))}
            </select>
            <small className="field-hint">Switching branches updates the entire workspace focus, including timeline, notes, and snapshots.</small>
          </label>
          <label className="field">
            <span>Focused jumper</span>
            <select value={selectedJumperId} onChange={(event) => handleFocusedJumperChange(event.target.value)} disabled={!hasJumpers}>
              {hasJumpers ? (
                workspace.jumpers.map((jumper) => (
                  <option key={jumper.id} value={jumper.id}>
                    {jumper.name}
                  </option>
                ))
              ) : (
                <option value="">Create a jumper first</option>
              )}
            </select>
            <small className="field-hint">
              {selectedJumper
                ? `Iconic and participation setup will follow ${selectedJumper.name}.`
                : 'Create the first jumper to unlock jumper-specific setup work.'}
            </small>
          </label>
          <label className="field">
            <span>Current jump</span>
            <select
              value={workspace.currentJump?.id ?? ''}
              onChange={(event) => void handleJumpChange(event.target.value || null)}
              disabled={!hasJumps}
            >
              <option value="">{hasJumps ? 'No current jump' : 'Create a jump first'}</option>
              {workspace.jumps.map((jump) => (
                <option key={jump.id} value={jump.id}>
                  {jump.orderIndex + 1}. {jump.title}
                </option>
              ))}
            </select>
            <small className="field-hint">
              {currentJump
                ? `${currentJump.title} is the active jump for rules, participation, and overview summaries.`
                : hasJumps
                  ? 'Pick which jump is currently in play so the rest of the workspace can follow it.'
                  : 'Create the first jump to unlock current-jump workflows.'}
            </small>
          </label>
        </article>
      </section>

      <section className="card stack">
        <div className="section-heading">
          <h3>Setup Checklist</h3>
          <span className="pill">{nextSetupStep ? 'Actionable' : 'Ready to work'}</span>
        </div>
        <div className="summary-grid">
          {setupSteps.map((step) => (
            <article key={step.id} className="summary-panel stack stack--compact">
              <div className="section-heading">
                <h4>{step.title}</h4>
                <span className={getStepPillClassName(step.tone)}>{getStepStatusLabel(step.tone)}</span>
              </div>
              <p>{step.description}</p>
              {step.context ? <p className="field-hint">{step.context}</p> : null}
              <div className="actions">
                {step.primaryAction.kind === 'link' ? (
                  <Link
                    className={step.tone === 'attention' ? 'button' : 'button button--secondary'}
                    to={step.primaryAction.to ?? `/chains/${chainId}/overview`}
                  >
                    {step.primaryAction.label}
                  </Link>
                ) : (
                  <button
                    className={step.tone === 'attention' ? 'button' : 'button button--secondary'}
                    type="button"
                    onClick={() => void step.primaryAction.onClick?.()}
                  >
                    {step.primaryAction.label}
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="card stack">
        <div className="section-heading">
          <h3>Continue Working</h3>
          <span className="pill">Context aware</span>
        </div>
        <div className="summary-grid">
          {workSurfaceCards.map((card) => (
            <Link key={card.id} className="selection-list__item" to={card.to}>
              <strong>{card.title}</strong>
              <span>{card.description}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid grid--two">
        <article className="card stack">
          <div className="section-heading">
            <h3>Current Jump Rules</h3>
            <span className="pill">{effectiveState.currentJump?.title ?? 'No jump'}</span>
          </div>
          {currentJump ? (
            <>
              <div className="inline-meta">
                <span className="metric">
                  <strong>{effectiveState.gauntlet ? 'Yes' : 'No'}</strong>
                  Gauntlet
                </span>
                <span className="metric">
                  <strong>{effectiveState.effectiveAccessModes.warehouseAccess}</strong>
                  Warehouse
                </span>
                <span className="metric">
                  <strong>{effectiveState.effectiveAccessModes.powerAccess}</strong>
                  Powers
                </span>
                <span className="metric">
                  <strong>{effectiveState.effectiveAccessModes.itemAccess}</strong>
                  Items
                </span>
              </div>
              <p>
                Alt forms: <strong>{effectiveState.effectiveAccessModes.altFormAccess}</strong> | Supplements:{' '}
                <strong>{effectiveState.effectiveAccessModes.supplementAccess}</strong>
              </p>
              <p>{effectiveState.contributingEffects.length} active scoped effects are contributing to this summary.</p>
              <Link className="button button--secondary" to={`/chains/${chainId}/current-jump-rules`}>
                Open Current Jump Rules
              </Link>
            </>
          ) : (
            <>
              <p>No current jump is selected yet.</p>
              <p className="field-hint">Choose the active jump above to unlock live rules context, participation focus, and jump-scoped summaries.</p>
              <Link className="button button--secondary" to={`/chains/${chainId}/jumps`}>
                Open Jumps
              </Link>
            </>
          )}
        </article>

        <article className="card stack">
          <div className="section-heading">
            <h3>Recovery Banner</h3>
            <span className="pill">{workspace.snapshots.length} snapshots</span>
          </div>
          {latestSnapshot ? (
            <>
              <p>
                Latest snapshot: <strong>{latestSnapshot.title}</strong>
              </p>
              <p>{latestSnapshot.description || 'No description recorded for this snapshot.'}</p>
              <p>Created {formatTimestamp(latestSnapshot.createdAt)}</p>
            </>
          ) : (
            <>
              <p>No snapshots exist for the active branch yet.</p>
              <p className="field-hint">Take a snapshot before major imports, branch experiments, or big editing sessions.</p>
            </>
          )}
          <Link className="button button--secondary" to={`/chains/${chainId}/backups`}>
            Open Recovery Tools
          </Link>
        </article>
      </section>
    </div>
  );
}
