import copy
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from app.schemas.geometry_3d import normalize_scene_3d, GeometryScene3D
ROOT=Path(__file__).resolve().parents[1]
class PlaneDisplayTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with tempfile.TemporaryDirectory() as tmp:
            out=Path(tmp)/'scenes.json'
            subprocess.run(['node','tests/test_geometry_3d_plane_display.mjs',str(out)],cwd=ROOT,check=True)
            cls.scenes=json.loads(out.read_text(encoding='utf-8'))
    def test_shape_parity(self):
        self.assertEqual(len(self.scenes),36)
        for scene in self.scenes:
            self.assertEqual(normalize_scene_3d(scene),scene)
            self.assertEqual(GeometryScene3D.model_validate(scene).model_dump(mode='json'),scene)
    def test_old_display_preserved(self):
        legacy=copy.deepcopy(self.scenes[0]);legacy['planes'][0]['display']={'width':4,'height':3}
        self.assertEqual(normalize_scene_3d(legacy),legacy)
    def test_invalid_shape_skew(self):
        for field,values in [('shape',['other',None,3]),('skew',[-2,2,float('nan'),float('inf'),True])]:
            for value in values:
                scene=copy.deepcopy(self.scenes[0]);scene['planes'][0]['display'][field]=value
                with self.assertRaises(ValueError): normalize_scene_3d(scene)
