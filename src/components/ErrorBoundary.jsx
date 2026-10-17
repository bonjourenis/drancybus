'use client';

import { Component } from 'react';

/**
 * Keeps a rendering error in one section (typically the map) from blanking
 * the whole page.
 */
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[ui] render error:', error, info?.componentStack);
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <div className="bg-red-50 dark:bg-red-900/20 p-6 rounded-xl border border-red-200 dark:border-red-800">
          <p className="text-red-700 dark:text-red-300 mb-3">
            {this.props.fallbackMessage ?? 'Une erreur est survenue dans cette section.'}
          </p>
          <button
            onClick={this.reset}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            Réessayer
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
