import copy
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

from tests.test_geometry_3d_contract import GeometryScene3D, normalize_scene_3d
from app.schemas.geometry_3d_analytic import evaluate_analytic_surface
from app.schemas.question_editor import GeometryBlockCreate, GeometryBlockUpdate
from tests.test_geometry_v1_contract import NOW


class ConeSurfacePointTest(unittest.TestCase):
    def test_canonical_payload_and_analytic_parity(self):
        root = Path(__file__).resolve().parents[1]
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp) / 'surface-points.json'
            subprocess.run(['node', 'tests/test_geometry_3d_cone_surface_points.mjs', str(output)], cwd=root, check=True)
            scenes = json.loads(output.read_text(encoding='utf-8'))
        self.assertEqual(len(scenes), 48)
        attached = 0
        for scene in scenes:
            self.assertEqual(normalize_scene_3d(scene), scene)
            self.assertEqual(GeometryScene3D.model_validate(scene).model_dump(mode='json'), scene)
            created = GeometryBlockCreate.model_validate(dict(block_type='geometry', payload=dict(source_data=scene), expected_revision_updated_at=NOW))
            updated = GeometryBlockUpdate.model_validate(dict(source_data=created.payload.source_data.model_dump(mode='json'), expected_revision_updated_at=NOW))
            self.assertEqual(updated.source_data.model_dump(mode='json'), scene)
            for c in scene['constructions']:
                if c['kind'] != 'point_on_surface':
                    continue
                attached += 1
                surface = next(s for s in scene['surfaces'] if s['id'] == c['surface_id'])
                solid = next(s for s in scene['solids'] if s['id'] == surface['solid_id'])
                point = next(p for p in scene['points'] if p['id'] == c['output_point_id'])
                for actual, expected in zip(point['position'], evaluate_analytic_surface(solid, c['uv'])):
                    self.assertAlmostEqual(actual, expected, delta=1e-8)
                self.assertIn(point['label'], (None, 'M\u2081 \u03b1'))
            if scene['surfaces']:
                for uv in [[1, 0], [-.1, 0], [0, -.1], [0, 1.1], [float('nan'), 0], [0, float('inf')], [True, 0]]:
                    bad = copy.deepcopy(scene)
                    next(c for c in bad['constructions'] if c['kind'] == 'point_on_surface')['uv'] = uv
                    with self.assertRaises(ValueError):
                        normalize_scene_3d(bad)
                bad = copy.deepcopy(scene)
                next(c for c in bad['constructions'] if c['kind'] == 'point_on_surface')['surface_id'] = 'missing'
                with self.assertRaises(ValueError):
                    normalize_scene_3d(bad)
        self.assertEqual(attached, 36)


if __name__ == '__main__':
    unittest.main()
