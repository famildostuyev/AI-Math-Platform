import assert from 'node:assert/strict'
import {printableComponent as load,requireFrontend} from './printable_test_modules.mjs'
const React=requireFrontend('react'),{renderToStaticMarkup}=requireFrontend('react-dom/server'),THREE=requireFrontend('three')
const Controls=load('GeometryPointVisibilityControls').default,PerpControls=load('GeometryPerpendicularControls').default,Editor=load('GeometrySceneEditor').default,Viewport=load('GeometrySceneViewport'),m=load('geometry3dModel'),n=load('geometry3d'),a=load('geometry3dAuthoring'),p=load('geometry3dProjection'),plane=load('geometry3dPlaneAuthoring'),foot=load('geometry3dPlanePerpendicularAuthoring'),solid=load('geometry3dSolidAuthoring'),author=load('geometry3dPointVisibilityAuthoring'),print=load('printableDocumentModel')
const markerLabel='Nöqtənin işarəsini göstər',nameLabel='Nöqtənin adını göstər'
function render(Component,props){
 let tree;function Capture(){tree=Component(props);return tree}
 const html=renderToStaticMarkup(React.createElement(Capture)),nodes=[]
 function visit(e){if(!React.isValidElement(e))return;nodes.push(e);React.Children.forEach(e.props.children,visit)}visit(tree)
 const input=name=>nodes.find(e=>e.type==='input'&&e.props['aria-label']===name)
 return {html,nodes,input}
}
function harness(initial,id){
 let scene=initial,calls=0,interaction
 const history=m.createGeometryHistory3D(scene,next=>{scene=next;interaction?.sync()})
 interaction=a.createAuthoringInteraction3D({getScene:()=>scene,getCamera:()=>scene.print_camera,commit:next=>history.commit(next),notify:()=>{}});interaction.select(id)
 const commit=next=>{calls++;interaction.cancel();assert.ok(history.commit(next))}
 const props=()=>({scene,selected:scene.points.find(q=>q.id===interaction.snapshot().selected)??null,disabled:false,onCommit:commit})
 return {get scene(){return scene},get calls(){return calls},history,interaction,point:()=>scene.points.find(q=>q.id===id),ui:()=>render(Controls,props()),perp:()=>render(PerpControls,{...props(),selected:id}),props}
}
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v)}return v}
let base=m.transactGeometryScene3D(m.emptyGeometryScene3D(),s=>{s.points.push({id:'P',position:[0,0,2],label:'P & α'});s.annotations.push({id:'note',content:'Independent',format:'text',anchor:{kind:'point',point_id:'P'},offset_mm:[0,0]})})
const initial=structuredClone(base),h=harness(freeze(base),'P')
function state(marker,label){
 const ui=h.ui();assert.equal(ui.input(markerLabel).props.checked,marker);assert.equal(ui.input(nameLabel).props.checked,label)
 assert.ok(ui.html.includes(markerLabel));assert.ok(ui.html.includes(nameLabel));assert.equal(ui.nodes.filter(e=>e.type==='input'&&e.props.type==='checkbox').length,2)
 assert.equal(h.interaction.snapshot().selected,'P')
 assert.deepEqual(h.point().position,initial.points[0].position);assert.equal(h.point().label,initial.points[0].label);assert.deepEqual(h.scene.annotations,initial.annotations);assert.deepEqual(h.scene.constructions,initial.constructions)
 const q=p.projectScene3D(h.scene,h.scene.print_camera,800,600,true).points.find(q=>q.id==='P')
 assert.equal(q.markerVisible,marker);assert.equal(q.labelVisible,label)
 const group=new THREE.Group();Viewport.populateGeometrySceneViewport3D(group,h.scene,h.scene.print_camera,800,600,new Set(['P']))
 assert.equal(group.children.some(o=>o.isPoints&&o.userData.semanticId==='P'),marker)
 const svg=p.geometrySceneSVG3D(h.scene);assert.equal(svg.includes('<circle data-id="P"'),marker);assert.equal(svg.includes('>P &amp; α</text>'),label)
 const view=p.createProjection3D(h.scene.print_camera,800,600),xy=view.screen(view.view(h.point().position)),hit=a.pickGeometry3D(h.scene,h.scene.print_camera,{x:xy[0],y:xy[1],width:800,height:600},true)
 assert.equal(hit?.id,marker?'P':undefined)
 const saved=n.normalizeGeometryScene3D(JSON.parse(n.serializeGeometryScene3D(h.scene)));assert.deepEqual(saved,h.scene)
 const reopened=render(Controls,{...h.props(),scene:saved,selected:saved.points.find(q=>q.id==='P')});assert.equal(reopened.input(markerLabel).props.checked,marker);assert.equal(reopened.input(nameLabel).props.checked,label)
 const snapshot={version:1,revisions:[{revision_id:'11111111-1111-4111-8111-111111111111',revision_number:1,blocks:[{id:'geometry',sort_order:0,block_type:'geometry',payload:{format_version:1,source_data:saved}}]}]}
 const prepared=print.preparePrintableDocument(snapshot,'point-properties');assert.equal(prepared.issues.length,0)
 const block=prepared.revisions[0].blocks[0];assert.equal(block.svg,print.namespacePrintableSVG(p.geometrySceneSVG3D(saved,block.size.width,block.size.height),block.scope))
 assert.equal(block.svg.includes('<circle data-id="P"'),marker);assert.equal(block.svg.includes('>P &amp; α</text>'),label)
 return ui
}
state(true,true).input(markerLabel).props.onChange({target:{checked:true}});h.ui().input(nameLabel).props.onChange({target:{checked:true}})
assert.equal(h.calls,0);assert.equal(h.history.provider.getSnapshot(),0);assert.deepEqual(h.scene,initial)
const steps=[[markerLabel,false,false,true],[nameLabel,false,false,false],[markerLabel,true,true,false],[nameLabel,true,true,true]]
for(const [label,value,marker,name] of steps){
 const before=structuredClone(h.scene),source=h.scene,calls=h.calls
 h.ui().input(label).props.onChange({target:{checked:value}});assert.equal(h.calls,calls+1);assert.deepEqual(source,before);state(marker,name)
 if(label===markerLabel&&calls===0)assert.equal(h.point().label_visibility,undefined,'untouched label field stays absent')
 const after=structuredClone(h.scene),flags=h.history.provider.getSnapshot();h.ui().input(label).props.onChange({target:{checked:value}});assert.equal(h.calls,calls+1);assert.equal(h.history.provider.getSnapshot(),flags)
 assert.ok(h.history.provider.undo());assert.deepEqual(h.scene,before)
 const undoFlags=h.history.provider.getSnapshot(),current=h.ui().input(label).props.checked
 h.ui().input(label).props.onChange({target:{checked:current}});assert.equal(h.calls,calls+1);assert.equal(h.history.provider.getSnapshot(),undoFlags)
 assert.ok(h.history.provider.redo());assert.deepEqual(h.scene,after);state(marker,name)
}
const beforeDisabled=structuredClone(h.scene),calls=h.calls,disabled=render(Controls,{...h.props(),disabled:true})
assert.match(disabled.html,/<fieldset disabled/);disabled.input(markerLabel).props.onChange({target:{checked:false}});disabled.input(nameLabel).props.onChange({target:{checked:false}});assert.equal(h.calls,calls);assert.deepEqual(h.scene,beforeDisabled)
for(const text of [null,'']){
 const blank=m.transactGeometryScene3D(initial,s=>s.points[0].label=text),b=harness(blank,'P')
 assert.equal(b.ui().input(nameLabel).props.checked,true);b.ui().input(nameLabel).props.onChange({target:{checked:false}});assert.equal(b.point().label,text);b.ui().input(nameLabel).props.onChange({target:{checked:true}});assert.equal(b.point().label,text)
 assert.equal(p.projectScene3D(b.scene,b.scene.print_camera,800,600,true).points[0].labelVisible,false)
}
// Whole-point visibility remains independent and authoritative, even while the
// teacher changes component preferences. No implicit whole-point reveal occurs.
const whole=harness(m.setGeometryPointVisibility3D(initial,'P','hidden'),'P')
assert.equal(whole.ui().input(markerLabel).props.checked,true);assert.equal(whole.ui().input(nameLabel).props.checked,true)
whole.ui().input(markerLabel).props.onChange({target:{checked:false}});whole.ui().input(nameLabel).props.onChange({target:{checked:false}})
assert.equal(whole.point().visibility,'hidden');assert.equal(p.projectScene3D(whole.scene,whole.scene.print_camera,800,600,true).points.length,0)
const shown=m.setGeometryPointVisibility3D(whole.scene,'P','visible');assert.equal(shown.points[0].marker_visibility,'hidden');assert.equal(shown.points[0].label_visibility,'hidden')
// Foot controls share one authoritative path and never affect right-angle symbols.
let reference=plane.createPlaneAt3D(initial,[0,0,0],'XY','alpha').scene
const f=harness(foot.createPlanePerpendicular3D(reference,'P',{kind:'plane',id:'alpha'},'foot').scene,'foot_H')
const footInitial=structuredClone(f.scene),recipe=()=>f.scene.constructions.find(q=>q.id==='foot')
assert.equal(f.ui().input(markerLabel).props.checked,true);assert.equal(f.ui().input(nameLabel).props.checked,false);assert.equal(f.perp().input('Show perpendicular foot label').props.checked,false)
f.ui().input(nameLabel).props.onChange({target:{checked:false}});f.perp().input('Show perpendicular foot label').props.onChange({target:{checked:false}});assert.equal(f.calls,0);assert.equal(f.point().label_visibility,undefined)
f.ui().input(nameLabel).props.onChange({target:{checked:true}});assert.equal(f.calls,1);assert.equal(recipe().label_visibility,'visible');assert.equal(f.point().label_visibility,'visible');assert.equal(f.point().marker_visibility,undefined);assert.equal(recipe().marker_visibility,'visible');assert.equal(f.perp().input('Show perpendicular foot label').props.checked,true)
const footOn=structuredClone(f.scene);assert.ok(f.history.provider.undo());assert.deepEqual(f.scene,footInitial);assert.ok(f.history.provider.redo());assert.deepEqual(f.scene,footOn)
f.perp().input('Show perpendicular foot label').props.onChange({target:{checked:false}});assert.equal(f.calls,2);assert.equal(f.point().label_visibility,'hidden');assert.equal(recipe().label_visibility,'hidden');assert.equal(f.ui().input(nameLabel).props.checked,false)
f.ui().input(markerLabel).props.onChange({target:{checked:false}});assert.equal(f.calls,3);assert.equal(recipe().marker_visibility,'visible');assert.equal(f.point().label,'H');assert.deepEqual(f.point().position,footInitial.points.find(q=>q.id==='foot_H').position)
assert.equal(p.projectScene3D(f.scene,f.scene.print_camera,800,600,true).lines.filter(q=>q.role==='right_angle').length,2)
for(const selected of [recipe().id,recipe().segment_id]){const old=render(PerpControls,{...f.props(),selected});assert.equal(old.input('Show perpendicular foot label').props.checked,false)}
const footDisabled=render(PerpControls,{...f.props(),selected:'foot_H',disabled:true});footDisabled.input('Show perpendicular foot label').props.onChange({target:{checked:true}});assert.equal(f.calls,3)
// Loaded mixed permissions are displayed consistently, without silently rewriting
// either gate. An explicit enable synchronizes both in one undoable transaction.
for(const [pointGate,constructionGate] of [['hidden','visible'],['visible','hidden']]){
 const mixed=m.transactGeometryScene3D(footInitial,s=>{s.points.find(q=>q.id==='foot_H').label_visibility=pointGate;s.constructions.find(q=>q.id==='foot').label_visibility=constructionGate}),c=harness(mixed,'foot_H')
 assert.equal(c.ui().input(nameLabel).props.checked,false);assert.equal(c.perp().input('Show perpendicular foot label').props.checked,false)
 c.perp().input('Show perpendicular foot label').props.onChange({target:{checked:false}});assert.equal(c.calls,0);assert.deepEqual(c.scene,mixed)
 c.perp().input('Show perpendicular foot label').props.onChange({target:{checked:true}});assert.equal(c.calls,1);assert.equal(c.point().label_visibility,'visible');assert.equal(c.scene.constructions[0].label_visibility,'visible');assert.equal(c.ui().input(nameLabel).props.checked,true)
 assert.ok(c.history.provider.undo());assert.deepEqual(c.scene,mixed)
}
// The same construction family path covers semantic pyramid altitude feet.
let pyramid=solid.createSolid3D(m.emptyGeometryScene3D(),solid.defaultSolid3D('pyramid','pyramid')).scene
const owner=pyramid.solids[0],apex=owner.features.find(q=>q.slot==='v_'+owner.parameters.sides).entity_id,face=owner.features.find(q=>q.slot==='f_0').entity_id
pyramid=foot.createPyramidAltitude3D(pyramid,apex,face,'altitude').scene
const altitude=harness(pyramid,'altitude_H');altitude.ui().input(nameLabel).props.onChange({target:{checked:true}});assert.equal(altitude.calls,1);assert.equal(altitude.point().label_visibility,'visible');assert.equal(altitude.scene.constructions.find(q=>q.kind==='pyramid_altitude').label_visibility,'visible')
// Helper preferences cannot reveal the internal basis; semantic object-list
// recovery remains available for points with either/both components hidden.
const helper=harness(reference,'alpha_x');helper.ui().input(markerLabel).props.onChange({target:{checked:false}});helper.ui().input(markerLabel).props.onChange({target:{checked:true}});assert.ok(!p.scenePrimitives3D(helper.scene).primitives.some(q=>q.id==='alpha_x'))
const dom=requireFrontend('react-dom'),oldPortal=dom.createPortal,oldDocument=globalThis.document
try{dom.createPortal=children=>children;globalThis.document={body:{}};const hidden=harness(initial,'P');hidden.ui().input(markerLabel).props.onChange({target:{checked:false}});hidden.ui().input(nameLabel).props.onChange({target:{checked:false}});const html=renderToStaticMarkup(React.createElement(Editor,{value:hidden.scene,onChange:()=>{},targetId:'frame',disabled:false}));assert.match(html,/<option value="P">/);assert.ok(html.includes('P &amp; α'))}
finally{dom.createPortal=oldPortal;if(oldDocument===undefined)delete globalThis.document;else globalThis.document=oldDocument}
for(const selected of [null,{id:'line',kind:'line',a:'P',b:'Q'}]){const ui=render(Controls,{...h.props(),selected});assert.equal(ui.input(markerLabel),undefined);assert.equal(ui.input(nameLabel),undefined)}
for(const [component,value] of [['other','hidden'],['marker_visibility',true],['label_visibility','bad']])assert.equal(author.setPointComponentVisibility3D(initial,'P',component,value),null)
assert.equal(author.setPointComponentVisibility3D(initial,'missing','marker_visibility','hidden'),null)
console.log('PASS: real Azerbaijani point controls, all combinations, absent defaults, one-commit updates, no-op/redo guards, immutable metadata, coordinated foot/altitude gates, native/SVG/print history parity, recovery and unchanged symbol/picking semantics')
