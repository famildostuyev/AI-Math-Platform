import assert from 'node:assert/strict'
import {loadGeometryModule} from './geometry_test_modules.mjs'
const {geometryContextMenuPlacement:place}=await loadGeometryModule('geometryContextMenuPlacement')
for(const width of [320,560,900,1600])for(const height of [360,900])for(const x of [8,width/2,width-8])for(const y of [8,height/2,height-8]){
  const args=[{x,y},{width:260,height:209},{width,height},{x:width/2-260,y:height/2-200,width:520,height:400}]
  const p=place(...args)
  assert.ok(p.x>=8&&p.y>=8&&p.x+p.width<=width-8&&p.y+p.height<=height-8,'all edges remain visible')
  if(Math.max(x-8,width-8-x)>=280||Math.max(y-8,height-8-y)>=229)assert.equal(p.protectedOverlap,0,'clicked vertex clearance is retained when space exists')
  assert.deepEqual(place(...args),p,'deterministic ties')
}
const p=place({x:400,y:350},{width:260,height:209},{width:1600,height:1200},{x:200,y:200,width:520,height:400})
assert.equal(p.frameOverlap,0,'use surrounding viewport space instead of covering geometry')
assert.equal(place({x:150,y:400},{width:260,height:209},{width:360,height:900},{x:0,y:0,width:360,height:900},{x:168,y:400}).protectedOverlap,0,'protect pointerdown vertex even after release drift')
const tiny=place({x:20,y:20},{width:260,height:209},{width:100,height:100})
assert.ok(tiny.x+tiny.width<=92&&tiny.y+tiny.height<=92,'graceful constrained viewport fallback')
console.log('PASS: deterministic four-direction/frame-bound placement, clicked-vertex clearance, viewport edges, narrow/tiny fallback')
