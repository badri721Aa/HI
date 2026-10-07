"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Rendered instead of the children after an error. Default: nothing. */
  fallback?: ReactNode;
  onError?: (error: unknown) => void;
}

/**
 * Error boundary for the 3D layer: a failing shader, a lost context or a
 * three.js bug must never take the page down with it. The page keeps its
 * DOM content; the scene is replaced by its fallback (or nothing).
 */
export class ThreeBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    if (process.env.NODE_ENV !== "production") console.error("[3d] scene failed", error, info.componentStack);
    this.props.onError?.(error);
  }

  render() {
    return this.state.failed ? (this.props.fallback ?? null) : this.props.children;
  }
}
