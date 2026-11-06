import copy
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from app.schemas.geometry_3d import normalize_scene_3d, GeometryScene3D
from app.schemas.geometry_3d_parallel import plane_parallel_geometry
from app.schemas.question_editor import GeometryBlockCreate, GeometryBlockUpdate
from tests.test_geometry_v1_contract import NOW
ROOT=Path(__file__).resolve().parents[1]

class PlaneParallelTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with tempfile.TemporaryDirectory() as tmp:
            out=Path(tmp)/'scenes.json'
            subprocess.run(['node','tests/test_geometry_3d_plane_parallel.mjs',str(out)],cwd=ROOT,check=True)
            cls.scenes=json.loads(out.read_text(encoding='utf-8'))

    def test_projection_and_contract_parity(self):
        self.assertEqual(len(self.scenes),60)
        for scene in self.scenes:
            self.assertEqual(normalize_scene_3d(scene),scene)
            self.assertEqual(GeometryScene3D.model_validate(scene).model_dump(mode='json'),scene)
            c=scene['constructions'][0];points={p['id']:p['position'] for p in scene['points']}
            r=next(r for r in scene['planes' if c['reference']['kind']=='plane' else 'faces'] if r['id']==c['reference']['id'])
            ids=r.get('point_ids',r.get('boundary'))
            result=plane_parallel_geometry(points[c['source_point_id']],[points[i] for i in ids],c['reference']['angle_radians'],c['output_kind'],c['direction'],c['length'])
            for x,y in zip(result['position'],points[c['output_point_id']]): self.assertAlmostEqual(x,y,places=8)
            created=GeometryBlockCreate.model_validate(dict(block_type='geometry',payload=dict(source_data=scene),expected_revision_updated_at=NOW))
            updated=GeometryBlockUpdate.model_validate(dict(source_data=created.payload.source_data.model_dump(mode='json'),expected_revision_updated_at=NOW))
            self.assertEqual(updated.source_data.model_dump(mode='json'),scene)

    def test_strict_references_and_cycles(self):
        for key,value in [('id','missing'),('angle_radians',float('nan')),('angle_radians',True),('kind','surface')]:
            scene=copy.deepcopy(self.scenes[0]);scene['constructions'][0]['reference'][key]=value
            with self.assertRaises(ValueError): normalize_scene_3d(scene)
        scene=copy.deepcopy(self.scenes[0]);del scene['constructions'][0]['reference']['angle_radians']
        with self.assertRaises(ValueError): normalize_scene_3d(scene)
        scene=copy.deepcopy(self.scenes[0]);scene['planes'][0]['point_ids'][0]=scene['constructions'][0]['output_point_id']
        with self.assertRaises(ValueError): normalize_scene_3d(scene)

    def test_math_validation_and_containment(self):
        v=[[0,0,0],[1,0,0],[0,1,0]]
        self.assertTrue(plane_parallel_geometry([0,0,0],v,.3)['coincident'])
        self.assertFalse(plane_parallel_geometry([0,0,1],v,.3)['coincident'])
        for vertices,angle in [(v,float('inf')),([[0,0,0]]*3,0)]:
            with self.assertRaises(ValueError): plane_parallel_geometry([0,0,1],vertices,angle)
