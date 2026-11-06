import copy
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from app.schemas.geometry_3d import normalize_scene_3d, GeometryScene3D
ROOT=Path(__file__).resolve().parents[1]
class PlaneAuthoringTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with tempfile.TemporaryDirectory() as tmp:
            out=Path(tmp)/'scenes.json'
            subprocess.run(['node','tests/test_geometry_3d_plane_authoring.mjs',str(out)],cwd=ROOT,check=True)
            cls.scenes=json.loads(out.read_text(encoding='utf-8'))
    def test_frontend_parity(self):
        self.assertEqual(len(self.scenes),6)
        for scene in self.scenes:
            self.assertEqual(normalize_scene_3d(scene),scene)
            self.assertEqual(GeometryScene3D.model_validate(scene).model_dump(mode='json'),scene)
    def test_legacy_and_invalid_dimensions(self):
        legacy=copy.deepcopy(self.scenes[0]);del legacy['planes'][0]['display']
        self.assertEqual(normalize_scene_3d(legacy),legacy)
        for dimension in ('width','height'):
            for value in (0,-1,float('nan'),float('inf'),True):
                scene=copy.deepcopy(self.scenes[0]);scene['planes'][0]['display'][dimension]=value
                with self.assertRaises(ValueError): normalize_scene_3d(scene)
    def test_degenerate_plane(self):
        scene=copy.deepcopy(self.scenes[0]);ids=scene['planes'][0]['point_ids'];points={p['id']:p for p in scene['points']}
        points[ids[2]]['position']=points[ids[1]]['position'][:]
        with self.assertRaises(ValueError): normalize_scene_3d(scene)
