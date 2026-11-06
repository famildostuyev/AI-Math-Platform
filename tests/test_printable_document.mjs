import assert from 'node:assert/strict'
import test from 'node:test'
import { printableComponent as component, requireFrontend } from './printable_test_modules.mjs'
const React = requireFrontend('react')
const { renderToStaticMarkup } = requireFrontend('react-dom/server')
const PrintableDocument = component('PrintableDocument').default
const { preparePrintableDocument: prepare, namespacePrintableSVG } = component('printableDocumentModel')
const { createPrintableSnapshot } = component('printableRevisionSnapshot')
const model = component('geometry3dModel'), author = component('geometry3dSolidAuthoring'), surface = component('geometry3dSurfacePoints')
const projection = component('geometry3dProjection')
const revisionId = '11111111-1111-4111-8111-111111111111'
const paragraph = content => ({ type: 'paragraph', attrs: { alignment: 'center' }, content })
const text = (value, marks = []) => ({ type: 'text', text: value, marks })
const textBlock = (id = 'text', order = 0, document = { type: 'document', content: [paragraph([text('Sual α')])] }) => ({
  id, sort_order: order, block_type: 'text', payload: { format_version: 1, source_text: 'not the canonical formatted content', document },
})
const geometryBlock = (scene, id = 'geometry', order = 1, visual_placement) => ({ id, block_type: 'geometry', sort_order: order, visual_placement, payload: { format_version: 1, source_data: scene } })
const geometry2D = { schema_version: 1, description: '2D şəkil', viewport: { min_x: 0, min_y: 0, width: 100, height: 100 },
  points: [{ id: 'P', x: 10, y: 20, label: 'Ə₁' }, { id: 'Q', x: 70, y: 70, label: null }], segments: [], polygons: [], texts: [],
  lines: [{ id: 'v', kind: 'vector', start_point_id: 'P', end_point_id: 'Q' }] }
function cylinder(projectionType = 'orthographic') {
  let scene = author.createCylinderAt3D(model.emptyGeometryScene3D(), [0, 0, 0], 'XY', 'C').scene
  scene = surface.createPointOnCylinderSurface3D(scene, 'C_surface', [0, .5], 'attached')
  scene = surface.editCylinderSurfacePointLabel3D(scene, 'attached', 'M₁ α & <β>')
  scene.print_camera = { ...scene.print_camera, projection: projectionType, position: [10, 0, 3], target: [0, 0, 1], up: [0, 0, 1] }
  return scene
}
function snapshot(blocks) {
  return createPrintableSnapshot([revisionId], [{ revision_id: revisionId, revision_number: 2, updated_at: '2026-10-18T10:00:00Z',
    question_family_id: revisionId, question_form_id: revisionId, status: 'draft', question_type_id: revisionId,
    source_id: null, source_detail: null, source_display_name: null, primary_topic_id: null, related_topic_ids: [], purpose_ids: [], difficulty: null,
    blocks, answer_policy: 'accepted_answer', accepted_answers: [{ text: 'SECRET_ANSWER' }], answer_options: [], solution: { text: 'SECRET_SOLUTION' },
  }])
}
const render = (data, instanceId = 'test') => renderToStaticMarkup(React.createElement(PrintableDocument, { snapshot: data, instanceId }))

test('guided perpendicular planes print clipped intersections and retain linked display settings',()=>{
 const plane=component('geometry3dPlaneAuthoring'),constructed=component('geometry3dConstructedPlaneAuthoring'),Controls=component('GeometryPlaneControls').default,Viewport=component('GeometrySceneViewport').default,guided=component('geometry3dGuidedPlane')
 let scene=plane.createPlaneAt3D(model.emptyGeometryScene3D(),[0,0,0],'XY','alpha').scene
 scene=model.transactGeometryScene3D(scene,s=>s.points.push({id:'A',position:[0,0,1],label:'A'},{id:'B',position:[1,0,2],label:'B'}))
 scene=constructed.createGuidedPerpendicularPlane3D(scene,{kind:'plane',id:'alpha'},{kind:'points',a:'A',b:'B'},'beta').scene;assert.ok(scene)
 const selected=scene.planes.find(p=>p.id==='beta'),controls=renderToStaticMarkup(React.createElement(Controls,{scene,selected,disabled:false,onCommit:()=>{}}))
 assert.ok(controls.includes('Kəsişmə xəttini göstər'));assert.ok(controls.includes('Aşağı hissəni istinad müstəvisində kəs'));assert.ok(!controls.includes('İstiqaməti redaktə et'))
 for(const mode of ['orthographic','perspective']){
  const camera={...scene.print_camera,projection:mode,position:[7,-8,9]},data=snapshot([geometryBlock({...scene,print_camera:camera})]),before=JSON.stringify(data),html=render(data)
  assert.equal(prepare(data,'guided').exportable,true);assert.match(html,/data-render-curve="plane_intersection"/);assert.ok(!html.includes('data-id="beta_origin"'));assert.equal(JSON.stringify(data),before)
  const editor=renderToStaticMarkup(React.createElement(Viewport,{scene,camera,interactive:true,guidedIntersectionPreview:guided.guidedIntersectionSegments3D(scene,{kind:'plane',id:'alpha'},{kind:'points',a:'A',b:'B'})}));assert.match(editor,/data-guided-plane-intersection-preview/);assert.ok(!html.includes('data-guided-plane-intersection-preview'))
 }
 const hidden=model.transactGeometryScene3D(scene,s=>{const d=s.planes.find(p=>p.id==='beta').display;d.intersection_visibility='hidden';d.lower_portion='upper'});assert.ok(hidden);assert.ok(!render(snapshot([geometryBlock(hidden)])).includes('data-render-curve="plane_intersection"'))
})

test('perpendicular-plane orientation controls and editor-only handle stay out of saved print',()=>{
 const plane=component('geometry3dPlaneAuthoring'),constructed=component('geometry3dConstructedPlaneAuthoring'),display=component('geometry3dPlaneDisplay'),Controls=component('GeometryPlaneControls').default,Viewport=component('GeometrySceneViewport').default
 let scene=plane.createPlaneAt3D(model.emptyGeometryScene3D(),[0,0,0],'XY','alpha').scene
 scene=model.transactGeometryScene3D(scene,s=>s.points.push({id:'P',position:[0,0,2],label:'P',visibility:'hidden'}))
 scene=constructed.createPerpendicularPlaneThroughPoint3D(scene,'P',{kind:'plane',id:'alpha'},.6,'beta').scene;assert.ok(scene)
 const selected=scene.planes.find(p=>p.id==='beta'),controls=renderToStaticMarkup(React.createElement(Controls,{scene,selected,disabled:false,onCommit:()=>{},onEditOrientation:()=>{}}))
 assert.ok(controls.includes('İstiqaməti redaktə et'));assert.ok(controls.includes('perpendikulyar'));assert.ok(controls.includes('Kəsişmə xəttini göstər'));assert.match(controls,/checked/)
 const f=display.planeDisplay3D(selected,scene),contour=[...f.contour,f.contour[0]],handle=[f.o,projection.add(f.o,projection.scale(f.x,2))]
 for(const mode of ['orthographic','perspective']){
  const camera={...scene.print_camera,projection:mode,position:[7,-8,9]},editor=renderToStaticMarkup(React.createElement(Viewport,{scene,camera,interactive:true,constructionPreview:contour,constructionPreviewPlane:true,orientationHandlePreview:handle,orientationHandleContour:component('geometry3dConstructedPlane').perpendicularPlaneDisplay3D(scene,'P',{kind:'plane',id:'alpha'},.6).contour,intersectionLinePreview:component('geometry3dConstructedPlane').perpendicularPlaneDisplay3D(scene,'P',{kind:'plane',id:'alpha'},.6).segments}))
  assert.match(editor,/data-plane-orientation-handle/);assert.match(editor,/data-plane-intersection-preview/);assert.match(editor,/<clipPath/);assert.match(editor,/clip-path="url\(#/)
  const value={...scene,print_camera:camera},data=snapshot([geometryBlock(value)]),before=JSON.stringify(data),html=render(data)
  assert.match(html,/data-render-curve="plane_intersection"/);const hidden=model.transactGeometryScene3D(value,s=>s.planes.find(p=>p.id==='beta').display.intersection_visibility='hidden');assert.ok(!render(snapshot([geometryBlock(hidden)])).includes('data-render-curve="plane_intersection"'));assert.equal(prepare(data,'perpendicular-plane').exportable,true);assert.match(html,/data-id="beta"/);assert.ok(!html.includes('data-id="beta_origin"'));assert.ok(!html.includes('data-id="P"'));assert.ok(!html.includes('data-plane-orientation-handle'));assert.equal(JSON.stringify(data),before)
 }
})

test('stored intersection modes reach saved-camera printed surfaces without changing snapshots',()=>{
 const plane=component('geometry3dPlaneAuthoring'),constructed=component('geometry3dConstructedPlaneAuthoring')
 let scene=plane.createPlaneAt3D(model.emptyGeometryScene3D(),[0,0,0],'XY','alpha').scene
 scene=model.transactGeometryScene3D(scene,s=>s.points.push({id:'P',position:[0,0,-8],label:null}))
 scene=constructed.createPerpendicularPlaneThroughPoint3D(scene,'P',{kind:'plane',id:'alpha'},.6,'beta').scene
 for(const intersectionMode of ['cross','first','opposite'])for(const mode of ['orthographic','perspective']){
  const value=model.transactGeometryScene3D(scene,s=>{s.planes.find(q=>q.id==='beta').display.intersection_mode=intersectionMode;s.print_camera={...s.print_camera,projection:mode,position:[12,-16,14],vertical_span:40,fov_degrees:100}})
  const data=snapshot([geometryBlock(value)]),before=JSON.stringify(data),html=render(data)
  assert.equal((html.match(/<polygon data-id="beta"/g)??[]).length,intersectionMode==='cross'?2:1)
  assert.match(html,/data-render-curve="plane_intersection"/);assert.equal(prepare(data,'modes').exportable,true);assert.equal(JSON.stringify(data),before)
 }
})

test('hidden source point stays recoverable in the editor selector and disappears from print',()=>{
 const plane=component('geometry3dPlaneAuthoring'),constructed=component('geometry3dConstructedPlaneAuthoring'),Editor=component('GeometrySceneEditor').default
 let scene=plane.createPlaneAt3D(model.emptyGeometryScene3D(),[0,0,0],'XY','alpha').scene
 scene=model.transactGeometryScene3D(scene,s=>s.points.push({id:'P',position:[0,0,2],label:'Source α'}))
 scene=constructed.createParallelPlaneThroughPoint3D(scene,'P',{kind:'plane',id:'alpha'},'beta').scene
 scene=model.setGeometryPointVisibility3D(scene,'P','hidden');assert.ok(scene)
 // Render the real selector; only its browser-only portal host is stubbed for SSR.
 const dom=requireFrontend('react-dom'),portal=dom.createPortal,previousDocument=globalThis.document
 let editor
 try{dom.createPortal=children=>children;globalThis.document={body:{}};editor=renderToStaticMarkup(React.createElement(Editor,{value:scene,onChange:()=>{},targetId:'frame-1',disabled:false}))}
 finally{dom.createPortal=portal;if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument}
 assert.match(editor,/<option value="P">/);assert.ok(editor.includes('Source α'))
 for(const projectionType of ['orthographic','perspective']){
  scene.print_camera={...scene.print_camera,projection:projectionType}
  const data=snapshot([geometryBlock(scene)]),before=JSON.stringify(data),html=render(data)
  assert.equal(prepare(data,'hidden-point').exportable,true);assert.ok(!html.includes('data-id="P"'));assert.ok(!html.includes('Source α'));assert.match(html,/data-id="beta"/);assert.equal(JSON.stringify(data),before)
 }
 const shown=model.setGeometryPointVisibility3D(scene,'P','visible'),html=render(snapshot([geometryBlock(shown)]));assert.match(html,/data-id="P"/);assert.ok(html.includes('Source α'))
})

test('constructed parallel planes use ordinary print patches without internal points',()=>{
 const plane=component('geometry3dPlaneAuthoring'),constructed=component('geometry3dConstructedPlaneAuthoring')
 let source=plane.createPlaneAt3D(model.emptyGeometryScene3D(),[0,0,0],'XY','alpha').scene
 source=model.transactGeometryScene3D(source,s=>s.points.push({id:'P',position:[0,0,2],label:'P'}))
 const created=constructed.createParallelPlaneThroughPoint3D(source,'P',{kind:'plane',id:'alpha'},'beta');assert.ok(created.scene)
 for(const shape of ['rectangle','parallelogram','cloud'])for(const mode of ['orthographic','perspective']){
  const next=plane.setPlaneShape3D(created.scene,'beta',shape,.4);next.print_camera={...next.print_camera,projection:mode}
  const data=snapshot([geometryBlock(next)]),before=JSON.stringify(data),html=render(data)
  assert.equal(prepare(data,'constructed-plane').exportable,true);assert.match(html,/data-id="beta"/);assert.ok(!html.includes('data-id="beta_origin"'));assert.ok(!html.includes('data-id="beta_x"'));assert.ok(!html.includes('data-id="beta_y"'));assert.equal(JSON.stringify(data),before)
 }
})

test('plane-parallel line/ray/segment print with hidden semantic helpers',()=>{
 const plane=component('geometry3dPlaneAuthoring'),parallel=component('geometry3dParallelAuthoring')
 let scene=plane.createPlaneAt3D(model.emptyGeometryScene3D(),[0,0,0],'XY','plane').scene
 scene=model.transactGeometryScene3D(scene,s=>s.points.push({id:'P',position:[0,0,2],label:'P'}))
 scene=parallel.createPlaneParallel3D(scene,'P',{kind:'plane',id:'plane',angle_radians:.6},'C').scene
 for(const output_kind of ['line','ray','segment'])for(const mode of ['orthographic','perspective']){
  const next=parallel.editParallel3D(scene,'C',{output_kind,length:2.5,direction:'reverse'});next.print_camera={...next.print_camera,projection:mode}
  const data=snapshot([geometryBlock(next)]),before=JSON.stringify(data),html=render(data)
  assert.equal(prepare(data,'plane-parallel').exportable,true);assert.match(html,/data-id="C_object"/);assert.ok(!html.includes('data-id="C_end"'));assert.equal(JSON.stringify(data),before)
 }
})

test('plane perpendicular and semantic pyramid altitude print from immutable canonical scenes',()=>{
  const planeAuthor=component('geometry3dPlaneAuthoring'),perp=component('geometry3dPlanePerpendicularAuthoring')
  let scene=planeAuthor.createPlaneAt3D(model.emptyGeometryScene3D(),[0,0,0],'XY','plane').scene
  scene=model.transactGeometryScene3D(scene,s=>s.points.push({id:'P',position:[5,0,2],label:'P'}))
  scene=perp.createPlanePerpendicular3D(scene,'P',{kind:'plane',id:'plane'},'perp').scene
  const spec=author.defaultRegularPyramid3D('pyramid')
  let pyramid=author.createSolid3D(model.emptyGeometryScene3D(),spec).scene
  pyramid=perp.createPyramidAltitude3D(pyramid,'pyramid_v_3','pyramid_f_0','altitude').scene
  for(const source of [scene,pyramid])for(const mode of ['orthographic','perspective']){
    source.print_camera={...source.print_camera,projection:mode,position:[8,-9,7],target:[0,0,0]}
    const data=snapshot([geometryBlock(source)]),before=JSON.stringify(data),plan=prepare(data,'plane-altitude'),html=render(data,'plane-altitude')
    assert.equal(plan.exportable,true,JSON.stringify(plan.issues));assert.match(html,/data-render-curve="right_angle"/);assert.ok(!html.includes('>H<'));assert.equal(JSON.stringify(data),before)
    if(source.constructions[0].kind==='pyramid_altitude'){assert.match(html,/data-construction="altitude"/);assert.match(html,/stroke-width="1.8"/);assert.match(html,/opacity="0.85"/)}
  }
})
test('semantic parallel line/ray/segment print with hidden helpers and preserved snapshots',()=>{
 const parallel=component('geometry3dParallelAuthoring'),Controls=component('GeometryParallelControls').default
 let source=model.transactGeometryScene3D(model.emptyGeometryScene3D(),s=>{s.points.push({id:'A',position:[-2,0,0],label:'A'},{id:'B',position:[2,0,0],label:'B'},{id:'P',position:[0,2,0],label:'P'});s.linear_objects.push({id:'AB',kind:'ray',a:'A',b:'B'})})
 source=parallel.createParallel3D(source,'P',{kind:'linear',id:'AB'},'C').scene
 for(const output_kind of ['line','ray','segment']){
  const scene=parallel.editParallel3D(source,'C',{output_kind,direction:'reverse',length:3}),data=snapshot([geometryBlock(scene)]),before=JSON.stringify(data),html=render(data)
  assert.match(html,/data-id="C_object"/);assert.doesNotMatch(html,/data-id="C_end"/);assert.equal(JSON.stringify(data),before)
  const controls=renderToStaticMarkup(React.createElement(Controls,{scene,selected:'C_object',disabled:false,onCommit:()=>{}}))
  assert.match(controls,/Parallel output type/);assert.equal(controls.includes('Parallel direction'),output_kind!=='line');assert.equal(controls.includes('Parallel segment length'),output_kind==='segment')
 }
})
test('semantic 3D perpendicular feet, right-angle markers and exterior extensions print canonically',()=>{
 const perpendicular=component('geometry3dPerpendicularAuthoring')
 let scene=model.transactGeometryScene3D(model.emptyGeometryScene3D(),s=>{s.points.push({id:'A',position:[0,0,0],label:'A'},{id:'B',position:[1,0,0],label:'B'},{id:'P',position:[2,2,0],label:'P'});s.linear_objects.push({id:'AB',kind:'segment',a:'A',b:'B'})})
 scene=perpendicular.createPerpendicular3D(scene,'P',{kind:'linear',id:'AB'},'C').scene
 assert.ok(scene);const data=snapshot([geometryBlock(scene)]),before=JSON.stringify(data),html=render(data)
 assert.match(html,/construction_extension/);assert.match(html,/right_angle/);assert.doesNotMatch(html,/>H<\/text>/);assert.match(html,/<circle[^>]*data-id="C_H"/);assert.equal(JSON.stringify(data),before)
 const shown=perpendicular.editPerpendicularDisplay3D(scene,'C',{label_visibility:'visible'})
 assert.match(render(snapshot([geometryBlock(shown)])),/>H<\/text>/)
})
test('canonical paragraphs, all formatting, hard breaks and lists render statically', () => {
  const marks = [{ type: 'bold' }, { type: 'italic' }, { type: 'underline' }, { type: 'font_family', value: 'times-new-roman' },
    { type: 'font_size', value: 18 }, { type: 'foreground_color', value: '#123456' }, { type: 'background_color', value: '#abcdef' }]
  const document = { type: 'document', content: [paragraph([text('Mətn <&>', marks), { type: 'hard_break' }, text('son')]),
    ...['bullet_list', 'ordered_list'].map(type => ({ type, content: [{ type: 'list_item', content: [paragraph([text('Bənd')]), paragraph([text('ikinci')])] }] }))] }
  const data = snapshot([textBlock('formatted', 0, document)])
  const html = render(data)
  for (const fragment of ['<strong>', '<em>', '<u>', '18pt', '#123456', '#abcdef', 'Times New Roman', 'text-align:center', '<br/>', '<ul>', '<ol>', '<li>', 'Mətn &lt;&amp;&gt;']) assert.ok(html.includes(fragment), fragment)
  assert.ok(!html.includes('not the canonical')); assert.equal(prepare(data, 'test').exportable, true)
})
test('inline and display math use actual KaTeX HTML and MathML', () => {
  const data = snapshot([textBlock('inline', 0, { type: 'document', content: [paragraph([text('x = '), { type: 'inline_math', latex: '\\frac{1}{2}' }])] }),
    { id: 'formula', block_type: 'formula', sort_order: 1, payload: { source_latex: '\\sum_{i=1}^n i', format_version: 1 } }])
  const html = render(data)
  assert.ok(html.includes('class="katex"')); assert.ok(html.includes('<math')); assert.ok(html.includes('katex-display'))
  assert.equal(prepare(data, 'math').issues.length, 0)
})
test('mixed content preserves canonical order and renders real 2D and 3D SVG', () => {
  const data = snapshot([geometryBlock(cylinder(), 'three', 3), geometryBlock(geometry2D, 'two', 2), textBlock('first', 0),
    { id: 'formula', block_type: 'formula', sort_order: 1, payload: { source_latex: 'x^2' } }])
  const html = render(data)
  assert.deepEqual([...html.matchAll(/data-block-id="([^"]+)"/g)].map(m => m[1]), ['first', 'formula', 'two', 'three'])
  assert.ok(html.includes('data-geometry-kind="vector"')); assert.ok(html.includes('data-render-surface="lateral"'))
  assert.ok(html.includes('Ə₁')); assert.ok(html.includes('M₁ α &amp; &lt;β&gt;'))
  assert.equal(prepare(data, 'mixed').exportable, true)
})
test('null/empty labels keep semantic markers without generated names', () => {
  for (const label of [null, '']) {
    const scene = surface.editCylinderSurfacePointLabel3D(cylinder(), 'attached', label)
    const html = render(snapshot([geometryBlock(scene)]))
    assert.ok(html.includes('data-id="attached"')); assert.ok(!html.includes('M₁'))
    assert.ok(!html.includes('>A</text>'))
    const centers = prepare(snapshot([geometryBlock(scene)]), 'centers').revisions[0].blocks[0].node.geometryV2.points.filter(point => /^C_v_/.test(point.id))
    assert.deepEqual(centers.map(point => point.label), ['O1', 'O2']) // Visibility still follows normal occlusion.
  }
})
for (const camera of ['orthographic', 'perspective']) test(`saved ${camera} camera drives SVG independently of editor session`, () => {
  const scene = cylinder(camera), data = snapshot([geometryBlock(scene)])
  const block = prepare(data, 'camera').revisions[0].blocks[0]
  const expected = namespacePrintableSVG(projection.geometrySceneSVG3D(scene, 520, 400), block.scope)
  assert.equal(block.svg, expected)
  const changed = { ...scene, print_camera: { ...scene.print_camera, position: [-10, 0, 3] } }
  assert.notEqual(block.svg, namespacePrintableSVG(projection.geometrySceneSVG3D(changed, 520, 400), block.scope))
  // A real editor provider cannot influence this component: it never consumes session context.
  const { UniversalEditorSessionContext } = component('universalEditorSession')
  const session = { geometry3DCameras: { current: new Map([['geometry', changed.print_camera]]) } }
  const withinSession = renderToStaticMarkup(React.createElement(UniversalEditorSessionContext.Provider, { value: session }, React.createElement(PrintableDocument, { snapshot: data, instanceId: 'test' })))
  assert.equal(withinSession, render(data))
})
test('multiple scenes and repeated documents namespace mask/marker/title identifiers', () => {
  let scene = cylinder()
  scene = author.createSolid3D(scene, author.defaultSolid3D('cube', 'cube')).scene
  const data = snapshot([geometryBlock(scene, 'one'), geometryBlock(scene, 'two', 2), geometryBlock(geometry2D, 'flat', 3)])
  const html = render(data, 'left') + render(data, 'right')
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1])
  assert.ok(ids.some(id => id.includes('g3d')), 'fixture must exercise actual mask definitions')
  assert.equal(ids.length, new Set(ids).size)
  for (const match of html.matchAll(/url\(#([^)]+)\)/g)) assert.ok(ids.includes(match[1]), match[1])
  for (const match of html.matchAll(/aria-labelledby="([^"]+)"/g)) assert.ok(ids.includes(match[1]))
  assert.ok(html.includes('data-render-surface="lateral"'))
  const scoped = namespacePrintableSVG('<svg><mask id="m"/><circle data-id="point" mask="url(#m)"/></svg>', 'instance')
  assert.ok(scoped.includes('id="instance_m"')); assert.ok(scoped.includes('data-id="point"')); assert.ok(scoped.includes('url(#instance_m)'))
})
test('saved floating coordinates, dimensions, reference camera aspect and document bounds preserved', () => {
  const placement = { version: 1, layoutMode: 'floating', anchor: { kind: 'document' }, position: { x: 23, y: 75, unit: 'px' }, size: { width: 640, height: 360, unit: 'px' } }
  const data = snapshot([textBlock(), geometryBlock(cylinder(), 'placed', 1, placement)])
  const plan = prepare(data, 'placement'), html = render(data)
  assert.equal(plan.revisions[0].minWidth, 663); assert.equal(plan.revisions[0].minHeight, 435)
  assert.ok(html.includes('position:absolute;left:23px;top:75px;width:640px;height:360px'))
  assert.ok(html.includes('viewBox="0 0 640 360"')); assert.deepEqual(plan.revisions[0].blocks[1].placement, placement)
})
test('unplaced geometry remains in normal flow; no invented floating origin', () => {
  const html = render(snapshot([textBlock(), geometryBlock(cylinder())]))
  assert.ok(html.includes('position:relative;width:520px;height:400px')); assert.ok(!html.includes('position:absolute'))
})
test('images, reserved and future block types are visible export-blocking issues', () => {
  for (const type of ['image', 'graph', 'table', 'diagram', 'future_block']) {
    const data = snapshot([{ id: 'unsupported', block_type: type, sort_order: 0, payload: { media_asset_id: revisionId, alt_text: 'Şəkil' } }, textBlock('kept', 1)])
    const plan = prepare(data, 'unsupported'), html = render(data)
    assert.equal(plan.exportable, false); assert.equal(plan.issues[0].code, 'unsupported_block')
    assert.equal(plan.issues[0].revisionId, revisionId); assert.equal(plan.issues[0].blockId, 'unsupported')
    assert.ok(html.includes('role="alert"')); assert.ok(html.includes('data-printable-valid="false"')); assert.ok(html.includes('Sual α'))
  }
})
test('invalid geometry and unavailable analytic surfaces do not silently render blank SVG', () => {
  const cone = cylinder(); cone.solids[0].kind = 'cone'
  for (const source of [{ schema_version: 999 }, cone]) {
    const data = snapshot([geometryBlock(source)]), plan = prepare(data, 'bad')
    assert.equal(plan.exportable, false); assert.equal(plan.issues[0].code, 'unsupported_geometry')
    assert.ok(!render(data).includes('<svg'))
  }
})
test('unsupported placement is explicit rather than silently repositioned', () => {
  const placement = { version: 1, layoutMode: 'floating', anchor: { kind: 'document' }, position: { x: 0, y: 0, unit: 'px' }, size: { width: 400, height: 300, unit: 'px' } }
  for (const invalid of [{ ...placement, rotationDegrees: 30 }, { ...placement, anchor: { kind: 'node', nodeId: 'text' } }, { ...placement, size: { ...placement.size, unit: 'relative' } }]) {
    const data = snapshot([geometryBlock(cylinder(), 'badframe', 1, invalid)])
    assert.equal(prepare(data, 'placement').issues[0].code, 'unsupported_placement')
    assert.ok(render(data).includes('role="alert"'))
  }
})
test('unknown structured nodes, marks and invalid mathematics are explicit validation failures', () => {
  const documents = [
    { type: 'document', content: [{ type: 'future_node', content: [] }] },
    { type: 'document', content: [paragraph([{ type: 'future_inline' }])] },
    { type: 'document', content: [paragraph([text('text', [{ type: 'link', value: 'https://example.com' }])])] },
    { type: 'document', content: [paragraph([{ type: 'inline_math', latex: '\\notARealCommand{a}' }])] },
  ]
  for (const document of documents) {
    const data = snapshot([textBlock('badtext', 0, document)])
    assert.equal(prepare(data, 'text').issues[0].code, 'invalid_content'); assert.ok(render(data).includes('role="alert"'))
  }
})
test('rendering is deterministic, keeps snapshot frozen and excludes answers/solutions', () => {
  const data = snapshot([textBlock(), geometryBlock(cylinder())]), before = JSON.stringify(data)
  const html = render(data, 'same'); assert.equal(render(data, 'same'), html)
  assert.equal(JSON.stringify(data), before); assert.ok(Object.isFrozen(data.revisions[0].blocks[1].payload.source_data))
  assert.ok(!html.includes('SECRET_')); assert.ok(!html.includes('contenteditable')); assert.ok(!html.includes('<button')); assert.ok(!html.includes('<canvas'))
  assert.throws(() => prepare(data, ''), /instanceId/)
})
test('multiple saved revisions retain separate document coordinate origins and content boundaries', () => {
  const first = snapshot([textBlock('shared-text'), geometryBlock(cylinder(), 'shared-geometry')]).revisions[0]
  const data = { version: 1, revisions: [first, { ...first, revision_id: '22222222-2222-4222-8222-222222222222' }] }
  const html = render(data), plan = prepare(data, 'boundary')
  assert.deepEqual([...html.matchAll(/data-revision-id="([^"]+)"/g)].map(m => m[1]), data.revisions.map(r => r.revision_id))
  assert.notEqual(plan.revisions[0].blocks[1].scope, plan.revisions[1].blocks[1].scope)
  assert.equal((html.match(/data-block-id="shared-geometry"/g) ?? []).length, 2)
})
