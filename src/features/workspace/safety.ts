import { createSnapshotForBranch } from '../../db/persistence';

function toSafetySnapshotTitle(actionLabel: string) {
  return `Safety Snapshot: ${actionLabel}`;
}

function toSafetySnapshotDescription(actionLabel: string, details?: string) {
  const parts = [`Automatic checkpoint created before ${actionLabel.toLowerCase()}.`];

  if (details && details.trim().length > 0) {
    parts.push(details.trim());
  }

  return parts.join(' ');
}

export async function createSafetySnapshot(input: {
  chainId: string;
  branchId: string;
  actionLabel: string;
  details?: string;
}) {
  return createSnapshotForBranch(
    input.chainId,
    input.branchId,
    toSafetySnapshotTitle(input.actionLabel),
    toSafetySnapshotDescription(input.actionLabel, input.details),
  );
}
