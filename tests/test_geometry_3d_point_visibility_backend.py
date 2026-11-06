import copy
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from app.schemas.geometry_3d import normalize_scene_3d, GeometryScene3D
from app.schemas.question_editor import GeometryBlockCreate, GeometryBlockUpdate
from tests.test_geometry_v1_contract import NOW
ROOT=Path(__file__).resolve().parents[1]

class PointVisibilityTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with tempfile.TemporaryDirectory() as tmp:
            out=Path(tmp)/'scenes.json';subprocess.run(['node','tests/test_geometry_3d_point_visibility.mjs',str(out)],cwd=ROOT,check=True)
            cls.scenes=json.loads(out.read_text(encoding='utf-8'))

    def test_canonical_legacy_and_payload_parity(self):
        self.assertEqual(len(self.scenes),12)
        for scene in self.scenes:
            self.assertEqual(normalize_scene_3d(scene),scene)
            self.assertEqual(GeometryScene3D.model_validate(scene).model_dump(mode='json'),scene)
            created=GeometryBlockCreate.model_validate(dict(block_type='geometry',payload=dict(source_data=scene),expected_revision_updated_at=NOW))
            updated=GeometryBlockUpdate.model_validate(dict(source_data=created.payload.source_data.model_dump(mode='json'),expected_revision_updated_at=NOW))
            self.assertEqual(updated.source_data.model_dump(mode='json'),scene)

    def test_invalid_visibility(self):
        for value in (None,True,0,'hide',''):
            scene=copy.deepcopy(self.scenes[0]);scene['points'][0]['visibility']=value
            with self.assertRaises(ValueError): normalize_scene_3d(scene)

    def test_mocked_api_save_and_reopen_payload(self):
        import uuid
        from unittest.mock import patch
        from tests.test_question_editor_api import QuestionEditorApiTest
        fixture=QuestionEditorApiTest();fixture.setUp()
        try:
            scene=self.scenes[1];expected=fixture._geometry_response(scene)
            path=f'/api/v1/question-editor/revisions/{uuid.uuid4()}/blocks/{expected.id}/geometry'
            with patch('app.api.question_editor.QuestionEditorService') as service:
                service.return_value.update_geometry_block.return_value=expected
                response=fixture.client.patch(path,json=fixture._geometry_update_request(scene))
                self.assertEqual(response.status_code,200,response.text)
                reopened=GeometryScene3D.model_validate(response.json()['payload']['source_data']).model_dump(mode='json')
                self.assertEqual(reopened,scene);self.assertEqual(next(p for p in reopened['points'] if p['id']=='P')['visibility'],'hidden')
                self.assertEqual(reopened['constructions'][0]['through']['id'],'P')
                service.reset_mock();invalid=copy.deepcopy(scene);invalid['points'][0]['visibility']='invalid'
                rejected=fixture.client.patch(path,json=fixture._geometry_update_request(invalid));self.assertEqual(rejected.status_code,422);service.assert_not_called()
        finally: fixture.tearDown()
