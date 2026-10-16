import json
import subprocess
import unittest
from pathlib import Path
from tests.test_geometry_3d_contract import GeometryScene3D, normalize_scene_3d
from app.schemas.geometry_3d_solids import solid_topology
from app.schemas.question_editor import GeometryBlockCreate, GeometryBlockUpdate
from tests.test_geometry_v1_contract import NOW


class SolidScaleParityTest(unittest.TestCase):
    def test_frontend_scale_roundtrip_and_world_coordinates(self):
        root = Path(__file__).resolve().parents[1]
        import tempfile
        with tempfile.TemporaryDirectory(dir=root / 'tests') as temp:
            output = Path(temp) / 'scales.json'
            subprocess.run(['node', 'tests/test_geometry_3d_scale.mjs', str(output)], cwd=root, check=True)
            scenes = json.loads(output.read_text(encoding='utf-8'))
        self.assertEqual(len(scenes), 12)
        for scene in scenes:
            self.assertEqual(normalize_scene_3d(scene), scene)
            self.assertEqual(GeometryScene3D.model_validate(scene).model_dump(mode='json'), scene)
            created = GeometryBlockCreate.model_validate(dict(block_type='geometry', payload=dict(source_data=scene), expected_revision_updated_at=NOW))
            updated = GeometryBlockUpdate.model_validate(dict(source_data=created.payload.source_data.model_dump(mode='json'), expected_revision_updated_at=NOW))
            self.assertEqual(updated.source_data.model_dump(mode='json'), scene)
            points = {p['id']: p['position'] for p in scene['points']}
            for solid in scene['solids']:
                topology = solid_topology(scene, solid)
                features = {f['slot']: f['entity_id'] for f in solid['features']}
                for i, position in enumerate(topology['vertices']):
                    for actual, expected in zip(position, points[features[f'v_{i}']]):
                        self.assertAlmostEqual(actual, expected, places=9)


if __name__ == '__main__':
    unittest.main()
