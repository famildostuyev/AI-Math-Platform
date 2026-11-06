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


class PlaneHiddenEdgesTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / 'hidden_edges.json'
            subprocess.run(['node', 'tests/test_geometry_3d_plane_hidden_edges.mjs', str(target)], cwd=ROOT, check=True)
            cls.fixtures = json.loads(target.read_text(encoding='utf-8'))

    def test_frontend_backend_api_roundtrips(self):
        self.assertEqual(len(self.fixtures['scenes']), 128)
        for scene in [*self.fixtures['scenes'], self.fixtures['mixed']]:
            with self.subTest(display=scene['planes'][0].get('display')):
                before = copy.deepcopy(scene)
                self.assertEqual(normalize_scene_3d(scene), scene)
                model = GeometryScene3D.model_validate(scene)
                self.assertEqual(model.model_dump(mode='json'), scene)
                self.assertEqual(GeometryScene3D.model_validate_json(model.model_dump_json()).model_dump(mode='json'), scene)
                create = GeometryBlockCreate.model_validate(dict(block_type='geometry', payload=dict(source_data=scene), expected_revision_updated_at=NOW))
                update = GeometryBlockUpdate.model_validate(dict(source_data=create.payload.source_data.model_dump(mode='json'), expected_revision_updated_at=NOW))
                self.assertEqual(update.source_data.model_dump(mode='json'), scene)
                self.assertEqual(scene, before)

    def test_absence_is_preserved(self):
        base = self.fixtures['base']
        self.assertEqual(normalize_scene_3d(base), base)
        model = GeometryScene3D.model_validate(base)
        self.assertEqual(model.model_dump(mode='json'), base)
        self.assertNotIn('show_hidden_edges', model.model_dump_json())

    def test_strict_rejection(self):
        for value in [None, 0, 1, -1, 0.0, 1.0, float('nan'), float('inf'), 'true', 'false', '0', '', [], {}, [True]]:
            for plane_id in ['alpha', 'beta', 'half']:
                scene = copy.deepcopy(self.fixtures['mixed'])
                next(p for p in scene['planes'] if p['id'] == plane_id)['display']['show_hidden_edges'] = value
                validators = [normalize_scene_3d, GeometryScene3D.model_validate,
                              lambda s: GeometryBlockCreate.model_validate(dict(block_type='geometry', payload=dict(source_data=s), expected_revision_updated_at=NOW)),
                              lambda s: GeometryBlockUpdate.model_validate(dict(source_data=s, expected_revision_updated_at=NOW))]
                for validate in validators:
                    with self.subTest(value=value, plane=plane_id, validate=validate):
                        with self.assertRaises(ValueError):
                            validate(scene)

    def test_wrong_location_and_unknown_fields(self):
        for location, field in [('plane', 'show_hidden_edges'), ('display', 'showHiddenEdges')]:
            scene = copy.deepcopy(self.fixtures['mixed'])
            target = scene['planes'][0] if location == 'plane' else scene['planes'][0]['display']
            target[field] = True
            for validate in [normalize_scene_3d, GeometryScene3D.model_validate]:
                with self.assertRaises(ValueError):
                    validate(scene)

    def test_openapi_display_field_is_boolean(self):
        schema = GeometryScene3D.model_json_schema()
        settings = [definition['properties']['show_hidden_edges']
                    for definition in schema['$defs'].values()
                    if 'show_hidden_edges' in definition.get('properties', {})]
        self.assertTrue(settings)
        self.assertTrue(all(s['type'] == 'boolean' for s in settings))
