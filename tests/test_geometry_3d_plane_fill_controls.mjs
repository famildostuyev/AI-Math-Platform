import assert from 'node:assert/strict'
import {printableComponent as load,requireFrontend} from './printable_test_modules.mjs'
const React=requireFrontend('react'),{renderToStaticMarkup}=requireFrontend('react-dom/server'),THREE=requireFrontend('three')
const Controls=load('GeometryPlaneControls').default,m=load('geometry3dModel'),plane=load('geometry3dPlaneAuthoring'),a=load('geometry3dConstructedPlaneAuthoring'),g=load('geometry3dAuthoring'),p=load('geometry3dProjection'),n=load('geometry3d'),print=load('printableDocumentModel'),{populateGeometrySceneViewport3D:populate}=load('GeometrySceneViewport'),dihedral=load('geometry3dDihedralAuthoring')
const labels={color:'Müstəvinin rəngi',opacity:'Müstəvinin qeyri-şəffaflığı'}
function render(props){
 let tree;function Capture(){tree=Controls(props);return tree}
 const html=renderToStaticMarkup(React.createElement(Capture)),nodes=[]
 function visit(e){if(!React.isValidElement(e))return;nodes.push(e);React.Children.forEach(e.props.children,visit)}visit(tree)
 return {html,field:key=>nodes.find(e=>e.props['aria-label']===labels[key])}
}
function fixture(mode='cross',offset=4){
 let scene=plane.createPlaneAt3D(m.emptyGeometryScene3D(),[0,0,0],'XY','alpha').scene
 scene=m.transactGeometryScene3D(scene,s=>s.points.push({id:'P',position:[0,0,offset],label:null,visibility:'hidden'}))
 scene=a.createPerpendicularPlaneThroughPoint3D(scene,'P',{kind:'plane',id:'alpha'},.4,'beta').scene
 return m.transactGeometryScene3D(scene,s=>{const q=s.planes.find(q=>q.id==='beta');Object.assign(q.display,{intersection_mode:mode,stroke:{color:'#123ABC',width:2,style:'dotted'},show_hidden_edges:false});s.print_camera={...s.print_camera,position:[8,-10,12],target:[0,0,0],vertical_span:24}})
}
let doc=fixture(),calls=0,interaction
const original=structuredClone(doc),history=m.createGeometryHistory3D(doc,next=>{doc=next;interaction?.sync()})
interaction=g.createAuthoringInteraction3D({getScene:()=>doc,getCamera:()=>doc.print_camera,commit:s=>history.commit(s),notify:()=>{}});interaction.select('beta')
const props=()=>({scene:doc,selected:doc.planes.find(q=>q.id===interaction.snapshot().selected),disabled:false,onCommit:next=>{calls++;interaction.cancel();assert.ok(history.commit(next))}})
const change=(key,value)=>render(props()).field(key).props.onChange({target:{value}})
const initial=render(props());assert.equal(initial.field('color').props.value,'#CBD5E1');assert.equal(initial.field('opacity').props.value,15)
for(const label of Object.values(labels))assert.ok(initial.html.includes(label));assert.equal(initial.field('opacity').props.min,'0');assert.equal(initial.field('opacity').props.max,'100')
change('color','#cbd5e1');change('opacity','15');assert.equal(calls,0);assert.deepEqual(doc,original)
change('color','#abcdef');change('opacity','0');change('opacity','100');assert.equal(calls,3)
assert.deepEqual(doc.planes.find(q=>q.id==='beta').display.fill,{color:'#ABCDEF',opacity:1})
const changed=structuredClone(doc),flags=history.provider.getSnapshot()
for(const value of ['', '-1', '100.01', 'Infinity', 'NaN'])change('opacity',value)
for(const value of ['red','#123','#1234567'])change('color',value)
change('opacity','100');change('color','#abcdef');assert.deepEqual(doc,changed);assert.equal(calls,3);assert.equal(history.provider.getSnapshot(),flags)
const disabled=render({...props(),disabled:true});disabled.field('opacity').props.onChange({target:{value:'50'}});assert.deepEqual(doc,changed)
const {fill,...rest}=doc.planes.find(q=>q.id==='beta').display;assert.deepEqual(rest,original.planes.find(q=>q.id==='beta').display)
assert.deepEqual(doc.planes.find(q=>q.id==='alpha'),original.planes.find(q=>q.id==='alpha'));assert.deepEqual(doc.points,original.points);assert.deepEqual(doc.constructions,original.constructions);assert.deepEqual(doc.print_camera,original.print_camera);assert.equal(interaction.snapshot().selected,'beta')
for(let i=0;i<3;i++)assert.ok(history.provider.undo());assert.deepEqual(doc,original)
const redo=history.provider.getSnapshot();change('opacity','15');assert.equal(history.provider.getSnapshot(),redo)
for(let i=0;i<3;i++)assert.ok(history.provider.redo());assert.deepEqual(doc,changed)
const saved=n.serializeGeometryScene3D(doc),reloaded=n.normalizeGeometryScene3D(JSON.parse(saved));assert.deepEqual(reloaded,doc)
assert.equal(render({...props(),scene:reloaded,selected:reloaded.planes.find(q=>q.id==='beta')}).field('opacity').props.value,100)
assert.equal(render({...props(),selected:null}).field('color'),undefined)
assert.equal(plane.setPlaneFill3D(doc,'missing',{color:'#123456',opacity:.5}),null)

const tags=svg=>[...svg.matchAll(/<(polygon|path)\b[^>]*>/g)].map(q=>({tag:q[1],...Object.fromEntries([...q[0].matchAll(/([\w-]+)="([^"]*)"/g)].map(a=>[a[1],a[2]]))}))
function draw(scene,highlighted=[]){const group=new THREE.Group();populate(group,scene,scene.print_camera,800,600,new Set(highlighted));return group}
const meshes=group=>group.children.filter(q=>q.isMesh&&!q.isLineSegments2)
const lines=group=>group.children.filter(q=>q.isLine||q.isLineSegments2).map(q=>({id:q.userData.semanticId,color:q.material.color.getHexString(),opacity:q.material.opacity,width:q.material.linewidth,runs:q.userData.strokeRuns}))
const dispose=group=>group.traverse(q=>{q.geometry?.dispose();q.material?.dispose()})
let cases=0
for(const mode of ['cross','first','opposite'])for(const offset of [-12,12])for(const projection of ['orthographic','perspective']){
 const legacy=m.transactGeometryScene3D(fixture(mode,offset),s=>{s.print_camera.projection=projection;s.planes.find(p=>p.id==='alpha').display.shape='cloud'})
 const baseline=draw(legacy),legacySVG=p.geometrySceneSVG3D(legacy,800,600)
 assert.ok(meshes(baseline).length);for(const mesh of meshes(baseline)){assert.equal(mesh.material.color.getHexString(),'cbd5e1');assert.equal(mesh.material.opacity,.15)}
 for(const q of tags(legacySVG).filter(q=>q.tag==='polygon')){assert.equal(q.fill,'#e2e8f0');assert.equal(q['fill-opacity'],'0.35')}
 let styled=plane.setPlaneFill3D(legacy,'alpha',{color:'#AABBCC',opacity:.42123456789});styled=plane.setPlaneFill3D(styled,'beta',{color:'#123456',opacity:0})
 const before=structuredClone(styled),group=draw(styled),svg=p.geometrySceneSVG3D(styled,800,600)
 for(const mesh of meshes(group)){const alpha=mesh.userData.semanticId==='alpha';assert.equal(mesh.material.color.getHexString(),alpha?'aabbcc':'123456');assert.equal(mesh.material.opacity,alpha?.42123456789:0);assert.equal(mesh.material.depthWrite,false)}
 for(const q of tags(svg).filter(q=>q.tag==='polygon')){const alpha=q['data-id']==='alpha';assert.equal(q.fill,alpha?'#AABBCC':'#123456');assert.equal(q['fill-opacity'],alpha?'0.42123456789':'0')}
 assert.deepEqual(lines(group),lines(baseline));assert.deepEqual(tags(svg).filter(q=>q.tag==='path'),tags(legacySVG).filter(q=>q.tag==='path'))
 const oldView=p.projectScene3D(legacy,legacy.print_camera,800,600,true),newView=p.projectScene3D(styled,styled.print_camera,800,600,true)
 assert.deepEqual(newView.faces,oldView.faces);assert.deepEqual(p.projectedPlaneBoundaryStrokes3D(newView,projection),p.projectedPlaneBoundaryStrokes3D(oldView,projection))
 for(const face of newView.faces){const xy=face.vertices.reduce((sum,q)=>[sum[0]+q[0]/face.vertices.length,sum[1]+q[1]/face.vertices.length],[0,0]),pointer={x:xy[0],y:xy[1],width:800,height:600};assert.deepEqual(g.pickGeometry3D(styled,styled.print_camera,pointer),g.pickGeometry3D(legacy,legacy.print_camera,pointer))}
 const selected=draw(styled,['beta']);for(const mesh of meshes(selected).filter(q=>q.userData.semanticId==='beta')){assert.equal(mesh.material.color.getHexString(),'f97316');assert.equal(mesh.material.opacity,0)}
 assert.ok(tags(p.geometrySceneSVG3D(styled,800,600,new Set(['beta']))).filter(q=>q.tag==='polygon'&&q['data-id']==='beta').every(q=>q.fill==='#f97316'&&q['fill-opacity']==='0'))
 const snapshot={version:1,revisions:[{revision_id:'11111111-1111-4111-8111-111111111111',revision_number:1,blocks:[{id:'geometry',sort_order:0,block_type:'geometry',payload:{format_version:1,source_data:styled}}]}]}
 const prepared=print.preparePrintableDocument(snapshot,'plane-fill');assert.equal(prepared.issues.length,0);const block=prepared.revisions[0].blocks[0];assert.equal(block.svg,print.namespacePrintableSVG(p.geometrySceneSVG3D(styled,block.size.width,block.size.height),block.scope))
 assert.deepEqual(styled,before);dispose(baseline);dispose(group);dispose(selected);cases++
}
// Actual dihedral half-plane patches share their owning plane's fill.
let half=dihedral.createDihedral3D(m.emptyGeometryScene3D(),[0,0,0],'XY','angle').scene
half=m.transactGeometryScene3D(half,s=>{s.planes[0].display={width:4,height:3,fill:{color:'#ABC123',opacity:1}}})
const halfGroup=draw(half),id=half.planes[0].id
assert.ok(meshes(halfGroup).some(q=>q.userData.semanticId===id&&q.material.opacity===1&&q.material.color.getHexString()==='abc123'));dispose(halfGroup)
console.log(`PASS: plane fill Properties/history/validation/save, ${cases} mode-camera-offset render cases, legacy defaults, independent fills, zero-opacity picking/occlusion, selection, half-planes and saved print parity`)
