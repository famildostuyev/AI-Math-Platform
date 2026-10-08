import { useContext, useState } from 'react'
import type { GeometryTextV1, InlineNode } from '../api/questionEditor'
import MathLiveField from './MathLiveField'
import { annotationRuns, annotationSource } from './geometryAnnotationModel'
import { UniversalEditorSessionContext } from './universalEditorSession'

export default function GeometryAnnotationEditor({text,onSave,onCancel,disabled}:{text:GeometryTextV1;onSave:(text:GeometryTextV1)=>boolean;onCancel:()=>void;disabled:boolean}){
  const session=useContext(UniversalEditorSessionContext)
  const [runs,setRuns]=useState<InlineNode[]>(annotationRuns(text)),[error,setError]=useState(false)
  return <div data-geometry-annotation-editor="" data-frame-chrome="" onPointerDown={e=>e.stopPropagation()} onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();onCancel()}}}>
    {runs.map((r,i)=><div key={i}>
      {r.type==='text'?<textarea aria-label={`Annotation text ${i+1}`} onFocus={()=>session?.history.activate(null)} disabled={disabled} value={r.text} onChange={e=>setRuns(runs.map((run,j)=>i===j?{type:'text',text:e.target.value,marks:[]}:run))}/>:
       r.type==='inline_math'?<MathLiveField disabled={disabled} compact value={r.latex} ariaLabel={`Annotation math ${i+1}`} onChange={latex=>setRuns(runs.map((run,j)=>i===j?{type:'inline_math',latex}:run))}/>:<br/>}
      <button type="button" disabled={disabled} onClick={()=>setRuns(runs.filter((_,j)=>j!==i))}>Remove run</button>
    </div>)}
    <button type="button" disabled={disabled||runs.length>=64} onClick={()=>setRuns([...runs,{type:'text',text:'',marks:[]}])}>Add text</button>
    <button type="button" disabled={disabled||runs.length>=64} onClick={()=>setRuns([...runs,{type:'inline_math',latex:''}])}>Add math</button>
    <button type="button" disabled={disabled} onClick={()=>{
      const kept=runs.filter(r=>r.type==='hard_break'||(r.type==='text'?r.text.length:r.latex.length)),content=annotationSource(kept)
      const candidate=JSON.stringify(kept)===JSON.stringify(annotationRuns(text))?text
        :!text.runs&&kept.length===1&&kept[0].type==='text'?{...text,content}
        :{...text,runs:kept,content,layout_width:text.layout_width??50}
      setError(!onSave(candidate))
    }}>Apply annotation</button>
    <button type="button" onClick={onCancel}>Cancel annotation</button>
    {error&&<p role="status">Enter non-empty text/math within the annotation limits.</p>}
  </div>
}
