import type { UniversalVisualPlacement, UniversalVisualPosition, UniversalVisualSize } from './universalEditorDocument'

/** Persisted subset of the existing generic placement foundation, at 100% zoom. */
export type PersistedVisualPlacement = UniversalVisualPlacement & {
  version: 1
  layoutMode: 'floating'
  anchor: { kind: 'document' }
  position: UniversalVisualPosition & { unit: 'px' }
  size: UniversalVisualSize & { unit: 'px' }
}

export const FRAME_MINIMUM = { width: 160, height: 120 } as const
export const FRAME_PADDING = 16
export const FRAME_HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const
export type FrameHandle = typeof FRAME_HANDLES[number]

export function resizeVisualPlacement(start: PersistedVisualPlacement, handle: FrameHandle,
  dx: number, dy: number, minimum: { width: number; height: number }): PersistedVisualPlacement {
  const west = handle.includes('w'), north = handle.includes('n')
  const width = handle === 'n' || handle === 's' ? start.size.width
    : Math.max(minimum.width, start.size.width + (west ? -dx : dx))
  const height = handle === 'e' || handle === 'w' ? start.size.height
    : Math.max(minimum.height, start.size.height + (north ? -dy : dy))
  return { ...start,
    position: { ...start.position,
      x: west ? Math.max(0, start.position.x + start.size.width - width) : start.position.x,
      y: north ? Math.max(0, start.position.y + start.size.height - height) : start.position.y },
    size: { ...start.size, width, height } }
}
