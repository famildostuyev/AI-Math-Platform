import json
from pathlib import Path
import subprocess
import tempfile
import unittest

from tests.test_geometry_3d_contract import GeometryScene3D, normalize_scene_3d
from app.schemas.question_editor import GeometryBlockCreate, GeometryBlockUpdate
from app.schemas.geometry_3d_analytic import analytic_feature_positions
from tests.test_geometry_v1_contract import NOW


class CylinderCenterParityTest(unittest.TestCase):
    def test_semantic_centers_and_payload_parity(self):
        root = Path(__file__).resolve().parents[1]
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp) / 'cylinders.json'
            subprocess.run(['node', 'tests/test_geometry_3d_cylinder_centers.mjs', str(output)], cwd=root, check=True)
            scenes = json.loads(output.read_text(encoding='utf-8'))
        self.assertEqual(len(scenes), 14)
        for scene in scenes:
            self.assertEqual(normalize_scene_3d(scene), scene)
            self.assertEqual(GeometryScene3D.model_validate(scene).model_dump(mode='json'), scene)
            created = GeometryBlockCreate.model_validate(dict(block_type='geometry', payload=dict(source_data=scene), expected_revision_updated_at=NOW))
            updated = GeometryBlockUpdate.model_validate(dict(source_data=created.payload.source_data.model_dump(mode='json'), expected_revision_updated_at=NOW))
            self.assertEqual(updated.source_data.model_dump(mode='json'), scene)
            points = {point['id']: point['position'] for point in scene['points']}
            for solid in scene['solids']:
                if solid['kind'] == 'cylinder':
                    for point_id, position in analytic_feature_positions(solid).items():
                        for actual, expected in zip(points[point_id], position):
                            self.assertAlmostEqual(actual, expected, delta=1e-8)


if __name__ == '__main__':
    unittest.main()
