// ============================================================================
// InfiniteCanvasApp.tsx — Barrel Re-export
//
// All canvas architecture now lives in modular files under src/canvas/.
// This file exists solely to preserve the existing import path used by
// BrinkDashboard.tsx:  import { BoardEditor } from './InfiniteCanvasApp';
// ============================================================================

export { BoardEditor } from './canvas/components/BoardEditor';
export type { ToolType } from './canvas/CanvasEngine';