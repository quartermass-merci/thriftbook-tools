import { Component, type ReactNode } from 'react'

/** Stops one bad render (e.g. a malformed item) from white-screening the whole UI. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidCatch(error: Error) {
    console.error('[tbw] UI render error:', error)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="mx-auto mt-16 max-w-md rounded-lg border border-line bg-surface p-6 text-center font-sans text-ink">
        <h1 className="font-display text-xl font-bold">This view hit a snag</h1>
        <p className="mt-2 text-[15px] text-muted">
          Something crashed while rendering. Your saved wishlist data is untouched — reloading usually fixes it.
        </p>
        <p className="mt-2 truncate text-[13px] text-faint" title={this.state.error.message}>{this.state.error.message}</p>
        <button onClick={() => location.reload()} className="mt-4 rounded bg-teal-700 px-4 py-2 text-[15px] font-medium text-white hover:opacity-90">
          Reload
        </button>
      </div>
    )
  }
}
