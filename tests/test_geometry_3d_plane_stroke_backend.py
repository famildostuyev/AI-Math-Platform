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


class PlaneStrokeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / 'stroke.json'
            subprocess.run(['node', 'tests/test_geometry_3d_plane_stroke.mjs', str(out)], cwd=ROOT, check=True)
            cls.fixtures = json.loads(out.read_text(encoding='utf-8'))

    def test_frontend_backend_api_roundtrips(self):
        self.assertEqual(len(self.fixtures['scenes']), 47)
        for scene in self.fixtures['scenes']:
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
        self.assertEqual(normalize_scene_3d(base), base)
        self.assertEqual(GeometryScene3D.model_validate(base).model_dump(mode='json'), base)
        self.assertTrue(all('stroke' not in p.get('display', {}) for p in base['planes']))
        scene = copy.deepcopy(self.fixtures['styled'])
        target = next(p for p in scene['planes'] if p['id'] == 'beta')
        target['display']['stroke']['color'] = '#aB12eF'
        expected = copy.deepcopy(scene)
        next(p for p in expected['planes'] if p['id'] == 'beta')['display']['stroke']['color'] = '#AB12EF'
        self.assertEqual(normalize_scene_3d(scene), expected)
        self.assertEqual(GeometryScene3D.model_validate(scene).model_dump(mode='json'), expected)
        self.assertEqual(target['display']['stroke']['color'], '#aB12eF')

    def test_strict_rejection(self):
        invalid = [None, [], {}, 'red']
        invalid += [dict(color=c, width=1, style='solid') for c in ['red', '#123', '#12345678', '123456', '#12GG56', '#123456\n', ' #123456', '#123456 ', True, 123, None]]
        invalid += [dict(color='#123456', width=w, style='solid') for w in [0, -1, .249999, 8.000001, float('nan'), float('inf'), -float('inf'), True, '1', None]]
        invalid += [dict(color='#123456', width=1, style=s) for s in ['', 'dash', 'SOLID', True, 1, None]]
        invalid += [dict(color='#123456', width=1), dict(color='#123456', style='solid'), dict(width=1, style='solid'), dict(color='#123456', width=1, style='solid', highlighted=True)]
        for stroke in invalid:
            scene = copy.deepcopy(self.fixtures['styled'])
            next(p for p in scene['planes'] if p['id'] == 'beta')['display']['stroke'] = stroke
            for validate in [normalize_scene_3d, GeometryScene3D.model_validate,
                             lambda s: GeometryBlockCreate.model_validate(dict(block_type='geometry', payload=dict(source_data=s), expected_revision_updated_at=NOW)),
                             lambda s: GeometryBlockUpdate.model_validate(dict(source_data=s, expected_revision_updated_at=NOW))]:
                with self.assertRaises(ValueError):
                    validate(scene)
