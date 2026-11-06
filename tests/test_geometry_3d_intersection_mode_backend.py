import copy
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

from app.schemas.geometry_3d import GeometryScene3D, normalize_scene_3d
from app.schemas.question_editor import GeometryBlockCreate, GeometryBlockUpdate
from tests.test_geometry_v1_contract import NOW

ROOT = Path(__file__).resolve().parents[1]


class IntersectionModeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / 'modes.json'
            subprocess.run(['node', 'tests/test_geometry_3d_intersection_mode.mjs', str(out)], cwd=ROOT, check=True)
            cls.fixtures = json.loads(out.read_text(encoding='utf-8'))

    def test_frontend_backend_and_api_payload_roundtrips(self):
        self.assertEqual(len(self.fixtures['scenes']), 24)
        for scene in self.fixtures['scenes']:
            before = copy.deepcopy(scene)
            self.assertEqual(normalize_scene_3d(scene), scene)
            validated = GeometryScene3D.model_validate(scene)
            self.assertEqual(validated.model_dump(mode='json'), scene)
            self.assertEqual(GeometryScene3D.model_validate_json(validated.model_dump_json()).model_dump(mode='json'), scene)
            created = GeometryBlockCreate.model_validate(dict(block_type='geometry', payload=dict(source_data=scene), expected_revision_updated_at=NOW))
            updated = GeometryBlockUpdate.model_validate(dict(source_data=created.payload.source_data.model_dump(mode='json'), expected_revision_updated_at=NOW))
            self.assertEqual(updated.source_data.model_dump(mode='json'), scene)
            self.assertEqual(scene, before)

    def test_legacy_default_and_unrelated_displays(self):
        legacy = self.fixtures['legacy']
        before = copy.deepcopy(legacy)
        self.assertEqual(normalize_scene_3d(legacy), self.fixtures['canonical'])
        self.assertEqual(GeometryScene3D.model_validate(legacy).model_dump(mode='json'), self.fixtures['canonical'])
        self.assertEqual(GeometryBlockUpdate.model_validate(dict(source_data=legacy, expected_revision_updated_at=NOW)).source_data.model_dump(mode='json'), self.fixtures['canonical'])
        self.assertEqual(legacy, before)
        for key in ['source', 'parallel', 'detached']:
            scene = self.fixtures[key]
            self.assertEqual(normalize_scene_3d(scene), scene)
            self.assertEqual(GeometryScene3D.model_validate(scene).model_dump(mode='json'), scene)

    def test_strict_invalid_values_and_locations(self):
        for invalid in ['', 'upper', 'CROSS', None, True, False, 0, 1, [], {}, float('nan')]:
            scene = copy.deepcopy(self.fixtures['canonical'])
            next(p for p in scene['planes'] if p['id'] == 'beta')['display']['intersection_mode'] = invalid
            for validate in [normalize_scene_3d, GeometryScene3D.model_validate,
                             lambda s: GeometryBlockCreate.model_validate(dict(block_type='geometry', payload=dict(source_data=s), expected_revision_updated_at=NOW)),
                             lambda s: GeometryBlockUpdate.model_validate(dict(source_data=s, expected_revision_updated_at=NOW))]:
                with self.assertRaises(ValueError):
                    validate(scene)
        scene = copy.deepcopy(self.fixtures['canonical'])
        scene['constructions'][0]['intersection_mode'] = 'first'
        with self.assertRaises(ValueError):
            normalize_scene_3d(scene)
