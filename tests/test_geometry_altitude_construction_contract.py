import copy
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from pydantic import ValidationError
from app.schemas.question_editor import GeometrySourceDataV1
from app.schemas.geometry_constructions import altitude_foot_coordinates


class GeometryAltitudeContractTest(unittest.TestCase):
    def source(self, vx=35):
        return dict(schema_version=1,description='Altitude',viewport=dict(min_x=0,min_y=0,width=100,height=100),
            points=[dict(id='a',x=10,y=20,label='A'),dict(id='v',x=vx,y=50,label=None),dict(id='c',x=70,y=20,label='C'),dict(id='h',x=vx,y=20,label=None)],
            segments=[dict(id='altitude-segment',start_point_id='v',end_point_id='h')],polygons=[dict(id='triangle',point_ids=['a','v','c'])],texts=[],
            constructions=[dict(id='altitude-1',kind='altitude',source_point_ids=['a','v','c'],output_segment_id='altitude-segment',foot_point_id='h')])

    def test_acute_right_obtuse(self):
        for vx in (35,10,-10,90,70):
            source=self.source(vx)
            self.assertEqual(GeometrySourceDataV1.model_validate(source).model_dump(),source)

    def test_slanted_projection(self):
        source=self.source()
        source['points'][2].update(x=70,y=40)
        a,v,c=[SimpleNamespace(**p) for p in source['points'][:3]]
        x,y=altitude_foot_coordinates(a,v,c)
        source['points'][-1].update(x=x,y=y)
        GeometrySourceDataV1.model_validate(source)
        self.assertAlmostEqual((x-v.x)*(c.x-a.x)+(y-v.y)*(c.y-a.y),0)

    def test_invalid_contracts(self):
        patches=[dict(foot_point_id='a'),dict(foot_point_id='missing'),dict(output_segment_id='missing'),dict(source_point_ids=['a','v','a']),dict(source_point_ids=['missing','v','c']),dict(extra=1),dict(id='bad id')]
        for patch in patches:
            with self.subTest(patch=patch):
                source=self.source();source['constructions'][0].update(patch)
                with self.assertRaises(ValidationError): GeometrySourceDataV1.model_validate(source)

    def test_stale_endpoints_degeneracy_nonfinite(self):
        mutations=[lambda g:g['points'][-1].update(x=36),lambda g:g['segments'][0].update(start_point_id='a'),lambda g:g['segments'][0].update(end_point_id='c'),lambda g:g['points'][1].update(y=20),lambda g:g['points'][2].update(x=10),lambda g:g['points'][-1].update(x=float('inf'))]
        for mutate in mutations:
            source=self.source();mutate(source)
            with self.assertRaises(ValidationError): GeometrySourceDataV1.model_validate(source)

    def test_duplicate_and_ownership(self):
        for reverse in (True,False):
            source=self.source();recipe=copy.deepcopy(source['constructions'][0]);recipe['id']='duplicate'
            if reverse: recipe['source_point_ids']=['c','v','a']
            source['constructions'].append(recipe)
            with self.assertRaises(ValidationError): GeometrySourceDataV1.model_validate(source)

    def test_legacy(self):
        source=self.source();source.pop('constructions');source['segments']=[];source['points'].pop()
        self.assertEqual(GeometrySourceDataV1.model_validate(source).model_dump(),source)

    def test_small_height_scaled_degeneracy(self):
        a=SimpleNamespace(x=0,y=0);c=SimpleNamespace(x=1e-6,y=0)
        self.assertEqual(altitude_foot_coordinates(a,SimpleNamespace(x=5e-7,y=1e-8),c),(5e-7,0))
        with self.assertRaises(ValueError): altitude_foot_coordinates(a,SimpleNamespace(x=5e-7,y=1e-10),c)

    def test_symmetric_duplicate_distinct_outputs(self):
        source=self.source()
        source['points'].append(dict(id='h2',x=35,y=20,label=None))
        source['segments'].append(dict(id='s2',start_point_id='v',end_point_id='h2'))
        source['constructions'].append(dict(id='duplicate',kind='altitude',source_point_ids=['c','v','a'],output_segment_id='s2',foot_point_id='h2'))
        with self.assertRaises(ValidationError): GeometrySourceDataV1.model_validate(source)


if __name__ == '__main__': unittest.main()
