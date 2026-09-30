import copy
import sys
import unittest
from pathlib import Path
from pydantic import ValidationError
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
from app.schemas.question_editor import GeometrySourceDataV1


class GeometryLinearConstructionContractTest(unittest.TestCase):
    def source(self):
        return dict(schema_version=1,description='F2',viewport=dict(min_x=0,min_y=0,width=100,height=100),
          points=[dict(id=id,x=x,y=y,label=None) for id,x,y in [('a',0,0),('b',10,0),('c',0,10),('m',5,0),('q',6,0),('r',0,11)]],
          segments=[dict(id='s',start_point_id='a',end_point_id='b')],polygons=[],texts=[],
          lines=[dict(id='l1',kind='line',start_point_id='m',end_point_id='q'),dict(id='l2',kind='line',start_point_id='c',end_point_id='r')],
          constructions=[dict(id='c2',kind='perpendicular',source=dict(kind='line',id='l1'),through_point_id='c',output_line_id='l2',support_point_id='r'),
          dict(id='c1',kind='parallel',source=dict(kind='segment',id='s'),through_point_id='m',output_line_id='l1',support_point_id='q'),
          dict(id='c0',kind='midpoint',source_point_ids=['a','b'],output_point_id='m')])

    def test_types_and_reverse_order_roundtrip(self):
        for kind in ['segment','line','directed_line','vector']:
            g=self.source()
            if kind!='segment':g['lines'].append(dict(**g['segments'].pop(),kind=kind))
            g['constructions'][1]['source']['kind']=kind
            self.assertEqual(GeometrySourceDataV1.model_validate(g).model_dump(),g)

    def test_rejections(self):
        patches=[dict(kind='intersection'),dict(source={'kind':'circle','id':'s'}),dict(source={'kind':'line','id':'s'}),dict(source={'kind':'segment','id':'missing'}),dict(source={'kind':'segment','id':'s','extra':1}),dict(through_point_id='missing'),dict(output_line_id='missing'),dict(support_point_id='missing'),dict(source={'kind':'line','id':'l1'}),dict(source={'kind':'line','id':'l2'}),dict(extra=1)]
        for patch in patches:
            g=self.source();g['constructions'][1].update(patch)
            with self.subTest(patch=patch),self.assertRaises(ValidationError):GeometrySourceDataV1.model_validate(g)
        for key in ['source','through_point_id','output_line_id','support_point_id']:
            g=self.source();del g['constructions'][1][key]
            with self.assertRaises(ValidationError):GeometrySourceDataV1.model_validate(g)
        for index,value in [(1,0),(4,9),(4,float('nan')),(4,float('inf'))]:
            g=self.source();g['points'][index]['x']=value
            with self.assertRaises(ValidationError):GeometrySourceDataV1.model_validate(g)
        g=self.source();duplicate=copy.deepcopy(g['constructions'][1]);duplicate['id']='duplicate';g['constructions'].append(duplicate)
        with self.assertRaises(ValidationError):GeometrySourceDataV1.model_validate(g)
        g=self.source();g['constructions'][0].update(kind='perpendicular',output_line_id='l1',support_point_id='q',through_point_id='m',source=dict(kind='segment',id='s'))
        with self.assertRaises(ValidationError):GeometrySourceDataV1.model_validate(g)
