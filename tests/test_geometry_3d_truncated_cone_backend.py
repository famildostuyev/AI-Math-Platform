import copy
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from app.schemas.geometry_3d import normalize_scene_3d, GeometryScene3D
from app.schemas.geometry_3d_analytic import analytic_feature_positions, evaluate_analytic_surface, inverse_analytic_surface, intersect_closed_frustum, AnalyticFrame
ROOT=Path(__file__).resolve().parents[1]
class TruncatedConeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with tempfile.TemporaryDirectory() as tmp:
            output=Path(tmp)/'scenes.json'
            subprocess.run(['node','tests/test_geometry_3d_truncated_cone.mjs',str(output)],cwd=ROOT,check=True)
            cls.scenes=json.loads(output.read_text(encoding='utf-8'))
    def test_canonical_geometry_parity(self):
        self.assertEqual(len(self.scenes),42)
        for scene in self.scenes:
            self.assertEqual(normalize_scene_3d(scene),scene)
            self.assertEqual(GeometryScene3D.model_validate(scene).model_dump(mode='json'),scene)
            solid=scene['solids'][0]
            positions=analytic_feature_positions(solid)
            for point in scene['points']:
                if point['id'] in positions:
                    for actual,expected in zip(point['position'],positions[point['id']]): self.assertAlmostEqual(actual,expected,places=8)
            for uv in ([0,0],[.25,.5],[.5,1],[.999999,.3]):
                world=evaluate_analytic_surface(solid,uv)
                actual=inverse_analytic_surface(solid,world)
                for a,b in zip(actual,uv): self.assertAlmostEqual(a,b,places=8)
            for recipe in scene['constructions']:
                if recipe['kind']=='point_on_surface':
                    expected=evaluate_analytic_surface(solid,recipe['uv'])
                    point=next(p for p in scene['points'] if p['id']==recipe['output_point_id'])
                    for a,b in zip(point['position'],expected): self.assertAlmostEqual(a,b,places=8)
    def test_invalid_parameters(self):
        for change in (dict(bottom_radius=1),dict(top_radius=2),dict(top_radius=0),dict(height=0),dict(height=float('inf')),dict(bottom_radius=float('nan')),dict(offset=[1,0])):
            scene=copy.deepcopy(self.scenes[0]);scene['solids'][0]['parameters'].update(change)
            with self.assertRaises(ValueError): normalize_scene_3d(scene)
    def test_closed_caps_and_lateral_rays(self):
        for scene in self.scenes:
            solid=scene['solids'][0];frame=AnalyticFrame(solid['frame']);p=solid['parameters'];h=p['height']
            caps=intersect_closed_frustum(solid,dict(origin=frame.to_world([0,0,h+5]),direction=frame.vector_to_world([0,0,-1])))
            self.assertEqual([hit['region'] for hit in caps],['top_cap','bottom_cap'])
            side=intersect_closed_frustum(solid,dict(origin=frame.to_world([p['bottom_radius']+5,0,h/2]),direction=frame.vector_to_world([-1,0,0])))
            self.assertEqual(len(side),2)
            self.assertAlmostEqual(frame.to_local(side[0]['position'])[0],(p['bottom_radius']+p['top_radius'])/2,places=8)
    def test_mocked_apply_route(self):
        import uuid
        from unittest.mock import patch
        from tests.test_question_editor_api import QuestionEditorApiTest
        fixture=QuestionEditorApiTest();fixture.setUp()
        try:
            scene=self.scenes[0];expected=fixture._geometry_response(scene)
            with patch('app.api.question_editor.QuestionEditorService') as service:
                service.return_value.update_geometry_block.return_value=expected
                response=fixture.client.patch(f'/api/v1/question-editor/revisions/{uuid.uuid4()}/blocks/{expected.id}/geometry',json=fixture._geometry_update_request(scene))
                self.assertEqual(response.status_code,200,response.text)
                self.assertEqual(response.json()['payload']['source_data'],scene)
        finally: fixture.tearDown()
if __name__=='__main__': unittest.main()
