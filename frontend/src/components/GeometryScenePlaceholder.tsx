import type { GeometryScene3D } from './geometry3dContract'
import GeometrySceneViewport from './GeometrySceneViewport'

/** Retains the M1 integration entry point; M2 displays the saved-camera SVG preview. */
export default function GeometryScenePlaceholder({ scene }: { scene: GeometryScene3D }) {
  return <GeometrySceneViewport scene={scene} camera={scene.print_camera} />
}
