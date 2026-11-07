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

class IntersectionStrokeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / 'intersection.json'
            subprocess.run(['node', 'tests/test_geometry_3d_intersection_stroke.mjs', str(out)], cwd=ROOT, check=True)
            cls.fixtures = json.loads(out.read_text(encoding='utf-8'))

    def test_api_roundtrips(self):
        self.assertEqual(len(self.fixtures['scenes']), 192)
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

    def test_legacy_and_canonical_colors(self):
        base = self.fixtures['base']
        self.assertTrue(all('intersection_stroke' not in p.get('display', {}) for p in GeometryScene3D.model_validate(base).model_dump(mode='json')['planes']))
        scene = copy.deepcopy(self.fixtures['scenes'][0])
        next(p for p in scene['planes'] if p['id'] == 'beta')['display']['intersection_stroke']['color'] = '#aB12eF'
        result = normalize_scene_3d(scene)
        self.assertEqual(next(p for p in result['planes'] if p['id'] == 'beta')['display']['intersection_stroke']['color'], '#AB12EF')
        self.assertEqual(next(p for p in scene['planes'] if p['id'] == 'beta')['display']['intersection_stroke']['color'], '#aB12eF')

    def test_strict_rejection(self):
        invalid = [None, [], {}, 'red', dict(color='#123456', width=1), dict(width=1, style='solid'), dict(color='#123456', style='solid'), dict(color='#123456', width=1, style='solid', extra=True)]
        invalid += [dict(color=c, width=1, style='solid') for c in ['red', '#123', '#1234567', '#12GG56', '#123456\n', True, None]]
        invalid += [dict(color='#123456', width=w, style='solid') for w in [0, -1, .249, 8.001, float('nan'), float('inf'), -float('inf'), True, None, '1']]
        invalid += [dict(color='#123456', width=1, style=s) for s in ['dash', 'SOLID', '', True, None]]
        for value in invalid:
            for target in ['beta', 'guided']:
                scene = copy.deepcopy(self.fixtures['base'])
                next(p for p in scene['planes'] if p['id'] == target)['display']['intersection_stroke'] = value
                for validate in [normalize_scene_3d, GeometryScene3D.model_validate,
                                 lambda s: GeometryBlockCreate.model_validate(dict(block_type='geometry', payload=dict(source_data=s), expected_revision_updated_at=NOW)),
                                 lambda s: GeometryBlockUpdate.model_validate(dict(source_data=s, expected_revision_updated_at=NOW))]:
                    with self.assertRaises(ValueError):
                        validate(scene)
