import type { GeometryScene3D } from './geometry3dContract'
import { evaluateGeometryScene3D } from './geometry3dModel'

export default function GeometryScenePlaceholder({ scene }: { scene: GeometryScene3D }) {
  const result = evaluateGeometryScene3D(scene)
  return <div className="geometry-3d-placeholder" data-geometry-version="2" role="status">
    <strong>3D həndəsə səhnəsi</strong>
    <p>Bu, səhnə məlumatlarının yer tutucusudur. İnteraktiv 3D təsvir hələ əlçatan deyil.</p>
    <p>{scene.description}</p>
    <p>{scene.points.length} nöqtə · {scene.solids.length} cisim</p>
    {result.status === 'unavailable' && <p>Hesablama hələ əlçatan deyil: {result.capabilities.join(', ')}</p>}
    {result.status === 'invalid' && <p role="alert">Səhnənin hesablanması etibarsızdır.</p>}
  </div>
}
