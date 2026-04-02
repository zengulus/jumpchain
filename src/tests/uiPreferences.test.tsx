import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { UI_PREFERENCES_STORAGE_KEY, UiPreferencesProvider, useUiPreferences } from '../app/UiPreferencesContext';
import { AssistiveHint, TooltipFrame } from '../features/workspace/shared';

const localStorageState = new Map<string, string>();

beforeEach(() => {
  localStorageState.clear();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => localStorageState.get(key) ?? null,
      setItem: (key: string, value: string) => {
        localStorageState.set(key, String(value));
      },
      removeItem: (key: string) => {
        localStorageState.delete(key);
      },
      clear: () => {
        localStorageState.clear();
      },
    },
  });
});

function PreferenceProbe() {
  const {
    simpleMode,
    setSimpleMode,
    lastVisitedChainId,
    getLastChainRoute,
    recordLastChainRoute,
    getOverviewGuideState,
  } = useUiPreferences();
  const overviewGuideState = getOverviewGuideState('chain-1:branch-1');

  return (
    <div>
      <span data-testid="mode">{simpleMode ? 'simple' : 'advanced'}</span>
      <span data-testid="last-chain">{lastVisitedChainId ?? 'none'}</span>
      <span data-testid="last-route">{getLastChainRoute('chain-1')}</span>
      <span data-testid="overview-step">{overviewGuideState.currentStepId ?? 'none'}</span>
      <span data-testid="overview-prompt">{overviewGuideState.promptState}</span>
      <span data-testid="overview-iconic">{overviewGuideState.iconicDecision}</span>
      <button type="button" onClick={() => setSimpleMode(!simpleMode)}>
        Toggle mode
      </button>
      <button type="button" onClick={() => recordLastChainRoute('chain-1', '/chains/chain-1/jumps/jump-2?participant=jumper-1')}>
        Remember route
      </button>
    </div>
  );
}

afterEach(() => {
  window.localStorage.clear();
  cleanup();
});

describe('UI preferences', () => {
  it('defaults to advanced mode when no saved preference exists', () => {
    render(
      <UiPreferencesProvider>
        <PreferenceProbe />
      </UiPreferencesProvider>,
    );

    expect(screen.getByTestId('mode').textContent).toBe('advanced');
  });

  it('persists and restores simple mode from localStorage', () => {
    const firstRender = render(
      <UiPreferencesProvider>
        <PreferenceProbe />
      </UiPreferencesProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Toggle mode' }));

    expect(screen.getByTestId('mode').textContent).toBe('simple');
    expect(JSON.parse(window.localStorage.getItem(UI_PREFERENCES_STORAGE_KEY) ?? '{}')).toEqual({
      simpleMode: true,
      simpleModeGuideRegistry: {
        branch: {},
        chain: {},
      },
      lastVisitedChainId: null,
      lastChainRouteByChain: {},
    });

    firstRender.unmount();

    render(
      <UiPreferencesProvider>
        <PreferenceProbe />
      </UiPreferencesProvider>,
    );

    expect(screen.getByTestId('mode').textContent).toBe('simple');
  });

  it('migrates legacy wizard storage into the overview guide registry', () => {
    window.localStorage.setItem(
      UI_PREFERENCES_STORAGE_KEY,
      JSON.stringify({
        simpleMode: true,
        simpleModeWizardByChain: {
          'chain-1:branch-1': {
            jumperWizardCompleted: true,
            guidedJumpCount: 1,
            wizardPromptState: 'dismissed',
            iconicDecision: 'yes',
            cosmicBackpackDecision: 'not-now',
            lastSupplementPromptJumpCount: 2,
          },
        },
      }),
    );

    render(
      <UiPreferencesProvider>
        <PreferenceProbe />
      </UiPreferencesProvider>,
    );

    expect(screen.getByTestId('mode').textContent).toBe('simple');
    expect(screen.getByTestId('overview-step').textContent).toBe('participation');
    expect(screen.getByTestId('overview-prompt').textContent).toBe('dismissed');
    expect(screen.getByTestId('overview-iconic').textContent).toBe('yes');
  });

  it('falls back safely when the stored preference is invalid', () => {
    window.localStorage.setItem(UI_PREFERENCES_STORAGE_KEY, '{"simpleMode":"yes"}');

    render(
      <UiPreferencesProvider>
        <PreferenceProbe />
      </UiPreferencesProvider>,
    );

    expect(screen.getByTestId('mode').textContent).toBe('advanced');
  });

  it('persists and restores the last visited chain route', () => {
    const firstRender = render(
      <UiPreferencesProvider>
        <PreferenceProbe />
      </UiPreferencesProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remember route' }));

    expect(screen.getByTestId('last-chain').textContent).toBe('chain-1');
    expect(screen.getByTestId('last-route').textContent).toBe('/chains/chain-1/jumps/jump-2?participant=jumper-1');
    expect(JSON.parse(window.localStorage.getItem(UI_PREFERENCES_STORAGE_KEY) ?? '{}')).toMatchObject({
      lastVisitedChainId: 'chain-1',
      lastChainRouteByChain: {
        'chain-1': '/chains/chain-1/jumps/jump-2?participant=jumper-1',
      },
    });

    firstRender.unmount();

    render(
      <UiPreferencesProvider>
        <PreferenceProbe />
      </UiPreferencesProvider>,
    );

    expect(screen.getByTestId('last-chain').textContent).toBe('chain-1');
    expect(screen.getByTestId('last-route').textContent).toBe('/chains/chain-1/jumps/jump-2?participant=jumper-1');
  });
});

describe('assistive hints', () => {
  it('renders tooltip triggers in advanced mode', () => {
    const view = render(
      <UiPreferencesProvider>
        <div className="field-label-row">
          <span>Core mode</span>
          <AssistiveHint text="Pick the budget model that fits the chain." triggerLabel="Explain core mode" />
        </div>
      </UiPreferencesProvider>,
    );

    const trigger = screen.getByRole('button', { name: 'Explain core mode' });
    const tooltip = screen.getByRole('tooltip');

    expect(view.container.querySelector('.assistive-hint__trigger')).not.toBeNull();
    expect(view.container.querySelector('.field-hint')).toBeNull();
    expect(trigger.getAttribute('aria-describedby')).toBe(tooltip.id);
    expect(tooltip.textContent).toBe('Pick the budget model that fits the chain.');
  });

  it('renders inline helper text in simple mode', () => {
    window.localStorage.setItem(UI_PREFERENCES_STORAGE_KEY, '{"simpleMode":true}');

    const view = render(
      <UiPreferencesProvider>
        <div className="field-label-row">
          <span>Core mode</span>
          <AssistiveHint text="Pick the budget model that fits the chain." triggerLabel="Explain core mode" />
        </div>
      </UiPreferencesProvider>,
    );

    expect(view.container.querySelector('.assistive-hint__trigger')).toBeNull();
    expect(screen.getByText('Pick the budget model that fits the chain.')).toBeTruthy();
  });

  it('applies explicit placement classes for rail tooltips', () => {
    const view = render(
      <UiPreferencesProvider>
        <TooltipFrame tooltip="Use this rail to move through modules." placement="right">
          <button type="button">Navigator</button>
        </TooltipFrame>
      </UiPreferencesProvider>,
    );

    const trigger = screen.getByRole('button', { name: 'Navigator' });

    expect(view.container.querySelector('.tooltip-frame--placement-right')).not.toBeNull();
    expect(trigger.getAttribute('aria-describedby')).toBeTruthy();
  });
});
