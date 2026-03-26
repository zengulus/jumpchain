import { iconicBodymodModes } from '../../domain/common';
import { iconicSelectionKinds, type BodymodProfile, type IconicSelection } from '../../domain/bodymod/types';
import {
  ICONIC_TIER_CONFIGS,
  countFilledSelections,
  createBlankIconicSelection,
  getSelectionsForTier,
  isIconicTier,
  normalizeIconicTier,
} from './iconicSetup';
import { AssistiveHint, JsonEditorField } from '../workspace/shared';

export function IconicEditor(props: {
  profile: BodymodProfile;
  onChange: (nextProfile: BodymodProfile) => void;
  showAdvancedJson?: boolean;
}) {
  const activeTier = normalizeIconicTier(props.profile.mode);
  const tierConfig = ICONIC_TIER_CONFIGS[activeTier];
  const tierSelections = getSelectionsForTier(activeTier, props.profile.iconicSelections);
  const hasLegacyMode = !isIconicTier(props.profile.mode);

  function updateTier(nextTier: (typeof iconicBodymodModes)[number]) {
    props.onChange({
      ...props.profile,
      mode: nextTier,
      iconicSelections: getSelectionsForTier(nextTier, props.profile.iconicSelections),
    });
  }

  function updateSelection(index: number, updater: (selection: IconicSelection) => IconicSelection) {
    const nextSelections = getSelectionsForTier(activeTier, props.profile.iconicSelections).map((selection, selectionIndex) =>
      selectionIndex === index ? updater(selection) : selection,
    );

    props.onChange({
      ...props.profile,
      mode: activeTier,
      iconicSelections: nextSelections,
    });
  }

  return (
    <>
      <div className="guidance-strip guidance-strip--accent">
        <strong>Preserve the concept, not the austerity.</strong>
        <p>Iconic is here to keep a character recognisable through gauntlets, stripped-resource drawbacks, and setting changes.</p>
      </div>

      {hasLegacyMode ? (
        <div className="status status--warning">
          Legacy bodymod mode "{props.profile.mode}" was normalized to {tierConfig.title}. Pick an Iconic tier to make it explicit.
        </div>
      ) : null}

      <section className="stack">
        <div className="section-heading">
          <h4>Tier</h4>
          <span className="pill">{countFilledSelections(tierSelections)} / {tierConfig.slots.length} filled</span>
        </div>

        <div className="summary-grid">
          {iconicBodymodModes.map((tier) => {
            const config = ICONIC_TIER_CONFIGS[tier];

            return (
              <button
                key={tier}
                className={`selection-list__item${activeTier === tier ? ' is-active' : ''}`}
                type="button"
                onClick={() => updateTier(tier)}
              >
                <strong>{config.title}</strong>
                <span>{config.description}</span>
              </button>
            );
          })}
        </div>

        <div className="summary-panel stack stack--compact">
          <h4>{tierConfig.title}</h4>
          <p>{tierConfig.startingLevel}</p>
          <p>{tierConfig.progression}</p>
        </div>
      </section>

      <section className="stack">
        <div className="section-heading">
          <h4>Concept</h4>
        </div>

        <label className="field">
          <span>Concept summary</span>
          <input
            value={props.profile.summary}
            onChange={(event) =>
              props.onChange({
                ...props.profile,
                summary: event.target.value,
              })
            }
          />
        </label>

        <div className="field-grid field-grid--two">
          <label className="field">
            <span>Benchmark notes</span>
            <textarea
              rows={5}
              value={props.profile.benchmarkNotes}
              onChange={(event) =>
                props.onChange({
                  ...props.profile,
                  benchmarkNotes: event.target.value,
                })
              }
            />
          </label>
          <label className="field">
            <span>Interpretation notes</span>
            <textarea
              rows={5}
              value={props.profile.interpretationNotes}
              onChange={(event) =>
                props.onChange({
                  ...props.profile,
                  interpretationNotes: event.target.value,
                })
              }
            />
          </label>
        </div>
      </section>

      <section className="stack">
        <div className="section-heading">
          <h4>{tierConfig.title} package</h4>
          <span className="pill">{tierConfig.slots.length} slots</span>
        </div>

        <div className="selection-editor-list">
          {tierConfig.slots.map((slot, index) => {
            const selection = tierSelections[index] ?? createBlankIconicSelection(slot.defaultKind);

            return (
              <div className="selection-editor" key={`${activeTier}-${slot.label}`}>
                <div className="selection-editor__header">
                  <div className="stack stack--compact">
                    <strong>{slot.label}</strong>
                    <p className="editor-section__copy">{slot.hint}</p>
                  </div>
                  <span className="pill">{selection.kind}</span>
                </div>

                <div className="field-grid field-grid--three">
                  <label className="field">
                    <span>Kind</span>
                    <select
                      value={selection.kind}
                      onChange={(event) =>
                        updateSelection(index, (current) => ({
                          ...current,
                          kind: event.target.value as IconicSelection['kind'],
                        }))
                      }
                    >
                      {iconicSelectionKinds.map((kind) => (
                        <option key={kind} value={kind}>
                          {kind}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="field">
                    <span>Purchase title</span>
                    <input
                      value={selection.title}
                      onChange={(event) =>
                        updateSelection(index, (current) => ({
                          ...current,
                          title: event.target.value,
                        }))
                      }
                    />
                  </label>

                  <label className="field">
                    <span>Source</span>
                    <input
                      value={selection.source}
                      onChange={(event) =>
                        updateSelection(index, (current) => ({
                          ...current,
                          source: event.target.value,
                        }))
                      }
                    />
                  </label>
                </div>

                <label className="field">
                  <span>What this preserves</span>
                  <textarea
                    rows={4}
                    value={selection.summary}
                    onChange={(event) =>
                      updateSelection(index, (current) => ({
                        ...current,
                        summary: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>
            );
          })}
        </div>
      </section>

      {props.profile.forms.length > 0 ? (
        <section className="stack">
          <div className="section-heading">
            <h4>Preserved forms</h4>
            <span className="pill">{props.profile.forms.length}</span>
          </div>

          <div className="selection-editor-list">
            {props.profile.forms.map((form, index) => (
              <div className="selection-editor" key={form.sourceAltformId ?? `${form.name}-${index}`}>
                <div className="selection-editor__header">
                  <div className="stack stack--compact">
                    <strong>{form.name || `Form ${index + 1}`}</strong>
                    <p className="editor-section__copy">
                      {[form.species, form.sex].filter((entry) => entry.trim().length > 0).join(' - ') || 'Imported altform'}
                    </p>
                  </div>
                  <span className="pill">imported</span>
                </div>
                <p className="editor-section__copy">
                  {form.capabilities || form.physicalDescription || 'No imported form notes were preserved for this altform.'}
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {props.showAdvancedJson ? (
        <details className="details-panel">
          <summary className="details-panel__summary">
            <span>Advanced JSON editors</span>
            <span className="pill">legacy data and preserved imports</span>
          </summary>
          <div className="details-panel__body stack stack--compact">
            <AssistiveHint
              as="p"
              text="The structured Iconic editor above is the main surface. Use these JSON blocks for imported altforms, legacy data, and edge-case cleanup."
              triggerLabel="Explain advanced JSON editors"
            />
            <div className="field-grid field-grid--two">
              <JsonEditorField
                label="Iconic selections"
                value={props.profile.iconicSelections}
                onValidChange={(value) =>
                  props.onChange({
                    ...props.profile,
                    iconicSelections: Array.isArray(value) ? (value as IconicSelection[]) : [],
                  })
                }
              />
              <JsonEditorField
                label="Forms"
                value={props.profile.forms}
                onValidChange={(value) =>
                  props.onChange({
                    ...props.profile,
                    forms: Array.isArray(value) ? (value as typeof props.profile.forms) : [],
                  })
                }
              />
              <JsonEditorField
                label="Features"
                value={props.profile.features}
                onValidChange={(value) =>
                  props.onChange({
                    ...props.profile,
                    features: Array.isArray(value) ? (value as typeof props.profile.features) : [],
                  })
                }
              />
              <JsonEditorField
                label="Import source metadata"
                value={props.profile.importSourceMetadata}
                onValidChange={(value) =>
                  props.onChange({
                    ...props.profile,
                    importSourceMetadata:
                      typeof value === 'object' && value !== null && !Array.isArray(value)
                        ? (value as Record<string, unknown>)
                        : {},
                  })
                }
              />
            </div>
          </div>
        </details>
      ) : null}
    </>
  );
}
