import { describe, expect, it } from 'vitest';
import {
  createParticipationGuideKey,
  createSimpleModePageGuideState,
  getFirstIncompleteGuideStep,
  readGuideRequested,
  updateGuideSearchParams,
} from '../features/workspace/simpleModeGuides';

describe('simple mode guide helpers', () => {
  it('builds stable participation guide keys from jump and participant ids', () => {
    expect(createParticipationGuideKey('jump-1', 'jumper-2')).toBe('jump-1:jumper-2');
  });

  it('adds and removes the guide query param without dropping other params', () => {
    const params = new URLSearchParams('panel=participation&participant=abc');
    const requestedParams = updateGuideSearchParams(params, true);
    const clearedParams = updateGuideSearchParams(requestedParams, false);

    expect(readGuideRequested(requestedParams)).toBe(true);
    expect(clearedParams.get('panel')).toBe('participation');
    expect(clearedParams.get('participant')).toBe('abc');
    expect(clearedParams.get('guide')).toBeNull();
  });

  it('prefers the stored current step when that step is still incomplete', () => {
    const guideState = createSimpleModePageGuideState('purchases');

    expect(
      getFirstIncompleteGuideStep(['beginnings', 'purchases', 'wrap-up'], guideState, (stepId) => stepId === 'beginnings'),
    ).toBe('purchases');
  });

  it('falls back to the first incomplete step when the stored current step is already done', () => {
    const guideState = createSimpleModePageGuideState('beginnings');

    expect(
      getFirstIncompleteGuideStep(['beginnings', 'purchases', 'wrap-up'], guideState, (stepId) => stepId === 'beginnings'),
    ).toBe('purchases');
  });
});
