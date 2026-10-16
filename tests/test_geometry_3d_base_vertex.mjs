import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {loadGeometryModule} from './geometry_test_modules.mjs'
const a=await loadGeometryModule('geometry3dSolidAuthoring'),m=await loadGeometryModule('geometry3dModel'),g=await loadGeometryModule('geometry3dAuthoring'),p=await loadGeometryModule('geometry3dProjection'),n=await loadGeometryModule('geometry3d')
const close=(a,b)=>assert.ok(Math.hypot(...a.map((v,i)=>v-b[i]))<1e-8,`${a} ~= ${b}`)
const fixtures=[]
for(const kind of ['legacy','template','face'])for(const tilted of [false,true]){
  let source=m.emptyGeometryScene3D(),def=a.defaultSolid3D('pyramid','py')
  def.frame=a.solidFrame3D([.3,-.2,.4],tilted?[25,30,10]:[0,0,0])
  if(kind==='legacy')def.parameters={sides:4,radius:2,height:2}
  else if(kind==='face'){
    source.points=[[0,0,0],[3,0,1],[3,3,2],[0,3,1]].map((position,i)=>({id:`b${i}`,position,label:null}));source.faces=[{id:'base',boundary:source.points.map(p=>p.id)}]
    def.parameters={sides:4,height:-2,base:{kind:'face',face_id:'base',point_ids:source.faces[0].boundary},apex_offset:[.1,.2]}
  }
  source=a.createSolid3D(source,def).scene;source.print_camera.position=[10,9,12];source.print_camera.target=[1,1,0];source.points.find(p=>p.id==='py_v_1').label='B'
  for(const index of [0,1,2,3]){
    const id=`py_v_${index}`,info=a.pyramidBaseDrag3D(source,id);assert.ok(info)
    const tangent=p.unit(p.sub(info.base[(index+1)%4],info.position)),target=p.add(info.position,p.scale(tangent,-.2)),edited=a.movePyramidBaseVertex3D(source,id,target)
    assert.ok(edited,`${kind}/${tilted}/${index}`);assert.equal(edited.solids[0].parameters.base.kind,'polygon')
    close(edited.points.find(p=>p.id===id).position,target)
    for(const point of source.points)if(point.id!==id)close(edited.points.find(p=>p.id===point.id).position,point.position)
    assert.deepEqual(edited.solids[0].features,source.solids[0].features)
    for(const key of ['edges','faces'])assert.deepEqual(edited[key],source[key])
    assert.equal(edited.points.find(p=>p.id==='py_v_1').label,'B')
    assert.deepEqual(n.normalizeGeometryScene3D(JSON.parse(n.serializeGeometryScene3D(edited))),edited)
    assert.equal(a.movePyramidBaseVertex3D(source,id,info.position),source,'no-op does not convert')
    assert.equal(a.movePyramidBaseVertex3D(source,id,p.add(info.position,info.normal)),null,'out of plane rejected')
    assert.equal(a.movePyramidBaseVertex3D(source,id,info.base[(index+1)%4]),null,'duplicate rejected')
    assert.equal(a.movePyramidBaseVertex3D(source,id,[NaN,0,0]),null)
    if(index===1)fixtures.push({name:`${kind}_${tilted?'tilted':'flat'}`,source,edited})
    for(const projection of ['orthographic','perspective']){
      const camera={...source.print_camera,projection},pr=p.createProjection3D(camera,900,700)
      let grab=[0,0,0]
      const pointer=pos=>{const [x,y]=pr.screen(pr.view(p.add(pos,grab)));return {x,y,width:900,height:700,pointerId:1,button:0,altKey:false}}
      let document=source,commits=0;const history=m.createGeometryHistory3D(source,next=>document=next),interaction=g.createAuthoringInteraction3D({getScene:()=>document,getCamera:()=>camera,commit:next=>{const done=history.commit(next);if(done)commits++;return done},notify:()=>{}})
      interaction.setPlane('YZ');const start=pointer(info.position);start.x+=3;start.y+=2
      grab=p.sub(g.planePoint3D(camera,start,info.normal,info.position),info.position)
      const end=pointer(target)
      interaction.pointer('down',start);interaction.pointer('up',start);assert.equal(commits,0);assert.deepEqual(document,source)
      interaction.pointer('down',start);assert.equal(interaction.snapshot().selected,id,`${kind}/${tilted}/${index}/${projection} picking`);for(let i=1;i<=6;i++)interaction.pointer('move',pointer(p.add(info.position,p.scale(p.sub(target,info.position),i/6))))
      assert.equal(commits,0);assert.ok(interaction.snapshot().draft,`${kind}/${tilted}/${index}/${projection}: ${interaction.snapshot().message}`);close(interaction.snapshot().draft.points.find(p=>p.id===id).position,target)
      interaction.pointer('cancel',end);assert.equal(interaction.snapshot().draft,null);assert.deepEqual(document,source)
      interaction.pointer('down',start);interaction.pointer('move',end);interaction.cancel();assert.deepEqual(document,source)
      interaction.pointer('down',start);interaction.pointer('move',end);interaction.pointer('move',start);interaction.pointer('up',start);assert.equal(commits,0,'out-and-back no-op preserves representation')
      interaction.pointer('down',start);interaction.pointer('move',end);interaction.pointer('up',end);assert.equal(commits,1)
      close(document.points.find(p=>p.id===id).position,target)
      const completed=structuredClone(document);assert.ok(history.provider.undo());assert.deepEqual(document,source);assert.equal(history.provider.undo(),false);assert.ok(history.provider.redo());assert.deepEqual(document,completed)
      const again=a.movePyramidBaseVertex3D(document,id,p.add(target,p.scale(tangent,-.1)));assert.ok(again);close(again.points.find(p=>p.id==='py_v_4').position,info.apex)
      assert.ok(a.movePyramidApexParallel3D(document,'py_v_4',p.add(info.apex,p.scale(tangent,.1))))
      assert.ok(a.changePyramidHeight3D(document,'py_v_4',Math.sign(def.parameters.height)*.2))
    }
  }
}
// Invalid authoritative parameters must fail even though cached evaluated geometry remains valid.
const valid=fixtures[2].edited,raw=structuredClone(valid.solids[0].parameters.base.vertices)
const invalidBases=[raw.map((v,i)=>i===1?raw[0]:v),raw.map((v,i)=>i===2?p.add(v,[0,0,1]):v),[raw[0],raw[2],raw[1],raw[3]],raw.map((v,i)=>[i,0,0]),raw.map((v,i)=>i===1?[Infinity,0,0]:v),raw.slice(0,3),[[0,0,0],[3,0,0],[2,0,0],[0,3,0]],[[0,0,0],[1,0,0],[2,0,0],[0,2,0]]]
for(const vertices of invalidBases){const bad=structuredClone(valid);bad.solids[0].parameters.base.vertices=vertices;assert.equal(n.normalizeGeometryScene3D(bad),null);assert.equal(m.evaluateGeometryScene3D(bad).status,'invalid')}
// Self dependency must not be introduced; source points and faces survive detachment unchanged.
const face=fixtures.find(f=>f.name==='face_tilted'),oldSources=face.source.points.filter(p=>p.id.startsWith('b'))
assert.deepEqual(face.edited.points.filter(p=>p.id.startsWith('b')),oldSources)
assert.ok(m.moveGeometryPoint3D(face.edited,'b1',[4,0,4/3]));assert.deepEqual(m.moveGeometryPoint3D(face.edited,'b1',[4,0,4/3]).points.filter(p=>p.id.startsWith('py')),face.edited.points.filter(p=>p.id.startsWith('py')))
const faceFlat=fixtures.find(f=>f.name==='face_flat').source,coincidentDefinition=structuredClone(faceFlat.solids[0]);coincidentDefinition.frame=a.solidFrame3D([0,0,0],[0,0,0])
const coincident=a.editSolid3D(faceFlat,coincidentDefinition),coincidentInfo=a.pyramidBaseDrag3D(coincident,'py_v_1'),coincidentProjection=p.createProjection3D(coincident.print_camera,900,700),[cx,cy]=coincidentProjection.screen(coincidentProjection.view(coincidentInfo.position)),cp={x:cx,y:cy,width:900,height:700,pointerId:1,button:0,altKey:false}
assert.equal(g.pickGeometry3D(coincident,coincident.print_camera,cp).id,'py_v_1','coincident source polygon must not intercept pyramid base selection')
assert.equal(g.pickGeometry3D(coincident,coincident.print_camera,cp,true).id,'b1','point construction picking retains its existing source point semantics')
let coincidentDocument=coincident
const coincidentInteraction=g.createAuthoringInteraction3D({getScene:()=>coincidentDocument,getCamera:()=>coincident.print_camera,commit:next=>{coincidentDocument=next;return true},notify:()=>{}})
const ct=p.add(coincidentInfo.position,p.scale(p.unit(p.sub(coincidentInfo.base[2],coincidentInfo.position)),-.2)),[cex,cey]=coincidentProjection.screen(coincidentProjection.view(ct)),ce={...cp,x:cex,y:cey}
coincidentInteraction.pointer('down',cp);coincidentInteraction.pointer('move',ce);coincidentInteraction.pointer('up',ce)
assert.deepEqual(coincidentDocument.points.filter(p=>p.id.startsWith('b')),coincident.points.filter(p=>p.id.startsWith('b')))
assert.equal(coincidentDocument.solids[0].parameters.base.kind,'polygon')
for(const index of [0,2,3]){
  const position=coincidentDocument.points.find(p=>p.id===`py_v_${index}`).position,[x,y]=coincidentProjection.screen(coincidentProjection.view(position))
  assert.equal(g.pickGeometry3D(coincidentDocument,coincident.print_camera,{...cp,x,y}).id,`py_v_${index}`,'remaining coincident base vertices stay selectable after detachment')
}
fixtures.push({name:'face_coincident',source:coincident,edited:coincidentDocument})
const plain=fixtures[2].source,baseInfo=a.pyramidBaseDrag3D(plain,'py_v_1')
assert.equal(a.movePyramidBaseVertex3D(plain,'py_v_1',p.add(baseInfo.base[3],p.sub(baseInfo.base[3],baseInfo.base[1]))),null,'flipped normal rejected')
let dependent=structuredClone(plain)
const edge=dependent.edges.find(e=>e.id==='py_e_0'),position=id=>dependent.points.find(p=>p.id===id).position
dependent.points.push({id:'attached',position:p.scale(p.add(position(edge.start),position(edge.end)),.5),label:null});dependent.constructions.push({id:'attachment',kind:'point_on_edge',edge_id:edge.id,t:.5,output_point_id:'attached'})
dependent=m.evaluateGeometryScene3D(dependent).scene
const target=p.add(baseInfo.position,p.scale(p.unit(p.sub(baseInfo.base[2],baseInfo.position)),-.2)),updated=a.movePyramidBaseVertex3D(dependent,'py_v_1',target)
close(updated.points.find(p=>p.id==='attached').position,p.scale(p.add(updated.points.find(p=>p.id===edge.start).position,updated.points.find(p=>p.id===edge.end).position),.5))
dependent.linear_objects.push({id:'must_stay_valid',kind:'segment',a:'py_v_1',b:'attached'})
assert.equal(a.movePyramidBaseVertex3D(dependent,'py_v_1',baseInfo.base[0]),null,'invalid candidate cannot damage downstream objects')
const concave=a.defaultSolid3D('pyramid','concave');concave.parameters={sides:5,height:2,base:{kind:'polygon',vertices:[[0,0,0],[3,0,0],[3,3,0],[1.5,1.5,0],[0,3,0]]},apex_offset:[0,0]}
const concaveScene=a.createSolid3D(m.emptyGeometryScene3D(),concave).scene;assert.ok(concaveScene)
assert.equal(a.movePyramidBaseVertex3D(concaveScene,'concave_v_3',[.2,.2,0]),null,'preserved apex outside candidate kernel rejected')
const top=p.standardView3D(fixtures[2].source.print_camera,'front'),source=fixtures[2].source,info=a.pyramidBaseDrag3D(source,'py_v_1'),pr=p.createProjection3D(top,900,700),[x,y]=pr.screen(pr.view(info.position)),pt={x,y,width:900,height:700,pointerId:1,button:0,altKey:false}
let writes=0;const blocked=g.createAuthoringInteraction3D({getScene:()=>source,getCamera:()=>top,commit:()=>{writes++;return true},notify:()=>{}})
assert.equal(blocked.pointer('down',pt),true);blocked.pointer('move',{...pt,x:x+30});blocked.pointer('up',{...pt,x:x+30});assert.equal(writes,0,'parallel ray never commits or falls through to camera')
const path=new URL('./geometry_3d_base_vertex_canonical.json',import.meta.url)
if(process.argv.includes('--write-fixture'))await fs.writeFile(path,JSON.stringify(fixtures,null,2)+'\n')
else assert.deepEqual(JSON.parse(await fs.readFile(path,'utf8')),fixtures)
console.log('PASS: seven canonical scenes, all four base slots, both projections, legacy/template/face conversion, tilted/coincident sources, apex/base/IDs/labels invariants, live drafts, grab offsets, cancellation/no-op, single Undo/Redo, invalid parameters, parallel ray and apex regressions')
