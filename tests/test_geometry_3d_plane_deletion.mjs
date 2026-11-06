import assert from 'node:assert/strict'
import {loadGeometryModule as load} from './geometry_test_modules.mjs'
import {printableComponent as component,requireFrontend} from './printable_test_modules.mjs'
const m=await load('geometry3dModel'),g=await load('geometry3dAuthoring'),plane=await load('geometry3dPlaneAuthoring'),constructed=await load('geometry3dConstructedPlaneAuthoring'),p=await load('geometry3dProjection'),n=await load('geometry3d'),ribbon=await load('geometryRibbonMenu')
const React=requireFrontend('react'),{renderToStaticMarkup}=requireFrontend('react-dom/server'),Action=component('GeometryPlaneDeleteAction').default
let source=plane.createPlaneAt3D(m.emptyGeometryScene3D(),[0,0,0],'XY','alpha').scene
source=m.transactGeometryScene3D(source,s=>s.points.push({id:'P',position:[0,0,2],label:'P'}));source=constructed.createParallelPlaneThroughPoint3D(source,'P',{kind:'plane',id:'alpha'},'beta').scene
const basis=['alpha_origin','alpha_x','alpha_y'],outputBasis=['beta_origin','beta_x','beta_y']
for(const id of ['alpha','beta']){
 let doc=source,commits=0;const history=m.createGeometryHistory3D(source,s=>{doc=s}),interaction=g.createAuthoringInteraction3D({getScene:()=>doc,getCamera:()=>doc.print_camera,commit:s=>history.commit(s),notify:()=>{}})
 // This is the same ID-based selection used by the existing object selector.
 interaction.select(id);assert.equal(interaction.snapshot().selected,id)
 const command=()=>{const result=g.deletePrimitive3D(doc,interaction.snapshot().selected);assert.ok(result);if(history.commit(result.scene)){commits++;interaction.select(null)}}
 const props={selected:doc.planes.find(p=>p.id===id),disabled:false,canDelete:!!g.deletePrimitive3D(doc,id),onDelete:target=>{if(interaction.snapshot().selected===target)command()}}
 const element=Action(props),button=element.props.children.find(c=>c?.type==='button'),html=renderToStaticMarkup(React.createElement(Action,props))
 assert.ok(html.includes(`data-plane-delete-target="${id}"`));assert.ok(html.includes(`<code>${id}</code>`));assert.ok(html.includes('Müstəvini sil'));assert.equal(button.props.disabled,false)
 button.props.onClick();assert.equal(commits,1);assert.ok(!doc.planes.some(p=>p.id===id));assert.ok(doc.planes.some(p=>p.id===(id==='alpha'?'beta':'alpha')))
 const deleted=id==='alpha'?basis:outputBasis;assert.ok(!doc.points.some(p=>deleted.includes(p.id)));assert.equal(doc.constructions.length,0)
 assert.deepEqual(doc.points,source.points.filter(p=>!deleted.includes(p.id)))
 assert.deepEqual(n.normalizeGeometryScene3D(JSON.parse(n.serializeGeometryScene3D(doc))),doc)
 for(const projection of ['orthographic','perspective']){const camera={...doc.print_camera,projection};const svg=p.geometrySceneSVG3D({...doc,print_camera:camera},800,600);for(const helper of deleted)assert.ok(!svg.includes(`data-id="${helper}"`));assert.ok(!p.scenePrimitives3D(doc).primitives.some(p=>p.kind==='point'&&deleted.includes(p.id)))}
 assert.ok(history.provider.undo());assert.deepEqual(doc,source);assert.ok(history.provider.redo());assert.ok(!doc.planes.some(p=>p.id===id));assert.equal(commits,1)
 // The existing ribbon routes to the same selected-object deletion command.
 assert.ok(history.provider.undo());interaction.select(id)
 const entry=ribbon.GEOMETRY_RIBBON.flatMap(c=>c.groups?.flatMap(g=>g.items)??[c]).find(i=>i.action3D==='delete')
 assert.ok(ribbon.runGeometryRibbonAction(entry,{dimension:3,commands:{id:'frame',tool:'select',disabled:false,canDelete:true,run:action=>{assert.equal(action,'delete');command()}}}));assert.equal(commits,2)
}
// Source deletion freezes a complete chain; deleting a frozen output also cleans its helpers.
let chain=m.transactGeometryScene3D(source,s=>s.points.push({id:'Q',position:[0,0,4],label:null}));chain=constructed.createParallelPlaneThroughPoint3D(chain,'Q',{kind:'plane',id:'beta'},'gamma').scene
const frozen=g.deletePrimitive3D(chain,'alpha');assert.ok(frozen);assert.ok(frozen.scene.constructions.some(c=>c.output_plane_id==='gamma'));assert.ok(!frozen.scene.constructions.some(c=>c.output_plane_id==='beta'));for(const id of [...outputBasis,'gamma_origin','gamma_x','gamma_y'])assert.deepEqual(frozen.scene.points.find(p=>p.id===id),chain.points.find(p=>p.id===id))
const removedFrozen=g.deletePrimitive3D(frozen.scene,'beta');assert.ok(removedFrozen);assert.ok(!removedFrozen.scene.points.some(p=>outputBasis.includes(p.id)));assert.ok(removedFrozen.scene.planes.some(p=>p.id==='gamma'));assert.equal(removedFrozen.scene.constructions.length,0)
// Preserve surviving direct references, but not unreferenced siblings or textual ID matches.
for(const kind of ['line','annotation','construction','marking','plane','face']){
 const referenced=m.transactGeometryScene3D(source,s=>{
  s.points.find(p=>p.id==='P').label='alpha_x'
  if(kind==='line')s.linear_objects.push({id:'line',kind:'segment',a:'alpha_origin',b:'P'})
  if(kind==='annotation')s.annotations.push({id:'note',content:'alpha_x',format:'text',anchor:{kind:'point',point_id:'alpha_origin'},offset_mm:[0,0]})
  if(kind==='construction'){s.points.push({id:'M',position:[0,0,1],label:null});s.constructions.push({id:'mid',kind:'midpoint',a:'alpha_origin',b:'P',output_point_id:'M'})}
  if(kind==='marking')s.markings.push({id:'length',kind:'length',point_ids:['alpha_origin','P'],label:null})
  if(kind==='plane'){s.points.push({id:'A',position:[1,0,0],label:null},{id:'B',position:[0,0,1],label:null});s.planes.push({id:'shared',point_ids:['alpha_origin','A','B']})}
  if(kind==='face'){s.points.push({id:'A',position:[1,0,0],label:null},{id:'B',position:[0,0,1],label:null});s.faces.push({id:'shared',boundary:['alpha_origin','A','B']})}
 });assert.ok(referenced,kind);const deleted=g.deletePrimitive3D(referenced,'alpha');assert.ok(deleted,kind);assert.ok(deleted.scene.points.some(p=>p.id==='alpha_origin'));assert.ok(!deleted.scene.points.some(p=>['alpha_x','alpha_y'].includes(p.id)));assert.equal(m.evaluateGeometryScene3D(deleted.scene).status,'ok')
}
// Ordinary authored defining points are not treated as internal helpers.
const legacy=m.transactGeometryScene3D(m.emptyGeometryScene3D(),s=>{s.points.push({id:'A',position:[0,0,0],label:'A'},{id:'B',position:[1,0,0],label:'B'},{id:'C',position:[0,1,0],label:'C'});s.planes.push({id:'legacy',point_ids:['A','B','C']})});assert.deepEqual(g.deletePrimitive3D(legacy,'legacy').scene.points,legacy.points)
// Preserve existing protection for constructed outputs with direct helper references.
const protectedScene=m.transactGeometryScene3D(source,s=>s.linear_objects.push({id:'protected',kind:'segment',a:'beta_origin',b:'P'}))
// beta_origin coincides with P, so use a nonzero shared-helper segment.
assert.equal(protectedScene,null)
const blocked=m.transactGeometryScene3D(source,s=>s.linear_objects.push({id:'protected',kind:'segment',a:'beta_x',b:'P'}));assert.ok(blocked);assert.equal(g.deletePrimitive3D(blocked,'beta'),null)
let calls=0;const blockedProps={selected:blocked.planes.find(p=>p.id==='beta'),disabled:false,canDelete:false,onDelete:()=>calls++},blockedElement=Action(blockedProps),blockedButton=blockedElement.props.children.find(c=>c?.type==='button'),blockedHTML=renderToStaticMarkup(React.createElement(Action,blockedProps));assert.equal(blockedButton.props.disabled,true);assert.match(blockedHTML,/role="status"/);assert.match(blockedHTML,/aria-describedby=/);blockedButton.props.onClick();assert.equal(calls,0)
const disabledElement=Action({...blockedProps,canDelete:true,disabled:true});disabledElement.props.children.find(c=>c?.type==='button').props.onClick();assert.equal(calls,0);assert.equal(Action({...blockedProps,selected:null}),null)
console.log('PASS: plane-specific Properties action/identity/disabled state, object selection, shared ribbon deletion, source freeze/helper cleanup, referenced helpers, protected outputs, history, serialization and both SVG projections')
