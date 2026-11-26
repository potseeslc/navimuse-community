import React from "react";

// App owns the queue and audio nodes above this boundary. Retrying a screen
// remounts only its presentation, so a render failure cannot tear down playback.
export class SurfaceRecoveryBoundary extends React.Component {
  state = { failed: false, attempt: 0 };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <section className="surface-recovery" role="alert">
          <p className="eyebrow">NaviMuse</p>
          <h2>This screen could not load</h2>
          <p>
            Your queue is still here. Retry this screen or use the navigation to
            continue.
          </p>
          <button
            type="button"
            onClick={() =>
              this.setState((state) => ({
                failed: false,
                attempt: state.attempt + 1,
              }))
            }
          >
            Retry screen
          </button>
        </section>
      );
    return (
      <React.Fragment key={this.state.attempt}>
        {this.props.children}
      </React.Fragment>
    );
  }
}
