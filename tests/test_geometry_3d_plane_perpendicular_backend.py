import copy
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from app.schemas.geometry_3d import normalize_scene_3d, GeometryScene3D
from app.schemas.geometry_3d_perpendicular import plane_perpendicular_foot
from app.schemas.question_editor import GeometryBlockCreate, GeometryBlockUpdate
from tests.test_geometry_v1_contract import NOW

ROOT=Path(__file__).resolve().parents[1]

class PlanePerpendicularTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with tempfile.TemporaryDirectory() as tmp:
            out=Path(tmp)/'scenes.json'
            subprocess.run(['node','tests/test_geometry_3d_plane_perpendicular.mjs',str(out)],cwd=ROOT,check=True)
            cls.scenes=json.loads(out.read_text(encoding='utf-8'))

    def test_contract_and_projection_parity(self):
        self.assertEqual(len(self.scenes),26)
        for scene in self.scenes:
            self.assertEqual(normalize_scene_3d(scene),scene)
            self.assertEqual(GeometryScene3D.model_validate(scene).model_dump(mode='json'),scene)
            created=GeometryBlockCreate.model_validate(dict(block_type='geometry',payload=dict(source_data=scene),expected_revision_updated_at=NOW))
            updated=GeometryBlockUpdate.model_validate(dict(source_data=created.payload.source_data.model_dump(mode='json'),expected_revision_updated_at=NOW))
            self.assertEqual(updated.source_data.model_dump(mode='json'),scene)
            c=scene['constructions'][0];points={p['id']:p['position'] for p in scene['points']}
            r=next(r for r in scene['planes' if c['reference']['kind']=='plane' else 'faces'] if r['id']==c['reference']['id'])
            ids=r.get('point_ids',r.get('boundary'))
            result=plane_perpendicular_foot(points[c['source_point_id']],[points[i] for i in ids])
            for expected,actual in zip(result['position'],points[c['output_point_id']]): self.assertAlmostEqual(expected,actual,places=8)

    def test_invalid_references_cycles_and_pyramid_ownership(self):
        for field in ('source_point_id','segment_id'):
            scene=copy.deepcopy(self.scenes[0]);scene['constructions'][0][field]='missing'
            with self.assertRaises(ValueError): normalize_scene_3d(scene)
        scene=copy.deepcopy(self.scenes[0]);scene['planes'][0]['point_ids'][0]=scene['constructions'][0]['output_point_id']
        with self.assertRaises(ValueError): normalize_scene_3d(scene)
        altitude=next(s for s in self.scenes if s['constructions'][0]['kind']=='pyramid_altitude')
        for field,value in [('pyramid_id','missing'),('source_point_id',altitude['faces'][0]['boundary'][0])]:
            scene=copy.deepcopy(altitude);scene['constructions'][0][field]=value
            with self.assertRaises(ValueError): normalize_scene_3d(scene)
        scene=copy.deepcopy(altitude);scene['constructions'][0]['reference']['id']=scene['faces'][1]['id']
        with self.assertRaises(ValueError): normalize_scene_3d(scene)

    def test_math_rejection_and_infinite_plane(self):
        vertices=[[0,0,0],[1,0,0],[0,1,0]]
        self.assertEqual(plane_perpendicular_foot([10,20,3],vertices)['position'],[10,20,0])
        for p,v in [([0,0,0],vertices),([float('nan'),0,1],vertices),([0,0,1],[[0,0,0]]*3)]:
            with self.assertRaises(ValueError): plane_perpendicular_foot(p,v)
