import copy
import json
import unittest
from pathlib import Path
from tests.test_geometry_3d_contract import normalize_scene_3d, GeometryScene3D
from tests.test_geometry_v1_contract import NOW
from app.schemas.question_editor import GeometryBlockCreate, GeometryBlockUpdate
from app.schemas.geometry_3d_solids import solid_topology

FIXTURES = json.loads(Path(__file__).with_name('geometry_3d_base_vertex_canonical.json').read_text(encoding='utf-8'))

class PyramidBaseVertexBackendTest(unittest.TestCase):
    def test_canonical_contract_and_api_roundtrip(self):
        for fixture in FIXTURES:
            for scene in (fixture['source'],fixture['edited']):
                with self.subTest(name=fixture['name'],kind=scene['solids'][0]['parameters'].get('base',{}).get('kind','legacy')):
                    self.assertEqual(normalize_scene_3d(scene),scene)
                    self.assertEqual(GeometryScene3D.model_validate(scene).model_dump(mode='json'),scene)
                    create=GeometryBlockCreate.model_validate(dict(block_type='geometry',payload=dict(source_data=scene),expected_revision_updated_at=NOW))
                    update=GeometryBlockUpdate.model_validate(dict(source_data=create.payload.source_data.model_dump(mode='json'),expected_revision_updated_at=NOW))
                    self.assertEqual(update.source_data.model_dump(mode='json'),scene)

    def test_evaluator_parity_and_stable_features(self):
        for fixture in FIXTURES:
            scene=fixture['edited'];solid=scene['solids'][0];topology=solid_topology(scene,solid)
            points={p['id']:p['position'] for p in scene['points']};slots={f['slot']:f['entity_id'] for f in solid['features']}
            for i,position in enumerate(topology['vertices']):
                for actual,expected in zip(position,points[slots[f'v_{i}']]): self.assertAlmostEqual(actual,expected,places=9)
            self.assertEqual(solid['features'],fixture['source']['solids'][0]['features'])
            self.assertEqual(scene['edges'],fixture['source']['edges']);self.assertEqual(scene['faces'],fixture['source']['faces'])

    def test_invalid_authoritative_polygon_with_valid_caches(self):
        source=FIXTURES[2]['edited'];raw=source['solids'][0]['parameters']['base']['vertices']
        invalid=[
            [raw[0],raw[0],raw[2],raw[3]],
            [raw[0],raw[1],[raw[2][0],raw[2][1],raw[2][2]+1],raw[3]],
            [raw[0],raw[2],raw[1],raw[3]],
            [[i,0,0] for i in range(4)],
            [[0,0,0],[3,0,0],[2,0,0],[0,3,0]],
            [[0,0,0],[1,0,0],[2,0,0],[0,2,0]],
            raw[:3],
            [[float('nan'),0,0],*raw[1:]],
            [[float('inf'),0,0],*raw[1:]],
            [[1e13,0,0],*raw[1:]],
        ]
        for vertices in invalid:
            bad=copy.deepcopy(source);bad['solids'][0]['parameters']['base']['vertices']=vertices
            with self.assertRaises(ValueError): normalize_scene_3d(bad)
        for height in (0,1e-10,float('nan'),float('inf')):
            bad=copy.deepcopy(source);bad['solids'][0]['parameters']['height']=height
            with self.assertRaises(ValueError): normalize_scene_3d(bad)
        bad=copy.deepcopy(source);bad['solids'][0]['parameters']['base']['unexpected']=True
        with self.assertRaises(ValueError): normalize_scene_3d(bad)
        bad=copy.deepcopy(source);bad['schema_version']=3
        with self.assertRaises(ValueError): normalize_scene_3d(bad)

    def test_pyramid_variant_does_not_extend_prism(self):
        bad=copy.deepcopy(FIXTURES[2]['edited']);solid=bad['solids'][0];solid['kind']='prism'
        solid['parameters']['direction']=[0,0,1];solid['parameters'].pop('apex_offset')
        with self.assertRaises(ValueError): normalize_scene_3d(bad)

if __name__=='__main__': unittest.main()
