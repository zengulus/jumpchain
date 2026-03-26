import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { UI_PREFERENCES_STORAGE_KEY, UiPreferencesProvider, useUiPreferences } from '../app/UiPreferencesContext';
import { AssistiveHint, TooltipFrame } from '../features/workspace/shared';

function PreferenceProbe() {
  const { simpleMode, setSimpleMode } = useUiPreferences();

  return (
    <div>
      <span data-testid="mode">{simpleMode ? 'simple' : 'advanced'}</span>
      <button type="button" onClick={() => setSimpleMode(!simpleMode)}>
        Toggle mode
      </button>
    </div>
  );
}

afterEach(() => {
  window.localStorage.clear();
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
    expect(window.localStorage.getItem(UI_PREFERENCES_STORAGE_KEY)).toBe('{"simpleMode":true}');

    firstRender.unmount();

    render(
      <UiPreferencesProvider>
        <PreferenceProbe />
      </UiPreferencesProvider>,
    );

    expect(screen.getByTestId('mode').textContent).toBe('simple');
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
