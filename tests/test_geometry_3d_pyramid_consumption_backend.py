import json
import unittest
from pathlib import Path
from tests.test_geometry_3d_contract import GeometryScene3D, normalize_scene_3d
from tests.test_geometry_v1_contract import NOW
from app.schemas.geometry_3d_solids import solid_topology
from app.schemas.question_editor import GeometryBlockCreate, GeometryBlockUpdate


class PyramidConsumptionParityTest(unittest.TestCase):
    def test_frontend_canonical_fixtures_and_api_roundtrip(self):
        fixtures = json.loads(Path(__file__).with_name('geometry_3d_pyramid_consumption_canonical.json').read_text(encoding='utf-8'))
        self.assertEqual(len(fixtures), 18)
        for fixture in fixtures:
            for key in ('source', 'created', 'edited'):
                if key not in fixture:
                    continue
                with self.subTest(name=fixture['name'], stage=key):
                    scene = fixture[key]
                    self.assertEqual(normalize_scene_3d(scene), scene)
                    self.assertEqual(GeometryScene3D.model_validate(scene).model_dump(mode='json'), scene)
                    created = GeometryBlockCreate.model_validate(dict(block_type='geometry', payload=dict(source_data=scene), expected_revision_updated_at=NOW))
                    updated = GeometryBlockUpdate.model_validate(dict(source_data=created.payload.source_data.model_dump(mode='json'), expected_revision_updated_at=NOW))
                    self.assertEqual(updated.source_data.model_dump(mode='json'), scene)
                    for solid in scene['solids']:
                        topology = solid_topology(scene, solid)
                        ids = {feature['slot']:feature['entity_id'] for feature in solid['features']}
                        points = {point['id']:point['position'] for point in scene['points']}
                        for i, position in enumerate(topology['vertices']):
                            for actual, expected in zip(points[ids[f'v_{i}']], position):
                                self.assertAlmostEqual(actual, expected, places=9)


if __name__ == '__main__':
    unittest.main()
