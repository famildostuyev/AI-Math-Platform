import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from tests.test_geometry_3d_contract import GeometryScene3D, normalize_scene_3d
from app.schemas.question_editor import GeometryBlockCreate, GeometryBlockUpdate
from tests.test_geometry_v1_contract import NOW

class FacePointParityTest(unittest.TestCase):
    def test_transported_metric_uv_and_payload_parity(self):
        root = Path(__file__).resolve().parents[1]
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp) / 'face-points.json'
            subprocess.run(['node', 'tests/test_geometry_3d_face_points.mjs', str(output)], cwd=root, check=True)
            scenes = json.loads(output.read_text(encoding='utf-8'))
        self.assertEqual(len(scenes), 54)
        for scene in scenes:
            self.assertEqual(normalize_scene_3d(scene), scene)
            self.assertEqual(GeometryScene3D.model_validate(scene).model_dump(mode='json'), scene)
            created = GeometryBlockCreate.model_validate(dict(block_type='geometry', payload=dict(source_data=scene), expected_revision_updated_at=NOW))
            updated = GeometryBlockUpdate.model_validate(dict(source_data=created.payload.source_data.model_dump(mode='json'), expected_revision_updated_at=NOW))
            self.assertEqual(updated.source_data.model_dump(mode='json'), scene)
            for uv in [[1e8, 1e8], [float('nan'), 0], [0, float('inf')]]:
                bad = json.loads(json.dumps(scene))
                next(c for c in bad['constructions'] if c['kind'] == 'point_on_face')['uv'] = uv
                with self.assertRaises(ValueError):
                    normalize_scene_3d(bad)

if __name__ == '__main__':
    unittest.main()
