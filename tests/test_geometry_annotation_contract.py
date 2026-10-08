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

if __name__=='__main__':
    if '--fixture' in sys.argv: print(json.dumps({'input':fixture(),'canonical':GeometrySourceDataV1.model_validate(fixture()).model_dump(mode='json')}))
    else:unittest.main()
