import copy
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from app.schemas.geometry_3d import normalize_scene_3d, GeometryScene3D
from app.schemas.geometry_3d_parallel import parallel_geometry
ROOT=Path(__file__).resolve().parents[1]
class ParallelTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with tempfile.TemporaryDirectory() as tmp:
            out=Path(tmp)/'scenes.json'
            subprocess.run(['node','tests/test_geometry_3d_parallel.mjs',str(out)],cwd=ROOT,check=True)
            cls.scenes=json.loads(out.read_text(encoding='utf-8'))
    def test_contract_and_math_parity(self):
        self.assertEqual(len(self.scenes),24)
        for scene in self.scenes:
            self.assertEqual(normalize_scene_3d(scene),scene)
            self.assertEqual(GeometryScene3D.model_validate(scene).model_dump(mode='json'),scene)
            c=scene['constructions'][0];points={p['id']:p['position'] for p in scene['points']}
            r=next(r for r in scene['edges' if c['reference']['kind']=='edge' else 'linear_objects'] if r['id']==c['reference']['id'])
            a,b=(r['start'],r['end']) if c['reference']['kind']=='edge' else (r['a'],r['b'])
            expected=parallel_geometry(points[c['source_point_id']],points[a],points[b],c['output_kind'],c['direction'],c['length'])
            for x,y in zip(expected['position'],points[c['output_point_id']]): self.assertAlmostEqual(x,y,places=8)
    def test_strict_invalid_and_cycle(self):
        for field,values in [('length',[0,-1,float('inf'),True]),('direction',['bad',None]),('output_kind',['vector',None]),('source_point_id',['missing'])]:
            for value in values:
                scene=copy.deepcopy(self.scenes[0]);scene['constructions'][0][field]=value
                with self.assertRaises(ValueError): normalize_scene_3d(scene)
        scene=copy.deepcopy(self.scenes[0]);c=scene['constructions'][0];c['reference']={'kind':'linear','id':c['linear_id']}
        with self.assertRaises(ValueError): normalize_scene_3d(scene)
    def test_coincident_and_degenerate(self):
        self.assertTrue(parallel_geometry([0,0,0],[-1,0,0],[2,0,0])['coincident'])
        self.assertFalse(parallel_geometry([0,1,0],[-1,0,0],[2,0,0])['coincident'])
        with self.assertRaises(ValueError): parallel_geometry([0,1,0],[0,0,0],[0,0,0])
