import copy
import json
import math
from pathlib import Path
import subprocess
import tempfile
import unittest
from app.schemas.geometry_3d import normalize_scene_3d, GeometryScene3D
from app.schemas.geometry_3d_dihedral import dihedral_positions
ROOT=Path(__file__).resolve().parents[1]
class DihedralTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with tempfile.TemporaryDirectory() as tmp:
            out=Path(tmp)/'scenes.json'
            subprocess.run(['node','tests/test_geometry_3d_dihedral.mjs',str(out)],cwd=ROOT,check=True)
            cls.scenes=json.loads(out.read_text(encoding='utf-8'))
    def test_contract_and_geometry_parity(self):
        self.assertEqual(len(self.scenes),30)
        for scene in self.scenes:
            self.assertEqual(normalize_scene_3d(scene),scene)
            self.assertEqual(GeometryScene3D.model_validate(scene).model_dump(mode='json'),scene)
            d=scene['dihedrals'][0];positions=dihedral_positions(d)
            ids={f['slot']:f['entity_id'] for f in d['features']}
            for slot,expected in positions.items():
                actual=next(p['position'] for p in scene['points'] if p['id']==ids[slot])
                for a,b in zip(actual,expected): self.assertAlmostEqual(a,b,places=8)
    def test_legacy_normalization_and_immutability(self):
        legacy=copy.deepcopy(self.scenes[0]);del legacy['dihedrals'][0]['display'];before=copy.deepcopy(legacy)
        self.assertEqual(normalize_scene_3d(legacy)['dihedrals'][0]['display'],{'edge_length':4,'widths':[2.5,2.5]})
        self.assertEqual(legacy,before)
        scene=copy.deepcopy(self.scenes[0]);scene['dihedrals']=[];scene['planes']=[];scene['linear_objects']=[]
        del scene['dihedrals'];before=copy.deepcopy(scene)
        self.assertEqual(normalize_scene_3d(scene)['dihedrals'],[])
        self.assertEqual(scene,before)
        self.assertEqual(GeometryScene3D.model_validate(scene).dihedrals,[])
    def test_invalid_angle_frame_features_and_ownership(self):
        for value in (0,-1,float('nan'),float('inf'),1e7,True):
            for key in ('edge_length','widths'):
                scene=copy.deepcopy(self.scenes[0]);scene['dihedrals'][0]['display'][key]=value if key=='edge_length' else [value,2.5]
                with self.assertRaises(ValueError): normalize_scene_3d(scene)
        for angle in (-.1,math.pi+.1,float('nan'),float('inf'),True):
            scene=copy.deepcopy(self.scenes[0]);scene['dihedrals'][0]['angle_radians']=angle
            with self.assertRaises(ValueError): normalize_scene_3d(scene)
        for change in ('frame','feature','plane','owner'):
            scene=copy.deepcopy(self.scenes[0]);d=scene['dihedrals'][0]
            if change=='frame': d['frame']['x_axis']=[0,0,0]
            elif change=='feature': d['features'][0]['entity_id']=d['features'][1]['entity_id']
            elif change=='plane': scene['planes'][0]['point_ids'].reverse()
            else: scene['points'].append(dict(id='Q',position=[0,0,0],label=None));scene['constructions'].append(dict(id='bad',kind='midpoint',a='Q',b='D_v_0',output_point_id='D_v_3'))
            with self.assertRaises(ValueError): normalize_scene_3d(scene)
    def test_mocked_apply(self):
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
