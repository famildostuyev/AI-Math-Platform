import copy
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
from pydantic import ValidationError
from app.schemas.question_editor import GeometrySourceDataV1
from app.schemas.geometry_constructions import linear_support_coordinates, LIMITS


class GeometryMedianContractTest(unittest.TestCase):
    def source(self):
        return dict(schema_version=1,description='Median',viewport=dict(min_x=0,min_y=0,width=100,height=100),points=[dict(id='a',x=10,y=20,label='A'),dict(id='v',x=35,y=50,label=None),dict(id='c',x=70,y=20,label='C'),dict(id='m',x=40,y=20,label='Existing M')],segments=[dict(id='median-segment',start_point_id='v',end_point_id='m')],polygons=[dict(id='triangle',point_ids=['a','v','c'])],texts=[],constructions=[dict(id='median-1',kind='median',vertex_point_id='v',output_segment_id='median-segment',midpoint_point_id='m')])

    def assert_roundtrip(self, source):
        original=copy.deepcopy(source)
        self.assertEqual(GeometrySourceDataV1.model_validate(source).model_dump(),source)
        self.assertEqual(source,original)

    def test_roundtrip_borrowed_point_without_triangle_math(self):
        for x,y in [(41,23),(0,0),(35,20)]:
            source=self.source();source['points'][-1].update(x=x,y=y)
            self.assert_roundtrip(source)
        source=self.source();source['polygons']=[];self.assert_roundtrip(source)

    def test_invalid_fields_and_references(self):
        for patch in [dict(midpoint_point_id='v'),dict(midpoint_point_id='missing'),dict(vertex_point_id='missing'),dict(output_segment_id='missing'),dict(source_point_ids=['a','v','c']),dict(extra=1),dict(id='bad id')]:
            source=self.source();source['constructions'][0].update(patch)
            with self.subTest(patch=patch),self.assertRaises(ValidationError):GeometrySourceDataV1.model_validate(source)
        for field in ('vertex_point_id','midpoint_point_id','output_segment_id'):
            source=self.source();del source['constructions'][0][field]
            with self.assertRaises(ValidationError):GeometrySourceDataV1.model_validate(source)

    def test_endpoints_distance_and_nonfinite(self):
        for mutate in [lambda g:g['segments'][0].update(start_point_id='a'),lambda g:g['segments'][0].update(end_point_id='c'),lambda g:g['points'][-1].update(x=35,y=50),lambda g:g['points'][-1].update(x=float('inf')),lambda g:g['points'][1].update(y=float('nan'))]:
            source=self.source();mutate(source)
            with self.assertRaises(ValidationError):GeometrySourceDataV1.model_validate(source)
        for distance,valid in [(LIMITS['minimumSourceDistance']/2,False),(LIMITS['minimumSourceDistance'],True)]:
            source=self.source();source['points'][1].update(x=0,y=0);source['points'][-1].update(x=distance,y=0)
            if valid:self.assert_roundtrip(source)
            else:
                with self.assertRaises(ValidationError):GeometrySourceDataV1.model_validate(source)

    def test_duplicate_pair_and_segment_ownership(self):
        source=self.source();source['segments'].append(dict(id='s2',start_point_id='v',end_point_id='m'))
        source['constructions'].append(dict(id='duplicate',kind='median',vertex_point_id='v',output_segment_id='s2',midpoint_point_id='m'))
        with self.assertRaises(ValidationError):GeometrySourceDataV1.model_validate(source)
        source=self.source();source['constructions'].append(dict(id='owner',kind='median',vertex_point_id='v',output_segment_id='median-segment',midpoint_point_id='m'))
        with self.assertRaises(ValidationError):GeometrySourceDataV1.model_validate(source)

    def test_ordered_pair_shared_midpoint_and_owner(self):
        source=self.source();source['points'][-1]['label']=None
        source['constructions'].append(dict(id='midpoint-owner',kind='midpoint',source_point_ids=['a','c'],output_point_id='m'))
        source['segments'].append(dict(id='s2',start_point_id='a',end_point_id='m'))
        source['constructions'].insert(0,dict(id='another-median',kind='median',vertex_point_id='a',midpoint_point_id='m',output_segment_id='s2'))
        self.assert_roundtrip(source)
        source['segments'][1].update(start_point_id='m',end_point_id='v')
        source['constructions'][0].update(vertex_point_id='m',midpoint_point_id='v')
        self.assert_roundtrip(source)

    def test_chains_order_independence_and_cycle(self):
        source=self.source();source['points'][-1]['label']=None
        source['constructions'].append(dict(id='midpoint-owner',kind='midpoint',source_point_ids=['a','c'],output_point_id='m'))
        source['points'].append(dict(id='n',x=55,y=20,label=None))
        source['constructions'].insert(0,dict(id='consumer',kind='midpoint',source_point_ids=['m','c'],output_point_id='n'))
        self.assert_roundtrip(source)
        source['constructions'].reverse();self.assert_roundtrip(source)
        bad=copy.deepcopy(source);bad['constructions'].append(dict(id='owner-conflict',kind='midpoint',source_point_ids=['v','c'],output_point_id='m'))
        with self.assertRaises(ValidationError):GeometrySourceDataV1.model_validate(bad)
        bad=copy.deepcopy(source);next(c for c in bad['constructions'] if c['id']=='midpoint-owner')['source_point_ids']=['n','c']
        with self.assertRaises(ValidationError):GeometrySourceDataV1.model_validate(bad)

    def test_segment_consumer_before_median(self):
        source=self.source()
        v,m,c=[SimpleNamespace(**source['points'][i]) for i in (1,3,2)]
        x,y=linear_support_coordinates(v,m,c,'perpendicular')
        source['points'].append(dict(id='support',x=x,y=y,label=None))
        source['lines']=[dict(id='perpendicular-line',kind='line',start_point_id='c',end_point_id='support')]
        source['constructions'].insert(0,dict(id='consumer',kind='perpendicular',source=dict(kind='segment',id='median-segment'),through_point_id='c',output_line_id='perpendicular-line',support_point_id='support'))
        self.assert_roundtrip(source)
        source['constructions'].reverse();self.assert_roundtrip(source)

    def test_upstream_midpoint_collapse_and_stale_output(self):
        source=self.source();source['points'][-1]['label']=None
        source['constructions'].append(dict(id='midpoint-owner',kind='midpoint',source_point_ids=['a','c'],output_point_id='m'))
        source['points'][0].update(x=0,y=80);source['points'][-1].update(x=35,y=50)
        with self.assertRaises(ValidationError):GeometrySourceDataV1.model_validate(source)
        source=self.source();source['constructions'].append(dict(id='midpoint-owner',kind='midpoint',source_point_ids=['a','c'],output_point_id='m'));source['points'][-1]['x']=41
        with self.assertRaises(ValidationError):GeometrySourceDataV1.model_validate(source)

    def test_legacy(self):
        source=self.source();source.pop('constructions');source['segments']=[]
        self.assert_roundtrip(source)


if __name__=='__main__':unittest.main()
