import copy
import json
import math
from pathlib import Path
import subprocess
import tempfile
import unittest
from app.schemas.geometry_3d import normalize_scene_3d, GeometryScene3D
from app.schemas.geometry_3d_constructed_plane import guided_perpendicular_plane
from app.schemas.question_editor import GeometryBlockCreate, GeometryBlockUpdate
from tests.test_geometry_v1_contract import NOW
ROOT=Path(__file__).resolve().parents[1]

class GuidedPlaneTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with tempfile.TemporaryDirectory() as tmp:
            output=Path(tmp)/'guided.json'
            subprocess.run(['node','tests/test_geometry_3d_guided_plane.mjs',str(output)],cwd=ROOT,check=True)
            cls.scenes=json.loads(output.read_text(encoding='utf-8'))

    def test_canonical_math_and_api_contract(self):
        self.assertEqual(len(self.scenes),73)
        for scene in self.scenes:
            self.assertEqual(normalize_scene_3d(scene),scene)
            self.assertEqual(GeometryScene3D.model_validate(scene).model_dump(mode='json'),scene)
            c=scene['constructions'][0];points={p['id']:p['position'] for p in scene['points']}
            guide=c['guide']
            if guide['kind']=='linear':
                guide=next(l for l in scene['linear_objects'] if l['id']==guide['id'])
            reference=next(p for p in scene['planes'] if p['id']==c['reference']['id'])
            expected=guided_perpendicular_plane(points[guide['a']],points[guide['b']],[points[id] for id in reference['point_ids']])
            for id,position in zip(c['output_point_ids'],expected['positions']): self.assertLess(math.dist(points[id],position),1e-9)
            create=GeometryBlockCreate.model_validate(dict(block_type='geometry',payload=dict(source_data=scene),expected_revision_updated_at=NOW))
            update=GeometryBlockUpdate.model_validate(dict(source_data=create.payload.source_data.model_dump(mode='json'),expected_revision_updated_at=NOW))
            self.assertEqual(update.source_data.model_dump(mode='json'),scene)
            for lower in ['both','upper']:
                trimmed=copy.deepcopy(scene);next(p for p in trimmed['planes'] if p['id']==c['output_plane_id'])['display']['lower_portion']=lower
                self.assertEqual(normalize_scene_3d(trimmed),trimmed)

    def test_invalid_and_cycles(self):
        for mode in ['intersection','reference_x',None]:
            scene=copy.deepcopy(self.scenes[0])
            if mode is None: scene['constructions'][0]['display_link'].pop('extent_mode',None)
            else: scene['constructions'][0]['display_link']['extent_mode']=mode
            self.assertEqual(normalize_scene_3d(scene),scene)
            self.assertEqual(GeometryScene3D.model_validate(scene).model_dump(mode='json'),scene)
        for mode in ['invalid',True,0,None]:
            scene=copy.deepcopy(self.scenes[0]);scene['constructions'][0]['display_link']['extent_mode']=mode
            with self.assertRaises(ValueError): normalize_scene_3d(scene)
        for guide in [dict(kind='points',a='A',b='A'),dict(kind='points',a='A',b='missing'),dict(kind='linear',id='alpha'),dict(kind='face',id='alpha')]:
            scene=copy.deepcopy(self.scenes[0]);scene['constructions'][0]['guide']=guide
            with self.assertRaises(ValueError): normalize_scene_3d(scene)
        for ratio in [0,-1,float('nan'),float('inf'),True]:
            scene=copy.deepcopy(self.scenes[0]);scene['constructions'][0]['display_link']['width_ratio']=ratio
            with self.assertRaises(ValueError): normalize_scene_3d(scene)
        scene=copy.deepcopy(self.scenes[0]);scene['constructions'][0]['guide']=dict(kind='points',a='A',b='beta_x')
        with self.assertRaises(ValueError): normalize_scene_3d(scene)
        scene=copy.deepcopy(self.scenes[0]);points={p['id']:p for p in scene['points']};points['B']['position']=points['A']['position'][:]
        with self.assertRaises(ValueError): normalize_scene_3d(scene)
        for a,b in [([0,0,0],[0,0,0]),([float('nan'),0,0],[1,0,0])]:
            with self.assertRaises(ValueError): guided_perpendicular_plane(a,b,[[0,0,0],[1,0,0],[0,1,0]])
        with self.assertRaises(ValueError): guided_perpendicular_plane([0,0,0],[0,1e-4,1e12],[[0,0,0],[1,0,0],[0,1,0]])
