import copy
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from app.schemas.geometry_3d import normalize_scene_3d, GeometryScene3D
from app.schemas.geometry_3d_perpendicular import perpendicular_foot
ROOT=Path(__file__).resolve().parents[1]
class PerpendicularTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with tempfile.TemporaryDirectory() as tmp:
            out=Path(tmp)/'scenes.json'
            subprocess.run(['node','tests/test_geometry_3d_perpendicular.mjs',str(out)],cwd=ROOT,check=True)
            cls.scenes=json.loads(out.read_text(encoding='utf-8'))
    def test_contract_and_projection_parity(self):
        self.assertEqual(len(self.scenes),9)
        for scene in self.scenes:
            self.assertEqual(normalize_scene_3d(scene),scene)
            self.assertEqual(GeometryScene3D.model_validate(scene).model_dump(mode='json'),scene)
            c=scene['constructions'][0];points={p['id']:p['position'] for p in scene['points']}
            reference=next(r for r in scene['edges' if c['reference']['kind']=='edge' else 'linear_objects'] if r['id']==c['reference']['id'])
            a,b=(reference['start'],reference['end']) if c['reference']['kind']=='edge' else (reference['a'],reference['b'])
            result=perpendicular_foot(points[c['source_point_id']],points[a],points[b])
            for expected,actual in zip(result['position'],points[c['output_point_id']]): self.assertAlmostEqual(expected,actual,places=8)
    def test_invalid_references_and_cycles(self):
        for field,value in [('source_point_id','missing'),('segment_id','missing')]:
            scene=copy.deepcopy(self.scenes[0]);scene['constructions'][0][field]=value
            with self.assertRaises(ValueError): normalize_scene_3d(scene)
        scene=copy.deepcopy(self.scenes[0]);c=scene['constructions'][0];c['reference']['id']=c['segment_id']
        with self.assertRaises(ValueError): normalize_scene_3d(scene)
    def test_math_rejections_and_large_reference(self):
        for p,a,b in [([0,0,0],[0,0,0],[1,0,0]),([0,1,0],[0,0,0],[0,0,0]),([float('nan'),1,0],[0,0,0],[1,0,0])]:
            with self.assertRaises(ValueError): perpendicular_foot(p,a,b)
        self.assertEqual(perpendicular_foot([1e9,1,0],[0,0,0],[1e12,0,0])['position'],[1e9,0,0])
