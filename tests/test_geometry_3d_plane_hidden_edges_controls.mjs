import assert from 'node:assert/strict'
import {printableComponent as load,requireFrontend} from './printable_test_modules.mjs'
const React=requireFrontend('react'),{renderToStaticMarkup}=requireFrontend('react-dom/server'),THREE=requireFrontend('three')
const Controls=load('GeometryPlaneControls').default,m=load('geometry3dModel'),a=load('geometry3dConstructedPlaneAuthoring'),plane=load('geometry3dPlaneAuthoring'),g=load('geometry3dAuthoring'),p=load('geometry3dProjection'),n=load('geometry3d'),print=load('printableDocumentModel'),{populateGeometrySceneViewport3D:populate}=load('GeometrySceneViewport')
const label='Gizli sərhədləri göstər',orientationLabel='İstiqaməti redaktə et'
function render(props){
 let tree
 function Capture(){tree=Controls(props);return tree}
 const html=renderToStaticMarkup(React.createElement(Capture)),nodes=[]
 function visit(e){if(!React.isValidElement(e))return;nodes.push(e);React.Children.forEach(e.props.children,visit)}visit(tree)
 return {html,nodes,checkbox:nodes.find(e=>e.type==='input'&&e.props.type==='checkbox'&&e.props['aria-label']===label)}
}
let source=plane.createPlaneAt3D(m.emptyGeometryScene3D(),[0,0,0],'XY','alpha').scene
source=plane.resizePlaneDisplay3D(source,'alpha',2,2)
source=m.transactGeometryScene3D(source,s=>{s.points.push({id:'P',position:[0,0,4],label:null,visibility:'hidden'},{id:'Q',position:[1,0,4],label:null,visibility:'hidden'});s.linear_objects.push({id:'pq',kind:'segment',a:'P',b:'Q'})})
let doc=a.createPerpendicularPlaneThroughPoint3D(source,'P',{kind:'plane',id:'alpha'},.4,'beta').scene
doc=m.transactGeometryScene3D(doc,s=>{Object.assign(s.planes.find(q=>q.id==='beta').display,{stroke:{color:'#123ABC',width:3,style:'dotted'},intersection_mode:'cross',shape:'parallelogram',skew:.2,lower_portion:'both',intersection_visibility:'hidden'});s.print_camera={...s.print_camera,position:[8,-10,12],target:[0,0,0],vertical_span:24}})
const initial=structuredClone(doc),basis=initial.planes.find(q=>q.id==='beta'),selectedId='beta'
let interaction,commits=0
const history=m.createGeometryHistory3D(doc,next=>{doc=next;interaction?.sync()})
interaction=g.createAuthoringInteraction3D({getScene:()=>doc,getCamera:()=>doc.print_camera,commit:s=>history.commit(s),notify:()=>{}})
interaction.select(selectedId)
const props=()=>({scene:doc,selected:doc.planes.find(q=>q.id===interaction.snapshot().selected)??null,disabled:false,onCommit:next=>{commits++;interaction.cancel();assert.ok(history.commit(next))},onEditOrientation:id=>assert.ok(interaction.editPlaneOrientation(id))})
const current=()=>render(props())
function check(value){
 const result=current();assert.ok(result.checkbox);assert.equal(result.checkbox.props.checked,value);assert.ok(result.html.includes(label));assert.equal(interaction.snapshot().selected,selectedId)
 const selected=doc.planes.find(q=>q.id===selectedId),{show_hidden_edges:unused,...rest}=selected.display
 assert.deepEqual({...selected,display:rest},basis)
 assert.deepEqual(doc.points,initial.points);assert.deepEqual(doc.constructions,initial.constructions);assert.deepEqual(doc.print_camera,initial.print_camera)
 return result
}
check(true).checkbox.props.onChange({target:{checked:true}})
assert.equal(commits,0);assert.equal(history.provider.getSnapshot(),0);assert.equal(doc.planes.find(q=>q.id===selectedId).display.show_hidden_edges,undefined)
const enabledSVG=p.geometrySceneSVG3D(doc,800,600)
assert.match(enabledSVG,/<path data-id="beta" data-plane-boundary="hidden"/)
check(true).checkbox.props.onChange({target:{checked:false}})
assert.equal(commits,1);check(false);assert.equal(doc.planes.find(q=>q.id===selectedId).display.show_hidden_edges,false)
const disabled=structuredClone(doc),disabledSVG=p.geometrySceneSVG3D(doc,800,600)
assert.ok(!disabledSVG.includes('data-id="beta" data-plane-boundary="hidden"'))
assert.notEqual(disabledSVG,enabledSVG)
const group=new THREE.Group();populate(group,doc,doc.print_camera,800,600,new Set([selectedId]))
assert.ok(!group.children.some(o=>o.userData.semanticId===selectedId&&o.userData.planeBoundaryVisibility==='hidden'))
assert.ok(group.children.some(o=>o.userData.semanticId===selectedId&&o.userData.planeBoundaryVisibility==='visible'))
const flags=history.provider.getSnapshot();check(false).checkbox.props.onChange({target:{checked:false}});assert.equal(commits,1);assert.equal(history.provider.getSnapshot(),flags)
assert.ok(history.provider.undo());assert.deepEqual(doc,initial);check(true)
const redoFlags=history.provider.getSnapshot();current().checkbox.props.onChange({target:{checked:true}});assert.equal(commits,1);assert.equal(history.provider.getSnapshot(),redoFlags)
assert.ok(history.provider.redo());assert.deepEqual(doc,disabled);check(false);assert.equal(p.geometrySceneSVG3D(doc,800,600),disabledSVG)
current().checkbox.props.onChange({target:{checked:true}})
assert.equal(commits,2);check(true);assert.equal(doc.planes.find(q=>q.id===selectedId).display.show_hidden_edges,true);assert.equal(p.geometrySceneSVG3D(doc,800,600),enabledSVG)
assert.ok(history.provider.undo());check(false);assert.ok(history.provider.redo());check(true)
const disabledControl=render({...props(),disabled:true}),disabledBefore=structuredClone(doc)
assert.match(disabledControl.html,/<fieldset disabled/);disabledControl.checkbox.props.onChange({target:{checked:false}});assert.equal(commits,2);assert.deepEqual(doc,disabledBefore)
// Reopening orientation remains independent of the display flag and preserves
// the existing no-op confirmation / automatic indicator hiding behavior.
for(const value of [false,true]){
 current().checkbox.props.onChange({target:{checked:value}})
 const snapshot=structuredClone(doc),flags=history.provider.getSnapshot(),button=current().nodes.find(e=>e.type==='button'&&e.props.children===orientationLabel)
 assert.ok(button);button.props.onClick();assert.equal(interaction.snapshot().planeOrientationSelection,true)
 assert.ok(interaction.snapshot().orientationHandlePreview.length)
 assert.ok(interaction.finish());assert.equal(interaction.snapshot().planeOrientationSelection,false);assert.deepEqual(interaction.snapshot().orientationHandlePreview,[])
 assert.deepEqual(doc,snapshot);assert.equal(history.provider.getSnapshot(),flags);check(value)
 // Apply a normal display-size transaction, serialize as the editor's saved
 // source_data, then reopen Properties and prepare the actual printable block.
 const applied=plane.resizePlaneDisplay3D(doc,selectedId,5,4)
 const saved=n.serializeGeometryScene3D(applied),reloaded=n.normalizeGeometryScene3D(JSON.parse(saved))
 assert.equal(reloaded.planes.find(q=>q.id===selectedId).display.show_hidden_edges,value)
 assert.deepEqual(reloaded.planes.find(q=>q.id===selectedId).display.stroke,basis.display.stroke)
 assert.equal(reloaded.planes.find(q=>q.id===selectedId).display.intersection_mode,'cross')
 const reopened=render({...props(),scene:reloaded,selected:reloaded.planes.find(q=>q.id===selectedId)})
 assert.equal(reopened.checkbox.props.checked,value)
 const snapshotPayload={version:1,revisions:[{revision_id:'11111111-1111-4111-8111-111111111111',revision_number:1,blocks:[{id:'geometry',sort_order:0,block_type:'geometry',payload:{format_version:1,source_data:reloaded}}]}]}
 const prepared=print.preparePrintableDocument(snapshotPayload,'hidden-properties');assert.equal(prepared.issues.length,0)
 const block=prepared.revisions[0].blocks[0];assert.equal(block.svg,print.namespacePrintableSVG(p.geometrySceneSVG3D(reloaded,block.size.width,block.size.height),block.scope))
 assert.equal(/data-id="beta" data-plane-boundary="hidden"/.test(block.svg),value)
}
// Supported display planes share the same Properties control. Point/line/empty
// selections are mapped to null by the existing editor's plane-only selector.
const parallel=a.createParallelPlaneThroughPoint3D(source,'P',{kind:'plane',id:'alpha'},'parallel').scene
const guided=a.createGuidedPerpendicularPlane3D(source,{kind:'plane',id:'alpha'},{kind:'points',a:'P',b:'Q'},'guided').scene
const half=m.transactGeometryScene3D(source,s=>s.planes.push({id:'half',kind:'half_plane',point_ids:[...s.planes.find(q=>q.id==='alpha').point_ids],display:{width:4,height:3,stroke:{color:'#ABC123',width:2,style:'dashed'}}}))
for(const [scene,id] of [[source,'alpha'],[parallel,'parallel'],[guided,'guided'],[half,'half']]){
 let next=null
 const before=structuredClone(scene),result=render({scene,selected:scene.planes.find(q=>q.id===id),disabled:false,onCommit:s=>next=s})
 assert.ok(result.checkbox);assert.equal(result.checkbox.props.checked,true)
 result.checkbox.props.onChange({target:{checked:true}});assert.equal(next,null)
 result.checkbox.props.onChange({target:{checked:false}});assert.ok(next)
 const expected=structuredClone(scene);expected.planes.find(q=>q.id===id).display.show_hidden_edges=false
 assert.deepEqual(next,expected);assert.deepEqual(scene,before)
}
for(const id of ['P','pq',null,'missing']){
 const selected=doc.planes.find(q=>q.id===id&&q.display)??null,result=render({...props(),selected})
 assert.equal(result.checkbox,undefined);assert.ok(!result.html.includes(label))
}
const bare={id:'bare',point_ids:[...source.planes[0].point_ids]}
assert.equal(render({...props(),selected:bare}).checkbox,undefined)
assert.deepEqual(initial.planes.find(q=>q.id===selectedId),basis)
console.log('PASS: real labeled plane checkbox, default/explicit values, transactional immutable updates, disabled/no-op/redo guards, stable selection, live WebGL/SVG, orientation editing, Apply/save/reopen and print parity')
