import copy
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from app.schemas.geometry_3d import normalize_scene_3d, GeometryScene3D
from app.schemas.geometry_3d_solids import solid_topology
from app.schemas.question_editor import GeometryBlockCreate, GeometryBlockUpdate
from tests.test_geometry_v1_contract import NOW

ROOT = Path(__file__).resolve().parents[1]
class RegularFrustumTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp) / 'regular.json'
            subprocess.run(['node', 'tests/test_geometry_3d_regular_frustum.mjs', str(output)], cwd=ROOT, check=True)
            cls.scenes = json.loads(output.read_text(encoding='utf-8'))

    def test_contract_topology_and_payload_parity(self):
        self.assertEqual(len(self.scenes), 22)
        for scene in self.scenes:
            self.assertEqual(normalize_scene_3d(scene), scene)
            self.assertEqual(GeometryScene3D.model_validate(scene).model_dump(mode='json'), scene)
            create = GeometryBlockCreate.model_validate(dict(block_type='geometry', payload=dict(source_data=scene), expected_revision_updated_at=NOW))
            update = GeometryBlockUpdate.model_validate(dict(source_data=create.payload.source_data.model_dump(mode='json'), expected_revision_updated_at=NOW))
            self.assertEqual(update.source_data.model_dump(mode='json'), scene)
            solid = scene['solids'][0]
            topology = solid_topology(scene, solid)
            slots = {f['slot']: f['entity_id'] for f in solid['features']}
            points = {p['id']: p['position'] for p in scene['points']}
            for i, vertex in enumerate(topology['vertices']):
                for actual, expected in zip(vertex, points[slots[f'v_{i}']]):
                    self.assertAlmostEqual(actual, expected, places=9)

    def test_reject_invalid_parameters(self):
        for change in [dict(sides=2), dict(sides=129), dict(sides=3.5), dict(sides=True), dict(bottom_radius=1), dict(top_radius=2), dict(top_radius=0), dict(height=-1), dict(bottom_radius=float('inf')), dict(direction=[0,0,1]), dict(apex_offset=[1,0])]:
            value = copy.deepcopy(self.scenes[0])
            value['solids'][0]['parameters'].update(change)
            with self.assertRaises(ValueError): normalize_scene_3d(value)

    def test_actual_apply_route(self):
        import uuid
        from unittest.mock import patch
        from tests.test_question_editor_api import QuestionEditorApiTest
        fixture = QuestionEditorApiTest()
        fixture.setUp()
        try:
            scene = self.scenes[0]
            expected = fixture._geometry_response(scene)
            path = f'/api/v1/question-editor/revisions/{uuid.uuid4()}/blocks/{expected.id}/geometry'
            with patch('app.api.question_editor.QuestionEditorService') as service:
                service.return_value.update_geometry_block.return_value = expected
                accepted = fixture.client.patch(path, json=fixture._geometry_update_request(scene))
                self.assertEqual(accepted.status_code, 200, accepted.text)
                self.assertEqual(accepted.json()['payload']['source_data'], scene)
        finally:
            fixture.tearDown()

if __name__ == '__main__': unittest.main()
