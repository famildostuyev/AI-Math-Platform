import type {GeometryPlane3D} from './geometry3dContract'

/** Routes to the editor's existing selected-object command, never a second delete path. */
export default function GeometryPlaneDeleteAction({selected,disabled,canDelete,onDelete}:{selected:GeometryPlane3D|null|undefined;disabled:boolean;canDelete:boolean;onDelete:(id:string)=>void}){
 if(!selected)return null
 const reason=disabled?'Müstəvinin redaktəsi hazırda əlçatan deyil.':!canDelete?'Müstəvi istinadlar və ya həndəsə qorunması səbəbindən silinə bilmir. Əlaqəli obyektləri yoxlayın.':null
 return <div data-plane-delete-target={selected.id}>
  <p>Seçilmiş müstəvi: <code>{selected.id}</code></p>
  <button type="button" disabled={disabled||!canDelete} aria-describedby={reason?`plane-delete-${selected.id}`:undefined} onClick={()=>{if(!disabled&&canDelete)onDelete(selected.id)}}>Müstəvini sil</button>
  {reason&&<p id={`plane-delete-${selected.id}`} role="status">{reason}</p>}
 </div>
}
