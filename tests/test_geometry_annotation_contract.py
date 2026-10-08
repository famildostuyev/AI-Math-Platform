import json
import sys
import unittest
from pathlib import Path
from pydantic import ValidationError
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
from app.schemas.question_editor import GeometrySourceDataV1

def fixture():
    return dict(schema_version=1,viewport=dict(min_x=0,min_y=0,width=100,height=100),description='Annotations',points=[dict(id='a',x=10,y=20,label=None)],segments=[],polygons=[],texts=[dict(id='note',x=20,y=30,content='AB = x cm',runs=[dict(type='text',text='AB = '),dict(type='inline_math',latex='x'),dict(type='text',text=' cm')],layout_width=40,scale=1.5,rotation=0.2,attachment=dict(target_kind='point',target_id='a',anchor='point',offset=dict(x=10,y=10),orientation='keep_page'))])

class AnnotationContract(unittest.TestCase):
    def test_legacy(self):
        g=fixture();g['texts']=[dict(id='legacy',x=1,y=2,content='Old text')]
        self.assertEqual(GeometrySourceDataV1.model_validate(g).model_dump(mode='json')['texts'],g['texts'])
    def test_roundtrip_and_immutability(self):
        g=fixture();before=json.dumps(g);canonical=GeometrySourceDataV1.model_validate(g).model_dump(mode='json')
        self.assertEqual(canonical,GeometrySourceDataV1.model_validate(canonical).model_dump(mode='json'))
        self.assertEqual(json.dumps(g),before)
        self.assertEqual(canonical['texts'][0]['runs'][0]['marks'],[])
    def test_invalid(self):
        for key,value in [('runs',[]),('runs',[dict(type='html',html='bad')]),('layout_width',0),('scale',-1),('rotation',float('inf')),('runs',None),('attachment',None)]:
            with self.subTest(key=key,value=value):
                g=fixture();g['texts'][0][key]=value
                with self.assertRaises(ValidationError):GeometrySourceDataV1.model_validate(g)
    def test_projection(self):
        g=fixture();g['texts'][0]['content']='Different'
        with self.assertRaises(ValidationError):GeometrySourceDataV1.model_validate(g)
    def test_missing_target_preserves_content(self):
        g=fixture();g['texts'][0]['attachment']['target_id']='missing'
        self.assertEqual(GeometrySourceDataV1.model_validate(g).texts[0].content,'AB = x cm')
    def test_invalid_anchor(self):
        g=fixture();g['texts'][0]['attachment']['anchor']='parameter'
        with self.assertRaises(ValidationError):GeometrySourceDataV1.model_validate(g)

    def test_polygon_edge_and_policy(self):
        for g in attachment_fixtures():
            canonical=GeometrySourceDataV1.model_validate(g).model_dump(mode='json')
            self.assertEqual(GeometrySourceDataV1.model_validate(canonical).model_dump(mode='json'),canonical)

    def test_invalid_edge_contract(self):
        for patch in [dict(start_point_id='a',end_point_id='a'),dict(start_point_id='a',end_point_id='c'),dict(parameter=-.1),dict(auto_upright='true'),dict(auto_upright=None),dict(start_point_id=None)]:
            g=attachment_fixtures()[0];g['texts'][0]['attachment'].update(patch)
            with self.subTest(patch=patch),self.assertRaises(ValidationError):GeometrySourceDataV1.model_validate(g)

    def test_endpoint_fields_not_allowed_on_legacy_targets(self):
        g=fixture();g['texts'][0]['attachment']['start_point_id']='a'
        with self.assertRaises(ValidationError):GeometrySourceDataV1.model_validate(g)

def attachment_fixtures():
    g=fixture()
    g['points']=[dict(id=id,x=x,y=y,label=id.upper()) for id,x,y in [('a',0,0),('b',20,0),('c',20,20),('d',0,20)]]
    g['polygons']=[dict(id='square',point_ids=['a','b','c','d'])]
    g['texts'][0]['attachment']=dict(target_kind='polygon_edge',target_id='square',start_point_id='a',end_point_id='b',anchor='parameter',parameter=.25,offset=dict(x=15,y=30),orientation='keep_page',auto_upright=False)
    import copy
    variants=[g]
    reversed=copy.deepcopy(g);reversed['texts'][0]['attachment'].update(start_point_id='b',end_point_id='a',parameter=.75,orientation='follow_target',auto_upright=True);variants.append(reversed)
    missing=copy.deepcopy(g);missing['texts'][0]['attachment']['target_id']='missing';variants.append(missing)
    return variants

if __name__=='__main__':
    if '--attachments' in sys.argv: print(json.dumps([{'input':g,'canonical':GeometrySourceDataV1.model_validate(g).model_dump(mode='json')} for g in attachment_fixtures()]))
    elif '--fixture' in sys.argv: print(json.dumps({'input':fixture(),'canonical':GeometrySourceDataV1.model_validate(fixture()).model_dump(mode='json')}))
    else:unittest.main()
