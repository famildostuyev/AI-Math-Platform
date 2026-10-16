import assert from 'node:assert/strict'
import {loadGeometryModule} from './geometry_test_modules.mjs'
const {GEOMETRY_RIBBON:menu,geometryRibbonTarget:target,geometryRibbonActionState:state,runGeometryRibbonAction:run}=await loadGeometryModule('geometryRibbonMenu')
const entries=menu.flatMap(m=>m.groups?m.groups.flatMap(g=>g.items):[m]),item=action=>entries.find(i=>i.action===action),solid=action=>entries.find(i=>i.action3D===action)
assert.equal(menu.filter(m=>m.create).length,1);assert.equal(menu.find(m=>m.create).label,'Çərçivə əlavə et')
assert.ok(menu.some(m=>m.label==='Müstəvi fiqurları'));assert.ok(!menu.some(m=>m.label==='2D fiqurlar'))
assert.deepEqual(menu.find(m=>m.label==='Xətt').groups[0].items.map(i=>i.action),['line','directed_line','segment','vector','polyline'])
const calls=[],two={id:'two',tool:'point',disabled:false,canDelete:false,run:a=>calls.push(['two',a])},three={id:'three',tool:'point',disabled:false,canDelete:true,run:a=>calls.push(['three',a])}
const t2=target({kind:'geometry',id:'two'},two,three),t3=target({kind:'geometry',id:'three'},two,three)
for(const action of ['select','point','line','segment','vector']){assert.equal(run(item(action),t2),true);assert.deepEqual(calls.at(-1),['two',action]);assert.equal(run(item(action),t3),true);assert.deepEqual(calls.at(-1),['three',action]);assert.equal(entries.filter(i=>i.action===action).length,1)}
run(item('directed_line'),t2);assert.deepEqual(calls.at(-1),['two','directed_line']);run(item('directed_line'),t3);assert.deepEqual(calls.at(-1),['three','ray']);assert.equal(state(item('directed_line'),t3).label,'Şüa');assert.equal(state(item('directed_line'),t2).label,'İstiqamətlənmiş düz xətt')
for(const action of ['plane','camera','cube','cuboid','prism','pyramid']){assert.equal(entries.filter(i=>i.action3D===action).length,1);assert.equal(run(solid(action),t2),false);assert.equal(run(solid(action),t3),true);assert.deepEqual(calls.at(-1),['three',action])}
for(const group of menu.find(m=>m.label==='Müstəvi fiqurları').groups)for(const i of group.items){assert.ok(!state(i,t2).disabled);assert.equal(state(i,t3).disabled,!i.action3D);if(!i.action3D)assert.match(state(i,t3).title,/3D/)}
for(const label of ['Silindr','Konus','Kəsik konus','Sfera','Kürə','İkiüzlü bucaq','Düzgün n-bucaqlı kəsik piramida']){const i=entries.find(i=>i.label===label);assert.ok(state(i,t3).disabled);assert.equal(run(i,t3),false)}
assert.ok(!state(item('polyline'),t3).disabled);assert.ok(state(item('delete'),t2).disabled);assert.equal(run(item('delete'),t3),true)
assert.equal(target(null,two,three),null);assert.equal(target({kind:'text',id:'two'},two,three),null);assert.equal(target({kind:'geometry',id:'stale'},two,three),null);assert.equal(target({kind:'geometry',id:'two'},two,{...three,id:'two'}),null)
const count=calls.length;for(const t of [null,target({kind:'geometry',id:'three'},two,null),target({kind:'geometry',id:'two'},{...two,disabled:true},three)]){assert.equal(run(item('point'),t),false)}assert.equal(run(item('point'),t3,true),false);assert.equal(calls.length,count)
assert.equal(state(item('point'),t2).pressed,true);assert.equal(state(item('point'),null).disabled,true)
console.log('PASS: unified catalogue, shared dimension routing, stale/ambiguous/disabled context protection, 3D solid accessibility, plane-figure boundaries and duplicate action checks')
