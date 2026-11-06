import copy
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from app.schemas.geometry_3d import normalize_scene_3d, GeometryScene3D

ROOT=Path(__file__).resolve().parents[1]

class SphereRegionTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with tempfile.TemporaryDirectory() as tmp:
            output=Path(tmp)/'scenes.json'
            subprocess.run(['node','tests/test_geometry_3d_sphere_region.mjs',str(output)],cwd=ROOT,check=True)
            cls.scenes=json.loads(output.read_text(encoding='utf-8'))

    def test_mixed_region_parity(self):
        self.assertEqual(len(self.scenes),12)
        for scene in self.scenes:
            self.assertEqual(normalize_scene_3d(scene),scene)
            self.assertEqual(GeometryScene3D.model_validate(scene).model_dump(mode='json'),scene)
            self.assertEqual(scene['solids'][0]['parameters']['region'],'surface')
            self.assertNotIn('region',scene['solids'][1]['parameters'])

    def test_legacy_and_explicit_ball(self):
        for region in (None,'ball','surface'):
            scene=copy.deepcopy(self.scenes[0]);parameters=scene['solids'][0]['parameters']
            if region is None: parameters.pop('region')
            else: parameters['region']=region
            original=copy.deepcopy(scene)
            self.assertEqual(normalize_scene_3d(scene),scene)
            self.assertEqual(scene,original)

    def test_strict_region_and_dimensions(self):
        for value in ('shell','',None,True,1,{}):
            scene=copy.deepcopy(self.scenes[0]);scene['solids'][0]['parameters']['region']=value
            with self.assertRaises(ValueError): normalize_scene_3d(scene)
        for value in (0,-1,float('nan'),float('inf')):
            scene=copy.deepcopy(self.scenes[0]);scene['solids'][0]['parameters']['radius']=value
            with self.assertRaises(ValueError): normalize_scene_3d(scene)

if __name__=='__main__': unittest.main()
