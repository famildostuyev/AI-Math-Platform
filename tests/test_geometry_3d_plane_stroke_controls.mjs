import assert from 'node:assert/strict'
import {printableComponent as load,requireFrontend} from './printable_test_modules.mjs'
const React=requireFrontend('react'),{renderToStaticMarkup}=requireFrontend('react-dom/server'),THREE=requireFrontend('three')
const Controls=load('GeometryPlaneControls').default,plane=load('geometry3dPlaneAuthoring'),m=load('geometry3dModel'),a=load('geometry3dConstructedPlaneAuthoring'),g=load('geometry3dAuthoring'),p=load('geometry3dProjection'),n=load('geometry3d'),{populateGeometrySceneViewport3D:populate}=load('GeometrySceneViewport')
const labels={color:'Sərhəd xəttinin rəngi',width:'Sərhəd xəttinin qalınlığı',style:'Sərhəd xəttinin üslubu'}
function render(props){
 let tree;function Capture(){tree=Controls(props);return tree}
 const html=renderToStaticMarkup(React.createElement(Capture)),nodes=[]
 function visit(e){if(!React.isValidElement(e))return;nodes.push(e);React.Children.forEach(e.props.children,visit)}visit(tree)
 return {html,field:key=>nodes.find(e=>e.props['aria-label']===labels[key])}
}
let source=plane.createPlaneAt3D(m.emptyGeometryScene3D(),[0,0,0],'XY','alpha').scene
source=m.transactGeometryScene3D(source,s=>s.points.push({id:'P',position:[0,0,4],label:null}))
source=a.createPerpendicularPlaneThroughPoint3D(source,'P',{kind:'plane',id:'alpha'},.4,'beta').scene
source=m.transactGeometryScene3D(source,s=>{Object.assign(s.planes.find(q=>q.id==='beta').display,{show_hidden_edges:false,intersection_mode:'opposite'});s.print_camera={...s.print_camera,position:[8,-10,12],target:[0,0,0],vertical_span:24}})
const original=structuredClone(source)
let doc=source,calls=0,interaction
const history=m.createGeometryHistory3D(doc,next=>{doc=next;interaction?.sync()})
interaction=g.createAuthoringInteraction3D({getScene:()=>doc,getCamera:()=>doc.print_camera,commit:s=>history.commit(s),notify:()=>{}});interaction.select('beta')
const props=(id='beta')=>({scene:doc,selected:doc.planes.find(q=>q.id===id)??null,disabled:false,onCommit:next=>{calls++;interaction.cancel();assert.ok(history.commit(next))}})
const change=(key,value,id='beta')=>render(props(id)).field(key).props.onChange({target:{value}})
for(const [id,color]of [['alpha','#94A3B8'],['beta','#334155']]){
 const ui=render(props(id));assert.equal(ui.field('color').props.value,color);assert.equal(ui.field('width').props.value,1);assert.equal(ui.field('style').props.value,'solid')
 for(const label of Object.values(labels))assert.ok(ui.html.includes(label))
 for(const label of ['Bütöv','Kəsik-kəsik','Nöqtəli'])assert.ok(ui.html.includes(label))
 assert.equal(ui.field('width').props.min,'0.25');assert.equal(ui.field('width').props.max,'8')
 change('color',color.toLowerCase(),id);change('width','1',id);change('style','solid',id)
}
assert.equal(calls,0);assert.equal(history.provider.getSnapshot(),0);assert.deepEqual(doc,original)
change('color','#123abc');assert.equal(calls,1)
assert.deepEqual(doc.planes.find(q=>q.id==='beta').display.stroke,{color:'#123ABC',width:1,style:'solid'})
change('width','0.25');change('style','dashed');change('style','dotted');change('width','8');assert.equal(calls,5)
const changed=structuredClone(doc),flags=history.provider.getSnapshot()
for(const value of ['', '0', '-1', '0.249', '8.001', 'Infinity', 'NaN'])change('width',value)
for(const value of ['red','#123','#1234567'])change('color',value)
change('style','unknown');change('width','8');change('color','#123abc');change('style','dotted')
assert.equal(calls,5);assert.deepEqual(doc,changed);assert.equal(history.provider.getSnapshot(),flags)
const disabled=render({...props(),disabled:true});disabled.field('color').props.onChange({target:{value:'#FFFFFF'}});assert.equal(calls,5)
const selected=doc.planes.find(q=>q.id==='beta'),{stroke,...display}=selected.display
assert.deepEqual({...selected,display},original.planes.find(q=>q.id==='beta'))
assert.deepEqual(doc.planes.find(q=>q.id==='alpha'),original.planes.find(q=>q.id==='alpha'))
assert.deepEqual(doc.points,original.points);assert.deepEqual(doc.constructions,original.constructions);assert.deepEqual(doc.print_camera,original.print_camera);assert.equal(interaction.snapshot().selected,'beta')
for(let i=0;i<5;i++)assert.ok(history.provider.undo());assert.deepEqual(doc,original)
const redo=history.provider.getSnapshot();change('style','solid');assert.equal(history.provider.getSnapshot(),redo);assert.equal(calls,5)
for(let i=0;i<5;i++)assert.ok(history.provider.redo());assert.deepEqual(doc,changed)
change('color','#ABCDEF','alpha');assert.equal(calls,6);assert.deepEqual(doc.planes.find(q=>q.id==='beta').display.stroke,stroke)
const saved=n.serializeGeometryScene3D(doc),reloaded=n.normalizeGeometryScene3D(JSON.parse(saved));assert.deepEqual(reloaded,doc)
for(const id of ['alpha','beta']){
 const setting=plane.planeStrokeSetting3D(reloaded,id),ui=render({...props(id),scene:reloaded,selected:reloaded.planes.find(q=>q.id===id)})
 for(const key of ['color','width','style'])assert.equal(ui.field(key).props.value,setting[key])
 const svg=p.geometrySceneSVG3D(reloaded,800,600);assert.ok(svg.includes(`stroke="${setting.color}"`))
 const group=new THREE.Group();populate(group,reloaded,reloaded.print_camera,800,600,new Set())
 const lines=group.children.filter(q=>q.isLineSegments2&&q.userData.semanticId===id);assert.ok(lines.length)
 for(const line of lines){assert.equal(line.material.color.getHexString(),setting.color.slice(1).toLowerCase());assert.equal(line.material.linewidth,setting.width)}
 group.traverse(q=>{q.geometry?.dispose();if(q.material)q.material.dispose()})
}
assert.equal(render({...props(),selected:null}).field('color'),undefined)
assert.equal(plane.setPlaneStroke3D(doc,'missing',{color:'#000000',width:1,style:'solid'}),null)
// The same Properties path covers outline-based parallel/guided/standalone half planes.
let base=m.transactGeometryScene3D(source,s=>s.points.push({id:'Q',position:[1,0,4],label:null}))
const parallel=a.createParallelPlaneThroughPoint3D(base,'P',{kind:'plane',id:'alpha'},'parallel').scene
const guided=a.createGuidedPerpendicularPlane3D(base,{kind:'plane',id:'alpha'},{kind:'points',a:'P',b:'Q'},'guided').scene
const half=m.transactGeometryScene3D(base,s=>s.planes.push({id:'half',kind:'half_plane',point_ids:[...s.planes.find(q=>q.id==='alpha').point_ids],display:{width:4,height:3,stroke:{color:'#ABC123',width:2,style:'solid'}}}))
for(const [scene,id]of [[parallel,'parallel'],[guided,'guided'],[half,'half']]){
 let next=null;const before=structuredClone(scene),ui=render({scene,selected:scene.planes.find(q=>q.id===id),disabled:false,onCommit:s=>next=s})
 const color=id==='half'?'#ABC123':'#94A3B8',width=id==='half'?2:1
 assert.equal(ui.field('color').props.value,color);ui.field('style').props.onChange({target:{value:'dashed'}})
 assert.deepEqual(next.planes.find(q=>q.id===id).display.stroke,{color,width,style:'dashed'});assert.deepEqual(scene,before)
}
assert.deepEqual(source,original)
console.log('PASS: plane stroke Properties labels/defaults, validation, independent immutable updates, exact history/no-op/redo, retained metadata/selection/camera, save/reopen and SVG/native WebGL parity')
