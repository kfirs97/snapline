export interface SnapSettings {
  /** A preset name (see webview BACKGROUNDS) or a custom "#rrggbb" color (Pro). */
  background: string;
  padding: number;
  lineNumbers: boolean;
  windowControls: boolean;
  showTitle: boolean;
  /** Only honored for Pro; free snaps always show the watermark. */
  watermark: boolean;
  scale: number;
}

export const DEFAULT_SETTINGS: SnapSettings = {
  background: 'dusk',
  padding: 56,
  lineNumbers: false,
  windowControls: true,
  showTitle: true,
  watermark: true,
  scale: 2,
};

export type ToWebview =
  | { type: 'init'; settings: SnapSettings; pro: boolean }
  | { type: 'pro'; pro: boolean }
  | { type: 'code'; text: string; fileName: string; startLine: number; languageId: string };

export type FromWebview =
  | { type: 'ready' }
  | { type: 'settings'; settings: SnapSettings }
  | { type: 'pasted'; highlighted: boolean }
  | { type: 'save'; dataUrl: string }
  | { type: 'copied' }
  | { type: 'copyFallback'; dataUrl: string }
  | { type: 'getPro'; feature: string }
  | { type: 'error'; message: string };
