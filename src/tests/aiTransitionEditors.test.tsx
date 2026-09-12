import React from 'react';
import { afterEach,it,expect,vi } from 'vitest';
import { cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react';
import { NpcEditor,SceneEditor } from '../features/ai/editors';
import { NpcSchema, type CampaignOperation } from '../ai/schema';
import { planTransition } from '../ai/transitions';
import { aiFixture } from './aiFixture';
afterEach(cleanup);
it('submits NPC editor changes as operations without mutating loaded campaign state',async()=>{
  const {bundle,campaign}=aiFixture();campaign.state.npcs=[NpcSchema.parse({id:'npc',name:'Minerva',background:'Professor',goals:['Teach']})];const before=structuredClone(campaign.state);
  const onSave=vi.fn(async(_operations:CampaignOperation[])=>{});render(<NpcEditor campaign={campaign} bundle={bundle} onSave={onSave}/>);
  fireEvent.change(screen.getByLabelText('Select NPC'),{target:{value:'npc'}});
  fireEvent.change(screen.getByLabelText('suspicions'),{target:{value:'The Jumper can fly'}});fireEvent.click(screen.getByText('Save NPC'));
  await waitFor(()=>expect(onSave).toHaveBeenCalledTimes(1));const operations=onSave.mock.calls[0][0];expect(operations).toHaveLength(1);
  const plan=planTransition(campaign.state,operations,{origin:'player-edit',campaign,bundle},'edit');expect(plan.after.npcs[0]).toEqual({...before.npcs[0],suspicions:['The Jumper can fly']});expect(campaign.state).toEqual(before);
});
it('submits scene corrections through the same typed player adapter',async()=>{
  const {bundle,campaign}=aiFixture();const before=structuredClone(campaign.state);const onSave=vi.fn(async(_operations:CampaignOperation[])=>{});
  render(<SceneEditor campaign={campaign} bundle={bundle} onSave={onSave}/>);fireEvent.change(screen.getByLabelText('Location'),{target:{value:'Great Hall'}});fireEvent.click(screen.getByText('Save scene'));
  await waitFor(()=>expect(onSave).toHaveBeenCalledTimes(1));expect(onSave.mock.calls[0][0]).toEqual([{kind:'scene.correct',value:{...before.scene,location:'Great Hall'}}]);expect(campaign.state).toEqual(before);
});
