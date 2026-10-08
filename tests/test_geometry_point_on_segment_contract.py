import copy
import json
import sys
import unittest
from pathlib import Path
from pydantic import ValidationError
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from app.schemas.question_editor import GeometrySourceDataV1

def fixture():
    return dict(schema_version=1, viewport=dict(min_x=0,min_y=0,width=100,height=100), description='Constrained points',
        points=[dict(id=id,x=x,y=y,label=id.upper()) for id,x,y in [('a',0,0),('b',20,0),('c',10,20),('d',5,0)]],
        segments=[dict(id='ab',start_point_id='a',end_point_id='b'),dict(id='cd',start_point_id='c',end_point_id='d')],
        polygons=[dict(id='triangle',point_ids=['a','b','c'])],texts=[],
        constructions=[dict(id='constraint',kind='point_on_segment',parent=dict(kind='segment',segment_id='ab'),t=.25,output_point_id='d')])

class PointOnSegmentContract(unittest.TestCase):
    def test_roundtrip_legacy_and_immutability(self):
        g=fixture();before=copy.deepcopy(g)
        canonical=GeometrySourceDataV1.model_validate(g).model_dump(mode='json')
        self.assertEqual(GeometrySourceDataV1.model_validate(canonical).model_dump(mode='json'),canonical)
        self.assertEqual(g,before)
        g['constructions']=[]
        GeometrySourceDataV1.model_validate(g)

    def test_polygon_edge_and_reversal(self):
        for a,b,t in [('a','b',.25),('b','a',.75)]:
            g=fixture();g['constructions'][0].update(parent=dict(kind='polygon_edge',polygon_id='triangle',start_point_id=a,end_point_id=b),t=t)
            GeometrySourceDataV1.model_validate(g)
            g['polygons'][0]['point_ids'].reverse()
            GeometrySourceDataV1.model_validate(g)

    def test_bad_parameters(self):
        for t in [-1,1.01,float('inf'),float('nan'),True,'0.25',None]:
            g=fixture();g['constructions'][0]['t']=t
            with self.subTest(t=t),self.assertRaises(ValidationError):GeometrySourceDataV1.model_validate(g)

    def test_bad_references_and_coordinates(self):
        for mutate in [lambda g:g['constructions'][0]['parent'].update(segment_id='missing'),
                       lambda g:g['constructions'][0].update(output_point_id='a'),
                       lambda g:g['points'][3].update(x=6),
                       lambda g:g['points'][1].update(x=0),
                       lambda g:g['points'][0].update(x=float('inf')),
                       lambda g:g['constructions'].append(copy.deepcopy(g['constructions'][0]))]:
            g=fixture();mutate(g)
            with self.assertRaises(ValidationError):GeometrySourceDataV1.model_validate(g)

    def test_nonadjacent_and_missing_polygon(self):
        g=fixture();g['points'].append(dict(id='e',x=0,y=20,label=None));g['polygons'][0]['point_ids']=['a','b','c','e']
        g['constructions'][0]['parent']=dict(kind='polygon_edge',polygon_id='triangle',start_point_id='a',end_point_id='c')
        with self.assertRaises(ValidationError):GeometrySourceDataV1.model_validate(g)
        g['constructions'][0]['parent']['polygon_id']='missing'
        with self.assertRaises(ValidationError):GeometrySourceDataV1.model_validate(g)

    def test_dependency_order_and_cycle(self):
        g=fixture();g['points'].append(dict(id='m',x=7.5,y=10,label=None))
        g['constructions'].insert(0,dict(id='consumer',kind='midpoint',source_point_ids=['c','d'],output_point_id='m'))
        GeometrySourceDataV1.model_validate(g)
        g['constructions'][1]['parent']['segment_id']='cd'
        with self.assertRaises(ValidationError):GeometrySourceDataV1.model_validate(g)

    def test_multiple_and_endpoint_coincidence(self):
        g=fixture();g['points'].append(dict(id='e',x=0,y=0,label=None))
        g['constructions'].append(dict(id='other',kind='point_on_segment',parent=dict(kind='segment',segment_id='ab'),t=0,output_point_id='e'))
        GeometrySourceDataV1.model_validate(g)

    def test_indirect_cycle(self):
        g=fixture();g['points'].append(dict(id='m',x=7.5,y=10,label=None))
        g['segments'].append(dict(id='am',start_point_id='a',end_point_id='m'))
        g['constructions'][0]['parent']['segment_id']='am'
        g['constructions'].append(dict(id='consumer',kind='midpoint',source_point_ids=['c','d'],output_point_id='m'))
        with self.assertRaises(ValidationError):GeometrySourceDataV1.model_validate(g)

if __name__=='__main__':
    if '--fixture' in sys.argv:
        print(json.dumps({'input':fixture(),'canonical':GeometrySourceDataV1.model_validate(fixture()).model_dump(mode='json')}))
    else:unittest.main()
