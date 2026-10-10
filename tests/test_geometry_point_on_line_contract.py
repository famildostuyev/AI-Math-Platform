import copy
import json
import sys
import unittest
from pathlib import Path
from pydantic import ValidationError

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from app.schemas.question_editor import GeometrySourceDataV1


def fixture(t=1.5, kind='line'):
    return dict(schema_version=1, viewport=dict(min_x=0,min_y=0,width=100,height=100), description='Infinite line constraint',
        points=[dict(id=id,x=x,y=y,label=id.upper()) for id,x,y in [('a',10,20),('b',30,20),('c',20,60),('d',10+20*t,20)]],
        segments=[dict(id='cd',start_point_id='c',end_point_id='d')], polygons=[], texts=[],
        lines=[dict(id='ab',kind=kind,start_point_id='a',end_point_id='b')],
        constructions=[dict(id='constraint',kind='point_on_line',parent=dict(kind='line',line_id='ab'),t=t,output_point_id='d')])


class PointOnLineContract(unittest.TestCase):
    def test_unbounded_roundtrip(self):
        for kind in ['line','directed_line']:
            for t in [-.5,0,.5,1,1.5]:
                g=fixture(t,kind); before=copy.deepcopy(g)
                canonical=GeometrySourceDataV1.model_validate(g).model_dump(mode='json')
                self.assertEqual(GeometrySourceDataV1.model_validate(canonical).model_dump(mode='json'),canonical)
                self.assertEqual(g,before)

    def test_bad_parameters(self):
        for t in [True,False,'1.5',None,float('inf'),float('nan'),1e309]:
            g=fixture();g['constructions'][0]['t']=t
            with self.subTest(t=t),self.assertRaises(ValidationError):GeometrySourceDataV1.model_validate(g)

    def test_invalid_references_and_geometry(self):
        mutations=[lambda g:g['lines'][0].update(kind='vector'),
            lambda g:g['constructions'][0]['parent'].update(line_id='missing'),
            lambda g:g['constructions'][0]['parent'].update(extra=1),
            lambda g:g['constructions'][0].update(output_point_id='a'),
            lambda g:g['points'][1].update(x=10),
            lambda g:g['points'][3].update(y=21),
            lambda g:g['constructions'].append(copy.deepcopy(g['constructions'][0])),
            lambda g:g['lines'][0].update(end_point_id='d'),
            lambda g:g['points'][0].update(x=-1e308),
            lambda g:g['constructions'][0].update(t=1e308)]
        for mutate in mutations:
            g=fixture();mutate(g)
            with self.assertRaises(ValidationError):GeometrySourceDataV1.model_validate(g)

    def test_constructed_parent_and_downstream_order(self):
        g=fixture();g['points'].extend([dict(id='support',x=21,y=60,label=None),dict(id='e',x=22,y=60,label=None),dict(id='m',x=21,y=60,label=None)])
        g['lines'].append(dict(id='parallel',kind='line',start_point_id='c',end_point_id='support'))
        g['constructions']=[dict(id='consumer',kind='midpoint',source_point_ids=['c','e'],output_point_id='m'),
            dict(id='on-constructed',kind='point_on_line',parent=dict(kind='line',line_id='parallel'),t=2,output_point_id='e'),
            dict(id='producer',kind='parallel',source=dict(kind='line',id='ab'),through_point_id='c',output_line_id='parallel',support_point_id='support'),*g['constructions']]
        GeometrySourceDataV1.model_validate(g)
        g['constructions'][2]['through_point_id']='e';g['lines'][1]['start_point_id']='e'
        with self.assertRaises(ValidationError):GeometrySourceDataV1.model_validate(g)


if __name__=='__main__':
    if '--fixture' in sys.argv:
        g=fixture();print(json.dumps(dict(input=g,canonical=GeometrySourceDataV1.model_validate(g).model_dump(mode='json'))))
    else:unittest.main()
