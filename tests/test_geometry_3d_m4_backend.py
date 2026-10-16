import copy
import json
import unittest
from pathlib import Path
from tests.test_geometry_3d_contract import normalize_scene_3d, GeometryScene3D
from tests.test_geometry_v1_contract import NOW, geometry_v1
from app.schemas.question_editor import GeometryBlockCreate, GeometryBlockUpdate
from app.schemas.geometry_3d_solids import solid_topology

SCENE=json.loads(Path(__file__).with_name('geometry_3d_m4_canonical.json').read_text(encoding='utf-8'))
class Geometry3DM4BackendTest(unittest.TestCase):
    def test_canonical_and_mixed_roundtrip(self):
        self.assertEqual(normalize_scene_3d(SCENE),SCENE)
        self.assertEqual(GeometryScene3D.model_validate(SCENE).model_dump(mode='json'),SCENE)
        for source in (SCENE,geometry_v1()):
            create=GeometryBlockCreate.model_validate(dict(block_type='geometry',payload=dict(source_data=source),expected_revision_updated_at=NOW))
            update=GeometryBlockUpdate.model_validate(dict(source_data=create.payload.source_data.model_dump(mode='json'),expected_revision_updated_at=NOW))
            self.assertEqual(update.source_data.model_dump(mode='json'),source)
    def test_topology_matches_frontend_fixture(self):
        for solid in SCENE['solids']:
            topology=solid_topology(SCENE,solid)
            ids={f['slot']:f['entity_id'] for f in solid['features']}
            points={p['id']:p['position'] for p in SCENE['points']}
            for i,v in enumerate(topology['vertices']):
                for x,y in zip(points[ids[f'v_{i}']],v): self.assertAlmostEqual(x,y,places=10)
    def test_invalid_parameters_topology_sources_cycles(self):
        for kind,key in [('cube','side'),('cuboid','width'),('prism','height'),('pyramid','height')]:
            for value in ([0,float('nan'),float('inf'),1e13] if kind=='pyramid' else [0,-1,float('nan'),float('inf'),1e13]):
                bad=copy.deepcopy(SCENE);next(s for s in bad['solids'] if s['kind']==kind)['parameters'][key]=value
                with self.assertRaises(ValueError): normalize_scene_3d(bad)
        for mutation in ('incomplete','order','direction','source','cycle','topology','nonplanar','intersect'):
            bad=copy.deepcopy(SCENE);solid=next(s for s in bad['solids'] if s['kind']=='prism')
            if mutation=='incomplete': solid['features'].pop()
            elif mutation=='order': next(f for f in bad['faces'] if f['id']=='base')['boundary'].reverse()
            elif mutation=='direction': solid['parameters']['direction']=[1,0,0]
            elif mutation=='source': solid['parameters']['base']['face_id']='missing'
            elif mutation=='cycle':
                face=next(f for f in bad['faces'] if f['id']=='concave_f_0');solid['parameters']['base']=dict(kind='face',face_id=face['id'],point_ids=face['boundary'])
            elif mutation=='topology': next(e for e in bad['edges'] if e['id']=='concave_e_0')['end']='concave_v_2'
            elif mutation=='nonplanar': next(p for p in bad['points'] if p['id']=='b1')['position']=[3,0,1]
            else: next(p for p in bad['points'] if p['id']=='b3')['position']=[-1,1,0]
            with self.assertRaises(ValueError,msg=mutation): normalize_scene_3d(bad)
    def test_both_extrusion_and_apex_sides(self):
        scene=copy.deepcopy(SCENE)
        next(s for s in scene['solids'] if s['kind']=='prism')['parameters']['direction']=[0,0,-1]
        next(s for s in scene['solids'] if s['id']=='pyramid')['parameters']['height']=-2
        self.assertIsNotNone(normalize_scene_3d(scene))
        # Existing M0 regular-template positive height validation is unchanged.
        legacy=copy.deepcopy(SCENE);next(s for s in legacy['solids'] if s['id']=='pyramid')['parameters']=dict(sides=4,radius=2,height=-2)
        with self.assertRaises(ValueError): normalize_scene_3d(legacy)
if __name__=='__main__': unittest.main()
