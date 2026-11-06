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


class PointComponentVisibilityTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / 'point_visibility.json'
            subprocess.run(['node', 'tests/test_geometry_3d_point_component_visibility.mjs', str(target)], cwd=ROOT, check=True)
            cls.fixtures = json.loads(target.read_text(encoding='utf-8'))

    def test_frontend_backend_api_roundtrips(self):
        self.assertEqual(len(self.fixtures['scenes']), 81)
        for scene in [*self.fixtures['scenes'], self.fixtures['changed'], *self.fixtures['retained']]:
            before = copy.deepcopy(scene)
            self.assertEqual(normalize_scene_3d(scene), scene)
            model = GeometryScene3D.model_validate(scene)
            self.assertEqual(model.model_dump(mode='json'), scene)
            self.assertEqual(GeometryScene3D.model_validate_json(model.model_dump_json()).model_dump(mode='json'), scene)
            created = GeometryBlockCreate.model_validate(dict(block_type='geometry', payload=dict(source_data=scene), expected_revision_updated_at=NOW))
            updated = GeometryBlockUpdate.model_validate(dict(source_data=created.payload.source_data.model_dump(mode='json'), expected_revision_updated_at=NOW))
            self.assertEqual(updated.source_data.model_dump(mode='json'), scene)
            self.assertEqual(scene, before)

    def test_absent_point_fields_stay_absent(self):
        base = self.fixtures['base']
        result = GeometryScene3D.model_validate(base).model_dump(mode='json')
        self.assertEqual(result, base)
        for point in result['points']:
            self.assertNotIn('marker_visibility', point)
            self.assertNotIn('label_visibility', point)

    def test_strict_invalid_fields(self):
        invalid = [None, True, False, 0, 1, '', 'VISIBLE', 'hide', [], {}, float('nan'), float('inf')]
        for field in ['marker_visibility', 'label_visibility', 'visibility']:
            for value in invalid:
                scene = copy.deepcopy(self.fixtures['base'])
                next(p for p in scene['points'] if p['id'] == 'P')[field] = value
                for validate in [normalize_scene_3d, GeometryScene3D.model_validate,
                                 lambda s: GeometryBlockUpdate.model_validate(dict(source_data=s, expected_revision_updated_at=NOW))]:
                    with self.subTest(field=field, value=value):
                        with self.assertRaises(ValueError):
                            validate(scene)
        for field in ['markerVisible', 'labelVisible', 'display', 'extra']:
            scene = copy.deepcopy(self.fixtures['base'])
            scene['points'][0][field] = {}
            with self.assertRaises(ValueError):
                normalize_scene_3d(scene)

    def test_mocked_api_roundtrip(self):
        import uuid
        from unittest.mock import patch
        from tests.test_question_editor_api import QuestionEditorApiTest
        fixture = QuestionEditorApiTest()
        fixture.setUp()
        try:
            scene = self.fixtures['changed']
            expected = fixture._geometry_response(scene)
            path = f'/api/v1/question-editor/revisions/{uuid.uuid4()}/blocks/{expected.id}/geometry'
            with patch('app.api.question_editor.QuestionEditorService') as service:
                service.return_value.update_geometry_block.return_value = expected
                response = fixture.client.patch(path, json=fixture._geometry_update_request(scene))
                self.assertEqual(response.status_code, 200, response.text)
                self.assertEqual(response.json()['payload']['source_data'], scene)
                submitted = service.return_value.update_geometry_block.call_args.kwargs['request']
                self.assertEqual(submitted.source_data.model_dump(mode='json'), scene)
                service.reset_mock()
                invalid = copy.deepcopy(scene)
                next(p for p in invalid['points'] if p['id'] == 'P')['marker_visibility'] = False
                response = fixture.client.patch(path, json=fixture._geometry_update_request(invalid))
                self.assertEqual(response.status_code, 422)
                service.assert_not_called()
        finally:
            fixture.tearDown()
