import type { GeometryScene3D } from './geometry3dContract'
import GeometrySceneViewport from './GeometrySceneViewport'
import { useContext } from 'react'
import { UniversalEditorSessionContext } from './universalEditorSession'

/** Preserve the frame's session view on Apply; print/export still uses print_camera. */
export default function GeometryScenePlaceholder({ scene, targetId }: { scene: GeometryScene3D; targetId?:string }) {
  const session=useContext(UniversalEditorSessionContext)
  const camera=targetId?session?.geometry3DCameras.current.get(targetId)??scene.print_camera:scene.print_camera
  return <GeometrySceneViewport scene={scene} camera={camera} />
}
