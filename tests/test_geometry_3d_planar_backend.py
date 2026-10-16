import json
import unittest
from pathlib import Path
from tests.test_geometry_3d_contract import normalize_scene_3d, GeometryScene3D
from tests.test_geometry_v1_contract import NOW
from app.schemas.question_editor import GeometryBlockCreate, GeometryBlockUpdate


class PlanarAuthoringContractTest(unittest.TestCase):
    def test_shared_scenes_and_block_roundtrip(self):
        fixtures = json.loads(Path(__file__).with_name('geometry_3d_planar_canonical.json').read_text(encoding='utf-8'))
        self.assertEqual(len(fixtures), 6)
        for fixture in fixtures:
            with self.subTest(name=fixture['name']):
                scene = fixture['scene']
                self.assertEqual(normalize_scene_3d(scene), scene)
                self.assertEqual(GeometryScene3D.model_validate(scene).model_dump(mode='json'), scene)
                created = GeometryBlockCreate.model_validate(dict(block_type='geometry', payload=dict(source_data=scene), expected_revision_updated_at=NOW))
                updated = GeometryBlockUpdate.model_validate(dict(source_data=created.payload.source_data.model_dump(mode='json'), expected_revision_updated_at=NOW))
                self.assertEqual(updated.source_data.model_dump(mode='json'), scene)
                self.assertEqual(len(scene['faces']), 1)
                self.assertEqual(len(scene['linear_objects']), 4)


if __name__ == '__main__':
    unittest.main()
