import copy
import json
import math
from pathlib import Path
import subprocess
import tempfile
import unittest
from app.schemas.geometry_3d import normalize_scene_3d, GeometryScene3D
from app.schemas.geometry_3d_constructed_plane import constructed_perpendicular_plane, normalize_plane_angle
from app.schemas.question_editor import GeometryBlockCreate, GeometryBlockUpdate
from tests.test_geometry_v1_contract import NOW
ROOT=Path(__file__).resolve().parents[1]

class PerpendicularPlaneTest(unittest.TestCase):
    def test_intersection_display_visibility_contract(self):
        for visibility in ['visible','hidden']:
            scene=copy.deepcopy(self.scenes[0])
            output=next(p for p in scene['planes'] if p['id']==scene['constructions'][0]['output_plane_id'])
            output['display']['intersection_visibility']=visibility
            self.assertEqual(normalize_scene_3d(scene),scene)
            self.assertEqual(GeometryScene3D.model_validate(scene).model_dump(mode='json'),scene)
            block=GeometryBlockUpdate.model_validate(dict(source_data=scene,expected_revision_updated_at=NOW))
            self.assertEqual(block.source_data.model_dump(mode='json'),scene)
        for invalid in [True,'yes',None,0]:
            scene=copy.deepcopy(self.scenes[0]);scene['planes'][1]['display']['intersection_visibility']=invalid
            with self.assertRaises(ValueError): normalize_scene_3d(scene)

    @classmethod
    def setUpClass(cls):
        with tempfile.TemporaryDirectory() as tmp:
            out=Path(tmp)/'scenes.json';subprocess.run(['node','tests/test_geometry_3d_perpendicular_plane.mjs',str(out)],cwd=ROOT,check=True)
            cls.scenes=json.loads(out.read_text(encoding='utf-8'))

    def test_math_and_canonical_api_payload_parity(self):
        self.assertEqual(len(self.scenes),92)
        for scene in self.scenes:
            self.assertEqual(normalize_scene_3d(scene),scene)
            self.assertEqual(GeometryScene3D.model_validate(scene).model_dump(mode='json'),scene)
            c=scene['constructions'][0];points={p['id']:p['position'] for p in scene['points']}
            ref=next(r for r in scene['planes' if c['reference']['kind']=='plane' else 'faces'] if r['id']==c['reference']['id'])
            vertices=[points[id] for id in ref.get('point_ids',ref.get('boundary'))]
            result=constructed_perpendicular_plane(points[c['through']['id']],vertices,c['orientation']['angle_radians'])
            self.assertFalse(result['coincident'])
            for id,expected in zip(c['output_point_ids'],result['positions']):
                for x,y in zip(points[id],expected): self.assertAlmostEqual(x,y,delta=1e-9)
            created=GeometryBlockCreate.model_validate(dict(block_type='geometry',payload=dict(source_data=scene),expected_revision_updated_at=NOW))
            updated=GeometryBlockUpdate.model_validate(dict(source_data=created.payload.source_data.model_dump(mode='json'),expected_revision_updated_at=NOW))
            self.assertEqual(updated.source_data.model_dump(mode='json'),scene)

    def test_strict_paired_variant_cycles_and_angles(self):
        for key,value in [('orientation',dict(kind='unique')),('orientation',dict(kind='plane_local_angle',angle_radians=float('nan'))),('orientation',dict(kind='plane_local_angle',angle_radians=True)),('relation','parallel'),('reference',dict(kind='plane',id='beta')),('through',dict(kind='point',id='beta_x'))]:
            scene=copy.deepcopy(self.scenes[0]);scene['constructions'][0][key]=value
            with self.assertRaises(ValueError): normalize_scene_3d(scene)
        for angle in [-2*math.pi,-.7,0,2*math.pi,30]:
            scene=copy.deepcopy(self.scenes[0]);scene['constructions'][0]['orientation']['angle_radians']=angle
            self.assertAlmostEqual(normalize_scene_3d(scene)['constructions'][0]['orientation']['angle_radians'],normalize_plane_angle(angle),delta=1e-12)
        vertices=[[0,0,0],[1,0,0],[0,1,0]]
        for angle in [None,float('inf'),float('nan'),True]:
            with self.assertRaises(ValueError): constructed_perpendicular_plane([0,0,0],vertices,angle)
        with self.assertRaises(ValueError): constructed_perpendicular_plane([0,0,0],[[0,0,0]]*3,0)
        with self.assertRaises(ValueError): constructed_perpendicular_plane([float('nan'),0,0],vertices,0)

    def test_mocked_update_and_reopen(self):
        import uuid
        from unittest.mock import patch
        from tests.test_question_editor_api import QuestionEditorApiTest
        fixture=QuestionEditorApiTest();fixture.setUp()
        try:
            scene=self.scenes[0];expected=fixture._geometry_response(scene)
            path=f'/api/v1/question-editor/revisions/{uuid.uuid4()}/blocks/{expected.id}/geometry'
            with patch('app.api.question_editor.QuestionEditorService') as service:
                service.return_value.update_geometry_block.return_value=expected
                response=fixture.client.patch(path,json=fixture._geometry_update_request(scene));self.assertEqual(response.status_code,200,response.text)
                self.assertEqual(GeometryScene3D.model_validate(response.json()['payload']['source_data']).model_dump(mode='json'),scene)
                service.reset_mock();invalid=copy.deepcopy(scene);invalid['constructions'][0]['orientation']={'kind':'unique'}
                rejected=fixture.client.patch(path,json=fixture._geometry_update_request(invalid));self.assertEqual(rejected.status_code,422);service.assert_not_called()
        finally: fixture.tearDown()
