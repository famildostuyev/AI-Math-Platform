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

class PlaneFillTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / 'fill.json'
            subprocess.run(['node', 'tests/test_geometry_3d_plane_fill.mjs', str(target)], cwd=ROOT, check=True)
            cls.fixtures = json.loads(target.read_text(encoding='utf-8'))

    def test_frontend_backend_api_roundtrips(self):
        self.assertEqual(len(self.fixtures['scenes']), 128)
        for scene in [self.fixtures['base'], *self.fixtures['scenes']]:
            before = copy.deepcopy(scene)
            self.assertEqual(normalize_scene_3d(scene), scene)
            model = GeometryScene3D.model_validate(scene)
            self.assertEqual(model.model_dump(mode='json'), scene)
            self.assertEqual(GeometryScene3D.model_validate_json(model.model_dump_json()).model_dump(mode='json'), scene)
            created = GeometryBlockCreate.model_validate(dict(block_type='geometry', payload=dict(source_data=scene), expected_revision_updated_at=NOW))
            updated = GeometryBlockUpdate.model_validate(dict(source_data=created.payload.source_data.model_dump(mode='json'), expected_revision_updated_at=NOW))
            self.assertEqual(updated.source_data.model_dump(mode='json'), scene)
            self.assertEqual(scene, before)

    def test_legacy_absence_and_canonical_color(self):
        base = self.fixtures['base']
        self.assertTrue(all('fill' not in p.get('display', {}) for p in GeometryScene3D.model_validate(base).model_dump(mode='json')['planes']))
        scene = copy.deepcopy(self.fixtures['scenes'][0])
        scene['planes'][0]['display']['fill']['color'] = '#aB12eF'
        result = normalize_scene_3d(scene)
        self.assertEqual(result['planes'][0]['display']['fill']['color'], '#AB12EF')
        self.assertEqual(scene['planes'][0]['display']['fill']['color'], '#aB12eF')

    def test_strict_invalid_values(self):
        invalid = [None, [], {}, 'red', dict(color='#123456'), dict(opacity=.5), dict(color='#123456', opacity=.5, extra=True)]
        invalid += [dict(color='#123456', opacity=v) for v in [-.001, 1.001, float('nan'), float('inf'), -float('inf'), True, False, None, '0.5', [], {}]]
        invalid += [dict(color=v, opacity=.5) for v in ['red', '#123', '#1234567', '#12GG56', '#123456\n', True, None]]
        for value in invalid:
            for target in ['alpha', 'beta', 'guided', 'half']:
                scene = copy.deepcopy(self.fixtures['scenes'][0])
                next(p for p in scene['planes'] if p['id'] == target)['display']['fill'] = value
                for validate in [normalize_scene_3d, GeometryScene3D.model_validate,
                                 lambda s: GeometryBlockCreate.model_validate(dict(block_type='geometry', payload=dict(source_data=s), expected_revision_updated_at=NOW)),
                                 lambda s: GeometryBlockUpdate.model_validate(dict(source_data=s, expected_revision_updated_at=NOW))]:
                    with self.assertRaises(ValueError):
                        validate(scene)
