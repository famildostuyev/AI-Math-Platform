import {loadGeometryModule} from './geometry_test_modules.mjs'
export async function cylinderRenderFixture(kind=null){
  const m=await loadGeometryModule('geometry3dModel'),s=await loadGeometryModule('geometry3dSolidAuthoring')
  let scene=m.emptyGeometryScene3D()
  if(kind){const solid=s.defaultSolid3D(kind,'poly');solid.frame.origin=[-1,-1,0];scene=s.createSolid3D(scene,solid).scene}
  scene.solids.push({id:'cylinder',mode:'parametric',kind:'cylinder',frame:{origin:[0,0,0],x_axis:[1,0,0],y_axis:[0,1,0]},parameters:{radius:1.5,height:4},features:[]})
  scene.print_camera={...scene.print_camera,position:[0,-10,2],target:[0,0,2],vertical_span:9}
  scene.points.push(...[
    ['front',[0,-3,2],'Visible point'],['back',[0,3,2],'Occluded point'],
    ['a',[-4,3,2],null],['b',[4,3,2],null],['c',[-4,-3,3],null],['d',[4,-3,3],null],
  ].map(([id,position,label])=>({id,position,label})))
  scene.linear_objects.push({id:'background',kind:'segment',a:'a',b:'b'},{id:'foreground',kind:'segment',a:'c',b:'d'})
  scene.annotations.push({id:'visible_annotation',content:'Front annotation',format:'text',anchor:{kind:'world',position:[.5,-3,2.3]},offset_mm:[0,0]},
    {id:'occluded_annotation',content:'Back annotation',format:'text',anchor:{kind:'world',position:[.5,3,2.3]},offset_mm:[0,0]})
  return scene
}
