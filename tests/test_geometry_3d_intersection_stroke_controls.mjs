import assert from 'node:assert/strict'
import {printableComponent as load,requireFrontend} from './printable_test_modules.mjs'
const React=requireFrontend('react'),{renderToStaticMarkup}=requireFrontend('react-dom/server'),THREE=requireFrontend('three')
const Controls=load('GeometryPlaneControls').default,m=load('geometry3dModel'),plane=load('geometry3dPlaneAuthoring'),a=load('geometry3dConstructedPlaneAuthoring'),g=load('geometry3dAuthoring'),p=load('geometry3dProjection'),n=load('geometry3d'),print=load('printableDocumentModel'),r=load('geometry3dPlaneStroke'),owners=load('geometry3dPlaneIntersectionStroke'),{populateGeometrySceneViewport3D:populate}=load('GeometrySceneViewport')
const labels={color:'Kəsişmə xəttinin rəngi',width:'Kəsişmə xəttinin qalınlığı',style:'Kəsişmə xəttinin üslubu'}
function render(props){let tree;function Capture(){tree=Controls(props);return tree}const html=renderToStaticMarkup(React.createElement(Capture)),nodes=[];function visit(e){if(!React.isValidElement(e))return;nodes.push(e);React.Children.forEach(e.props.children,visit)}visit(tree);return {html,field:key=>nodes.find(e=>e.props['aria-label']===labels[key])}}
function fixture(mode='cross',offset=4,projection='orthographic'){
 let s=plane.createPlaneAt3D(m.emptyGeometryScene3D(),[0,0,0],'XY','alpha').scene
 s=m.transactGeometryScene3D(s,q=>q.points.push({id:'P',position:[0,0,offset],label:null,visibility:'hidden'},{id:'Q',position:[1,0,offset],label:null,visibility:'hidden'}))
 s=a.createPerpendicularPlaneThroughPoint3D(s,'P',{kind:'plane',id:'alpha'},.4,'beta').scene
 return m.transactGeometryScene3D(s,q=>{Object.assign(q.planes.find(p=>p.id==='beta').display,{intersection_mode:mode,fill:{color:'#ABCDEF',opacity:.42},stroke:{color:'#123456',width:2,style:'dotted'},show_hidden_edges:false});q.print_camera={...q.print_camera,projection,position:[8,-10,12],target:[0,0,0],vertical_span:24}})
}
let doc=fixture(),calls=0,interaction
const initial=structuredClone(doc),history=m.createGeometryHistory3D(doc,next=>{doc=next;interaction?.sync()})
interaction=g.createAuthoringInteraction3D({getScene:()=>doc,getCamera:()=>doc.print_camera,commit:s=>history.commit(s),notify:()=>{}});interaction.select('beta')
const props=(id='beta')=>({scene:doc,selected:doc.planes.find(q=>q.id===id)??null,disabled:false,onCommit:next=>{calls++;interaction.cancel();assert.ok(history.commit(next))}})
const change=(key,value)=>render(props()).field(key).props.onChange({target:{value}})
let ui=render(props());for(const label of Object.values(labels))assert.ok(ui.html.includes(label));assert.equal(ui.field('color').props.value,'#334155');assert.equal(ui.field('width').props.value,1);assert.equal(ui.field('style').props.value,'solid')
assert.equal(render(props('alpha')).field('color'),undefined);assert.equal(render({...props(),selected:null}).field('color'),undefined)
change('color','#334155');change('width','1');change('style','solid');assert.equal(calls,0);assert.deepEqual(doc,initial)
change('color','#ab12ef');change('width','8');change('style','dotted');assert.equal(calls,3)
const styled=structuredClone(doc),flags=history.provider.getSnapshot()
for(const v of ['', '0', '.249', '8.001', 'NaN', 'Infinity'])change('width',v)
change('color','red');change('style','bad');change('width','8');change('color','#AB12EF');assert.equal(calls,3);assert.deepEqual(doc,styled);assert.equal(history.provider.getSnapshot(),flags)
render({...props(),disabled:true}).field('color').props.onChange({target:{value:'#FFFFFF'}});assert.equal(calls,3)
const {intersection_stroke,...rest}=doc.planes.find(q=>q.id==='beta').display;assert.deepEqual(rest,initial.planes.find(q=>q.id==='beta').display)
assert.deepEqual(doc.points,initial.points);assert.deepEqual(doc.constructions,initial.constructions);assert.deepEqual(doc.print_camera,initial.print_camera);assert.deepEqual(doc.planes.find(q=>q.id==='alpha'),initial.planes.find(q=>q.id==='alpha'));assert.equal(interaction.snapshot().selected,'beta')
for(let i=0;i<3;i++)assert.ok(history.provider.undo());assert.deepEqual(doc,initial);const redo=history.provider.getSnapshot();change('style','solid');assert.equal(history.provider.getSnapshot(),redo)
for(let i=0;i<3;i++)assert.ok(history.provider.redo());assert.deepEqual(doc,styled)
const reloaded=n.normalizeGeometryScene3D(JSON.parse(n.serializeGeometryScene3D(doc)));assert.deepEqual(reloaded,doc)
assert.equal(render({...props(),scene:reloaded,selected:reloaded.planes.find(p=>p.id==='beta')}).field('style').props.value,'dotted')
assert.equal(plane.setPlaneIntersectionStroke3D(doc,'alpha',intersection_stroke),null)
const guided=a.createGuidedPerpendicularPlane3D(initial,{kind:'plane',id:'alpha'},{kind:'points',a:'P',b:'Q'},'guided').scene
assert.ok(render({...props(),scene:guided,selected:guided.planes.find(q=>q.id==='guided')}).field('color'))
const parallel=a.createParallelPlaneThroughPoint3D(initial,'P',{kind:'plane',id:'alpha'},'parallel').scene
assert.equal(render({...props(),scene:parallel,selected:parallel.planes.find(q=>q.id==='parallel')}).field('color'),undefined)
const coincident=a.createParallelPlaneThroughPoint3D(initial,'alpha_origin',{kind:'plane',id:'alpha'},'coincident').scene
assert.ok(!p.scenePrimitives3D(coincident).primitives.some(q=>q.id==='coincident'&&q.role==='plane_intersection'))
const tags=svg=>[...svg.matchAll(/<path\b[^>]*>/g)].map(q=>Object.fromEntries([...q[0].matchAll(/([\w-]+)="([^"]*)"/g)].map(a=>[a[1],a[2]])))
const paths=scene=>tags(p.geometrySceneSVG3D(scene,800,600)).filter(q=>q['data-render-curve']==='plane_intersection')
const guides=scene=>p.displayPrimitives3D(p.scenePrimitives3D(scene).primitives).primitives.filter(q=>q.intersectionOwners)
function draw(scene,selected=[]){const group=new THREE.Group();populate(group,scene,scene.print_camera,800,600,new Set(selected));return group}
const native=group=>group.children.filter(q=>q.userData.intersectionOwners)
const fills=group=>group.children.filter(q=>q.isMesh&&!q.isLineSegments2).map(q=>({id:q.userData.semanticId,color:q.material.color.getHexString(),opacity:q.material.opacity,position:Array.from(q.geometry.attributes.position.array)}))
const dispose=group=>group.traverse(q=>{q.geometry?.dispose();q.material?.dispose()})
let count=0
for(const mode of ['cross','first','opposite'])for(const projection of ['orthographic','perspective'])for(const offset of [-10,10])for(const style of ['solid','dashed','dotted']){
 const legacy=fixture(mode,offset,projection),width=style==='solid'?.25:style==='dashed'?2:8,scene=plane.setPlaneIntersectionStroke3D(legacy,'beta',{color:'#AB12EF',width,style}),before=structuredClone(scene)
 const group=draw(scene),baseline=draw(legacy),strokes=native(group);assert.ok(strokes.length)
 for(const q of strokes){assert.equal(q.material.color.getHexString(),'ab12ef');assert.equal(q.material.linewidth,width);assert.equal(q.userData.planeStroke.style,style);assert.ok(q.userData.strokeRuns.length)}
 for(const q of paths(scene)){assert.equal(q.stroke,'#AB12EF');assert.equal(q['stroke-width'],String(width));if(!q.opacity)assert.equal(q['stroke-dasharray'],style==='solid'?undefined:style==='dashed'?'8 6':'8 24')}
 const legacyPaths=paths(legacy);assert.ok(legacyPaths.length);assert.ok(legacyPaths.every(q=>q.stroke==='#334155'&&!q['stroke-width']))
 assert.deepEqual(fills(group),fills(baseline));assert.deepEqual(p.scenePrimitives3D(scene).primitives.filter(q=>q.kind==='plane'),p.scenePrimitives3D(legacy).primitives.filter(q=>q.kind==='plane'))
 const selected=draw(scene,['beta']);assert.ok(native(selected).every(q=>q.material.color.getHexString()==='f97316'));assert.deepEqual(scene,before)
 assert.deepEqual(n.normalizeGeometryScene3D(JSON.parse(n.serializeGeometryScene3D(scene))),scene)
 const payload={version:1,revisions:[{revision_id:'11111111-1111-4111-8111-111111111111',revision_number:1,blocks:[{id:'geometry',sort_order:0,block_type:'geometry',payload:{format_version:1,source_data:scene}}]}]}
 const prepared=print.preparePrintableDocument(payload,'intersection-style');assert.equal(prepared.issues.length,0);const block=prepared.revisions[0].blocks[0];assert.equal(block.svg,print.namespacePrintableSVG(p.geometrySceneSVG3D(scene,block.size.width,block.size.height),block.scope))
 dispose(group);dispose(baseline);dispose(selected);count++
}
// Coincident guides retain both owner records and aliases, but emit one guide.
let twin=a.createPerpendicularPlaneThroughPoint3D(initial,'P',{kind:'plane',id:'alpha'},.4,'beta2').scene
twin=plane.setPlaneIntersectionStroke3D(twin,'beta2',{color:'#FF0000',width:3,style:'dashed'})
assert.equal(guides(twin).length,1);assert.equal(owners.effectiveIntersectionOwner3D(guides(twin)[0].intersectionOwners).ownerId,'beta2')
assert.equal(paths(twin).length,1);assert.equal(paths(twin)[0].stroke,'#FF0000')
twin=plane.setPlaneIntersectionStroke3D(twin,'beta',{color:'#0000FF',width:2,style:'dotted'})
assert.equal(guides(twin)[0].intersectionOwners.length,2);assert.equal(owners.effectiveIntersectionOwner3D(guides(twin)[0].intersectionOwners).ownerId,'beta');assert.equal(paths(twin)[0].stroke,'#0000FF')
assert.ok(paths(twin)[0]['data-selection-aliases'].includes('beta2'))
const reversed=structuredClone(twin);reversed.planes.reverse();reversed.constructions.reverse();assert.equal(paths(reversed)[0].stroke,'#0000FF')
const selectedTwin=draw(twin,['beta2']);assert.ok(native(selectedTwin).every(q=>q.material.color.getHexString()==='f97316'));dispose(selectedTwin)
// A pre-existing semantic segment may be the display representative. Keep its
// ID/alias and use the explicit guide style, without creating another stroke.
const chord=guides(doc)[0],collision=m.transactGeometryScene3D(doc,s=>{s.points.push({id:'U',position:[...chord.a],label:null},{id:'V',position:[...chord.b],label:null});s.linear_objects.push({id:'a_segment',kind:'segment',a:'U',b:'V'})})
const merged=guides(collision);assert.equal(merged.length,1);assert.equal(merged[0].id,'a_segment');assert.equal(owners.effectiveIntersectionOwner3D(merged[0].intersectionOwners).ownerId,'beta')
const collisionSVG=tags(p.geometrySceneSVG3D(collision,800,600)).filter(q=>q['data-id']==='a_segment');assert.equal(collisionSVG.length,1);assert.equal(collisionSVG[0].stroke,'#AB12EF');assert.ok(collisionSVG[0]['data-selection-aliases'].includes('beta'))
const collisionGroup=draw(collision);assert.equal(native(collisionGroup).length,1);assert.ok(native(collisionGroup)[0].userData.selectionAliases.includes('beta'));dispose(collisionGroup)
// A guide's screen-space phase survives visible/hidden splits by an ordinary
// finite face, using exactly the same projection and stroke infrastructure.
const view=p.projectScene3D(doc,doc.print_camera,800,600,true),line=view.lines.find(q=>q.intersectionOwners),dx=line.b[0]-line.a[0],dy=line.b[1]-line.a[1],len=Math.hypot(dx,dy)
const vertex=(t,side)=>[line.a[0]+t*dx-side*dy/len*10,line.a[1]+t*dy+side*dx/len*10,Math.min(line.a[2],line.b[2])-1]
const split=p.styledBoundaryStrokes3D({...view,faces:[{id:'occluder',kind:'face',vertices:[vertex(.3,-1),vertex(.7,-1),vertex(.7,1),vertex(.3,1)]}]},'orthographic').filter(q=>q.intersectionOwners)
assert.ok(split.some(q=>q.hidden));assert.ok(split.some(q=>!q.hidden));assert.ok(split.length>=3)
for(const q of split)assert.ok(Math.abs(q.dashOffset-Math.hypot(q.a[0]-line.a[0],q.a[1]-line.a[1]))<1e-6)
// Independent noncoincident guided output does not inherit beta's style.
const independent=plane.setPlaneIntersectionStroke3D(plane.setPlaneIntersectionStroke3D(guided,'beta',intersection_stroke),'guided',{color:'#00FF00',width:1,style:'solid'})
assert.ok(paths(independent).some(q=>q.stroke==='#00FF00'));assert.ok(paths(independent).some(q=>q.stroke==='#AB12EF'))
// Moving the reference changes clipping; styling persists through no intersection.
const absent=plane.transformPlane3D(doc,'alpha',[30,0,0]);assert.ok(absent);assert.equal(guides(absent).length,0);assert.equal(paths(absent).length,0)
assert.deepEqual(absent.planes.find(q=>q.id==='beta').display.intersection_stroke,intersection_stroke)
const restored=plane.transformPlane3D(absent,'alpha',[-30,0,0]);assert.equal(guides(restored).length,1);assert.equal(paths(restored)[0].stroke,'#AB12EF')
const moved=m.moveGeometryPoint3D(doc,'P',[.5,.2,6]);assert.ok(moved);assert.notDeepEqual(guides(moved).map(q=>[q.a,q.b]),guides(doc).map(q=>[q.a,q.b]));assert.deepEqual(moved.planes.find(q=>q.id==='beta').display.intersection_stroke,intersection_stroke)
console.log(`PASS: intersection Properties/history/strict validation, ${count} render cases, SVG/native/print parity, independent fills/boundaries, coincident owner precedence/aliases and moving/disappearing guides`)
