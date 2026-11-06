import copy
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from app.schemas.geometry_3d import normalize_scene_3d, GeometryScene3D
from app.schemas.geometry_3d_constructed_plane import constructed_parallel_plane
from app.schemas.question_editor import GeometryBlockCreate, GeometryBlockUpdate
from tests.test_geometry_v1_contract import NOW
ROOT=Path(__file__).resolve().parents[1]

class ConstructedPlaneTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with tempfile.TemporaryDirectory() as tmp:
            out=Path(tmp)/'scenes.json'
            subprocess.run(['node','tests/test_geometry_3d_constructed_plane.mjs',str(out)],cwd=ROOT,check=True)
            cls.scenes=json.loads(out.read_text(encoding='utf-8'))

    def test_math_contract_and_api_payload_parity(self):
        self.assertEqual(len(self.scenes),26)
        for scene in self.scenes:
            self.assertEqual(normalize_scene_3d(scene),scene)
            self.assertEqual(GeometryScene3D.model_validate(scene).model_dump(mode='json'),scene)
            c=next(c for c in scene['constructions'] if c['kind']=='constructed_plane');points={p['id']:p['position'] for p in scene['points']}
            ref=next(r for r in scene['planes' if c['reference']['kind']=='plane' else 'faces'] if r['id']==c['reference']['id'])
            ids=ref.get('point_ids',ref.get('boundary'));result=constructed_parallel_plane(points[c['through']['id']],[points[i] for i in ids])
            for output,expected in zip(c['output_point_ids'],result['positions']):
                for x,y in zip(points[output],expected): self.assertAlmostEqual(x,y,places=8)
            created=GeometryBlockCreate.model_validate(dict(block_type='geometry',payload=dict(source_data=scene),expected_revision_updated_at=NOW))
            updated=GeometryBlockUpdate.model_validate(dict(source_data=created.payload.source_data.model_dump(mode='json'),expected_revision_updated_at=NOW))
            self.assertEqual(updated.source_data.model_dump(mode='json'),scene)

    def test_strict_identity_ownership_and_cycles(self):
        for key,value in [('output_plane_id','missing'),('output_point_ids',['beta_origin']*3),('relation','perpendicular'),('orientation',dict(kind='angle',angle_radians=0)),('through',dict(kind='point',id='beta_x')),('reference',dict(kind='plane',id='beta'))]:
            scene=copy.deepcopy(self.scenes[0]);scene['constructions'][0][key]=value
            with self.assertRaises(ValueError): normalize_scene_3d(scene)
        scene=copy.deepcopy(self.scenes[0]);scene['constructions'].append(dict(scene['constructions'][0],id='duplicate'))
        with self.assertRaises(ValueError): normalize_scene_3d(scene)
        scene=copy.deepcopy(self.scenes[0]);next(p for p in scene['planes'] if p['id']=='beta')['point_ids'].reverse()
        with self.assertRaises(ValueError): normalize_scene_3d(scene)

    def test_invalid_math_and_coincidence(self):
        v=[[0,0,0],[1,0,0],[0,1,0]]
        self.assertTrue(constructed_parallel_plane([.2,.3,0],v)['coincident'])
        self.assertFalse(constructed_parallel_plane([.2,.3,2],v)['coincident'])
        for point,vertices in [([float('nan'),0,0],v),([0,0,0],[[0,0,0]]*3),([1e12,0,0],v)]:
            with self.assertRaises(ValueError): constructed_parallel_plane(point,vertices)
        with self.assertRaisesRegex(ValueError,'represented reliably'):
            constructed_parallel_plane([1e12-10]*3,[[0,0,0],[1,2,0],[0,0,1]])

    def test_mocked_geometry_update_route(self):
        import uuid
        from unittest.mock import patch
        from tests.test_question_editor_api import QuestionEditorApiTest
        fixture=QuestionEditorApiTest();fixture.setUp()
        try:
            scene=self.scenes[0];expected=fixture._geometry_response(scene)
            path=f'/api/v1/question-editor/revisions/{uuid.uuid4()}/blocks/{expected.id}/geometry'
            with patch('app.api.question_editor.QuestionEditorService') as service:
                service.return_value.update_geometry_block.return_value=expected
                accepted=fixture.client.patch(path,json=fixture._geometry_update_request(scene))
                self.assertEqual(accepted.status_code,200,accepted.text)
                self.assertEqual(accepted.json()['payload']['source_data'],scene)
                self.assertEqual(service.return_value.update_geometry_block.call_args.kwargs['request'].source_data.model_dump(mode='json'),scene)
                service.reset_mock()
                invalid=copy.deepcopy(scene);invalid['constructions'][0]['reference']['id']='beta'
                rejected=fixture.client.patch(path,json=fixture._geometry_update_request(invalid))
                self.assertEqual(rejected.status_code,422);service.assert_not_called()
        finally: fixture.tearDown()
