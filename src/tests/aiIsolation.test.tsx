import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { PlayPage } from '../features/ai/PlayPage';
import { setAiEnabled } from '../app/operatingMode';
import { api } from '../features/ai/client';
import { buildBranchWorkspace } from '../domain/chain/selectors';
import { aiFixture } from './aiFixture';
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('renders Sheet Only and evaluates tracker state offline without any AI service calls',async()=>{
  setAiEnabled(false);
  const fetch=vi.fn(()=>{throw new Error('No network, models, or service');});vi.stubGlobal('fetch',fetch);
  render(<PlayPage/>);expect(screen.getByRole('heading',{name:'Your tracker is ready'})).toBeDefined();
  const {bundle,campaign}=aiFixture();expect(buildBranchWorkspace(bundle,campaign.branchId).currentJump?.id).toBe(campaign.state.scene.stamp.jumpId);
  await expect(api('/config')).rejects.toThrow(/AI is disabled/);expect(fetch).not.toHaveBeenCalled();
});
