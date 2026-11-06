import assert from 'node:assert/strict'
import {printableComponent as load,requireFrontend} from './printable_test_modules.mjs'
const React=requireFrontend('react'),{renderToStaticMarkup}=requireFrontend('react-dom/server')
const Controls=load('GeometryPlaneControls').default,m=load('geometry3dModel'),a=load('geometry3dConstructedPlaneAuthoring'),plane=load('geometry3dPlaneAuthoring'),g=load('geometry3dAuthoring'),p=load('geometry3dProjection'),math=load('geometry3dConstructedPlane'),display=load('geometry3dPlaneDisplay')
const label='Kəsişmə görünüşü',options=[['cross','Kəsib keçsin'],['first','Kəsişmə xəttinə qədər — birinci tərəf'],['opposite','Kəsişmə xəttinə qədər — əks tərəf']]
// Render the real component with React's server dispatcher, retaining its native
// element tree so the actual event handlers can be exercised without a DOM shim.
function renderControls(props){
 let tree
 function Capture(){tree=Controls(props);return tree}
 const html=renderToStaticMarkup(React.createElement(Capture)),nodes=[]
 function visit(element){if(!React.isValidElement(element))return;nodes.push(element);React.Children.forEach(element.props.children,visit)}
 visit(tree)
 return {html,nodes,selector:nodes.find(q=>q.type==='select'&&q.props['aria-label']===label)}
}
let source=plane.createPlaneAt3D(m.emptyGeometryScene3D(),[0,0,0],'XY','alpha').scene
source=m.transactGeometryScene3D(source,s=>s.points.push({id:'P',position:[0,0,6],label:'P',visibility:'hidden'},{id:'Q',position:[1,0,6],label:null,visibility:'hidden'}))
let doc=a.createPerpendicularPlaneThroughPoint3D(source,'P',{kind:'plane',id:'alpha'},.4,'beta').scene
doc=m.transactGeometryScene3D(doc,s=>Object.assign(s.planes.find(q=>q.id==='beta').display,{width:6,height:7,shape:'parallelogram',skew:.2,lower_portion:'both',intersection_visibility:'hidden'}))
const initial=structuredClone(doc),camera={...doc.print_camera,position:[5,-7,8],target:[0,0,3]}
let interaction,commitCalls=0
const history=m.createGeometryHistory3D(doc,next=>{doc=next;interaction?.sync()})
interaction=g.createAuthoringInteraction3D({getScene:()=>doc,getCamera:()=>camera,commit:next=>history.commit(next),notify:()=>{}})
interaction.select('beta')
const props=()=>({scene:doc,selected:doc.planes.find(q=>q.id===interaction.snapshot().selected),disabled:false,onCommit:next=>{commitCalls++;interaction.cancel();assert.ok(history.commit(next))},onEditOrientation:id=>assert.ok(interaction.editPlaneOrientation(id))})
function checkCurrent(mode){
 const rendered=renderControls(props());assert.ok(rendered.selector);assert.equal(rendered.selector.props.value,mode)
 assert.deepEqual(React.Children.toArray(rendered.selector.props.children).map(q=>[q.props.value,q.props.children]),options)
 assert.ok(rendered.html.includes(label));for(const [,text] of options)assert.ok(rendered.html.includes(text))
 assert.equal(interaction.snapshot().selected,'beta')
 const expected=structuredClone(initial);expected.planes.find(q=>q.id==='beta').display.intersection_mode=mode
 assert.deepEqual(doc,expected)
 const surface=math.perpendicularPlaneSurface3D(doc,'P',{kind:'plane',id:'alpha'},.4,undefined,mode)
 assert.deepEqual(p.displayPrimitives3D(p.scenePrimitives3D(doc).primitives).primitives.filter(q=>q.kind==='plane'&&q.id==='beta').map(q=>q.displayPatch),surface.polygons)
 const f=display.planeDisplay3D(doc.planes.find(q=>q.id==='alpha'),doc),t=p.add(p.scale(f.x,Math.cos(.4)),p.scale(f.y,Math.sin(.4))),normal=p.cross(t,f.normal)
 const viewCamera={...camera,position:p.scale(normal,12),target:f.o,up:f.normal},view=p.createProjection3D(viewCamera,800,600),cross=math.perpendicularPlaneSurface3D(doc,'P',{kind:'plane',id:'alpha'},.4)
 for(let i=0;i<cross.polygons.length;i++){
  const polygon=cross.polygons[i],world=polygon[0].map((_,j)=>polygon.reduce((sum,q)=>sum+q[j],0)/polygon.length),screen=view.screen(view.view(world)),hit=g.pickGeometry3D(doc,viewCamera,{x:screen[0],y:screen[1],width:800,height:600})
  const visible=mode==='cross'||(mode==='first'?i%2===0:i%2===1)
  if(visible)assert.equal(hit?.id,'beta');else assert.notEqual(hit?.id,'beta')
 }
 return rendered
}
checkCurrent('cross').selector.props.onChange({target:{value:'cross'}});assert.equal(commitCalls,0);assert.equal(history.provider.getSnapshot(),0)
for(const mode of ['first','opposite','cross']){
 const before=structuredClone(doc);renderControls(props()).selector.props.onChange({target:{value:mode}})
 const count=commitCalls;checkCurrent(mode).selector.props.onChange({target:{value:mode}});assert.equal(commitCalls,count)
 assert.ok(history.provider.undo());assert.deepEqual(doc,before);const prior=doc.planes.find(q=>q.id==='beta').display.intersection_mode
 const flags=history.provider.getSnapshot();checkCurrent(prior).selector.props.onChange({target:{value:prior}});assert.equal(commitCalls,count);assert.equal(history.provider.getSnapshot(),flags)
 assert.ok(history.provider.redo());checkCurrent(mode)
 // The existing orientation button reopens the indicator in the current mode;
 // confirming without a drag is a no-op and hides it again.
 const button=renderControls(props()).nodes.find(q=>q.type==='button'&&q.props.children==='İstiqaməti redaktə et')
 assert.ok(button);const snapshot=structuredClone(doc),historyFlags=history.provider.getSnapshot()
 button.props.onClick();assert.equal(interaction.snapshot().planeOrientationSelection,true);assert.equal(interaction.snapshot().orientationHandlePreview.length,2)
 assert.deepEqual(interaction.snapshot().previewSurfacePolygons,math.perpendicularPlaneSurface3D(doc,'P',{kind:'plane',id:'alpha'},.4,undefined,mode).polygons)
 assert.ok(interaction.finish());assert.equal(interaction.snapshot().planeOrientationSelection,false);assert.deepEqual(interaction.snapshot().orientationHandlePreview,[]);assert.deepEqual(doc,snapshot);assert.equal(history.provider.getSnapshot(),historyFlags)
}
const disabled=renderControls({...props(),disabled:true}),beforeDisabled=structuredClone(doc),callsBeforeDisabled=commitCalls
assert.match(disabled.html,/<fieldset disabled/);disabled.selector.props.onChange({target:{value:'first'}});assert.deepEqual(doc,beforeDisabled);assert.equal(commitCalls,callsBeforeDisabled)
const legacy=structuredClone(initial);delete legacy.planes.find(q=>q.id==='beta').display.intersection_mode
const fallback=renderControls({...props(),scene:legacy,selected:legacy.planes.find(q=>q.id==='beta')});assert.equal(fallback.selector.props.value,'cross');fallback.selector.props.onChange({target:{value:'cross'}});assert.equal(commitCalls,callsBeforeDisabled)
const parallel=a.createParallelPlaneThroughPoint3D(source,'P',{kind:'plane',id:'alpha'},'parallel').scene
const guided=a.createGuidedPerpendicularPlane3D(source,{kind:'plane',id:'alpha'},{kind:'points',a:'P',b:'Q'},'guided').scene
for(const [scene,id] of [[source,'alpha'],[parallel,'parallel'],[guided,'guided']]){
 assert.ok(scene);const rendered=renderControls({scene,selected:scene.planes.find(q=>q.id===id),disabled:false,onCommit:()=>assert.fail('unexpected commit')})
 assert.equal(rendered.selector,undefined);assert.ok(!rendered.html.includes(label));assert.ok(rendered.nodes.some(q=>q.type==='select'&&q.props['aria-label']==='Plane display shape'))
}
assert.equal(renderControls({...props(),selected:null}).selector,undefined)
console.log('PASS: real Properties selector labels/mapping, scoped visibility, transactional updates, no-op/redo preservation, stable selection, live surfaces/picking, Undo/Redo, orientation reopening/hiding and disabled state')
