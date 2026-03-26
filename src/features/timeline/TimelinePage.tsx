import { Link } from 'react-router-dom';
import { useUiPreferences } from '../../app/UiPreferencesContext';
import { WorkspaceModuleHeader } from '../workspace/shared';
import { useChainWorkspace } from '../workspace/useChainWorkspace';

export function TimelinePage() {
  const { simpleMode } = useUiPreferences();
  const { chainId, workspace } = useChainWorkspace();

  return (
    <div className="stack">
      <WorkspaceModuleHeader
        title="Timeline"
        description={
          simpleMode
            ? 'A calmer read-through of the jump order, with extra history tucked behind Optional when you want it.'
            : 'Ordered jump sequence with branch forks, snapshot markers, and quick links back into editing modules.'
        }
        badge={`${workspace.jumps.length} jumps`}
      />

      {workspace.jumps.length === 0 ? (
        <section className="card stack">
          <h3>No jumps yet</h3>
          <p>Once jumps exist, this timeline will render their order along with branch and snapshot markers.</p>
        </section>
      ) : (
        <section className="timeline-list">
          {workspace.jumps.map((jump) => {
            const forkedBranches = workspace.branches.filter((branch) => branch.forkedFromJumpId === jump.id);
            const snapshots = workspace.snapshots.filter((snapshot) => snapshot.createdFromJumpId === jump.id);
            const participations = workspace.participations.filter((participation) => participation.jumpId === jump.id);
            const jumpNotes = workspace.notes.filter(
              (note) => note.ownerEntityType === 'jump' && note.ownerEntityId === jump.id,
            );

            return (
              <article className="card stack timeline-entry" key={jump.id}>
                <div className="section-heading">
                  <h3>
                    {jump.orderIndex + 1}. {jump.title}
                  </h3>
                  <span className="pill">
                    {jump.status} | {jump.jumpType}
                  </span>
                </div>

                {simpleMode ? (
                  <p>
                    {participations.length} participations, {forkedBranches.length + snapshots.length} history markers, and {jumpNotes.length} jump notes.
                  </p>
                ) : (
                  <div className="inline-meta">
                    <span className="metric">
                      <strong>{participations.length}</strong>
                      Participations
                    </span>
                    <span className="metric">
                      <strong>{forkedBranches.length}</strong>
                      Forked branches
                    </span>
                    <span className="metric">
                      <strong>{snapshots.length}</strong>
                      Snapshots
                    </span>
                    <span className="metric">
                      <strong>{jumpNotes.length}</strong>
                      Jump notes
                    </span>
                  </div>
                )}

                {simpleMode ? (
                  forkedBranches.length > 0 || snapshots.length > 0 ? (
                    <details className="details-panel">
                      <summary className="details-panel__summary">
                        <span>Markers and history</span>
                        <span className="pill">Optional</span>
                      </summary>
                      <div className="details-panel__body stack stack--compact">
                        {forkedBranches.length > 0 ? (
                          <div className="stack stack--compact">
                            <h4>Branch markers</h4>
                            <ul className="list">
                              {forkedBranches.map((branch) => (
                                <li key={branch.id}>
                                  <strong>{branch.title}</strong> forked here
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}

                        {snapshots.length > 0 ? (
                          <div className="stack stack--compact">
                            <h4>Snapshot markers</h4>
                            <ul className="list">
                              {snapshots.map((snapshot) => (
                                <li key={snapshot.id}>
                                  <strong>{snapshot.title}</strong>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </div>
                    </details>
                  ) : null
                ) : (
                  <>
                    {forkedBranches.length > 0 ? (
                      <div className="stack stack--compact">
                        <h4>Branch markers</h4>
                        <ul className="list">
                          {forkedBranches.map((branch) => (
                            <li key={branch.id}>
                              <strong>{branch.title}</strong> forked here
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {snapshots.length > 0 ? (
                      <div className="stack stack--compact">
                        <h4>Snapshot markers</h4>
                        <ul className="list">
                          {snapshots.map((snapshot) => (
                            <li key={snapshot.id}>
                              <strong>{snapshot.title}</strong>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </>
                )}

                {simpleMode ? (
                  <>
                    <div className="actions">
                      <Link className="button button--secondary" to={`/chains/${chainId}/jumps/${jump.id}`}>
                        Jump Detail
                      </Link>
                    </div>
                    <details className="details-panel">
                      <summary className="details-panel__summary">
                        <span>Related pages</span>
                        <span className="pill">Optional</span>
                      </summary>
                      <div className="details-panel__body actions">
                        <Link className="button button--secondary" to={`/chains/${chainId}/participation/${jump.id}`}>
                          Participation
                        </Link>
                      </div>
                    </details>
                  </>
                ) : (
                  <div className="actions">
                    <Link className="button button--secondary" to={`/chains/${chainId}/jumps/${jump.id}`}>
                      Jump Detail
                    </Link>
                    <Link className="button button--secondary" to={`/chains/${chainId}/participation/${jump.id}`}>
                      Participation
                    </Link>
                  </div>
                )}
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
