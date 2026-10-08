import type { GeometryTextV1 } from '../api/questionEditor'
import MathContent from './MathContent'
import { annotationRuns } from './geometryAnnotationModel'

export default function GeometryAnnotationContent({text}:{text:GeometryTextV1}) {
  return <div className="geometry-annotation-content" style={{font:'4px Arial',lineHeight:1.65,whiteSpace:'pre-wrap',overflowWrap:'anywhere',color:'#111827'}}>
    {annotationRuns(text).map((run,i)=>run.type==='hard_break'?<br key={i}/>:run.type==='text'?<span key={i}>{run.text}</span>:
      <MathContent key={i} fallbackText={run.latex} content={{format_version:1,segments:[{type:'math',latex:run.latex,source_text:run.latex,display_mode:false}]}}/>)}
  </div>
}
