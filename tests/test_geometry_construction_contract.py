import sys
import unittest
from pathlib import Path
from pydantic import ValidationError
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from app.schemas.question_editor import GeometrySourceDataV1
from app.schemas.geometry_constructions import LIMITS


class GeometryConstructionContractTest(unittest.TestCase):
    def source(self):
        return dict(schema_version=1,viewport=dict(min_x=0,min_y=0,width=100,height=100),description='Midpoint',
                    points=[dict(id=id,x=x,y=y,label=None) for id,x,y in [('a',0,0),('b',20,10),('c',40,30),('m',10,5),('n',25,17.5)]],
                    segments=[],polygons=[],texts=[],constructions=[
                        dict(id='second',kind='midpoint',source_point_ids=['m','c'],output_point_id='n'),
                        dict(id='first',kind='midpoint',source_point_ids=['a','b'],output_point_id='m')])

    def test_chain_roundtrip_and_legacy(self):
        source=self.source()
        self.assertEqual(GeometrySourceDataV1.model_validate(source).model_dump(),source)
        del source['constructions']
        self.assertEqual(GeometrySourceDataV1.model_validate(source).model_dump(),source)

    def test_strict_recipe_graph(self):
        patches=[dict(kind='parallel'),dict(id='a'),dict(id='first'),dict(id='1bad'),dict(source_point_ids=['a']),dict(source_point_ids=['a','a']),dict(source_point_ids=['unknown','b']),dict(source_point_ids=['a','b','c']),dict(output_point_id='unknown'),dict(output_point_id='m'),dict(extra=True),dict(source_point_ids=['n','b'])]
        for patch in patches:
            source=self.source();source['constructions'][0].update(patch)
            with self.subTest(patch=patch),self.assertRaises(ValidationError):GeometrySourceDataV1.model_validate(source)
        for key in ['source_point_ids','output_point_id']:
            source=self.source();del source['constructions'][0][key]
            with self.assertRaises(ValidationError):GeometrySourceDataV1.model_validate(source)
        source=self.source();source['constructions'][0]['source_point_ids']=['b','a']
        with self.assertRaises(ValidationError):GeometrySourceDataV1.model_validate(source)
        source=self.source();source['constructions'][0]['output_point_id']='a'
        with self.assertRaises(ValidationError):GeometrySourceDataV1.model_validate(source)
        source=self.source();source['constructions'][0].update(source_point_ids=['a','c'],output_point_id='m')
        with self.assertRaises(ValidationError):GeometrySourceDataV1.model_validate(source)

    def test_coordinates(self):
        for value in [10+2*LIMITS['coordinateTolerance'],float('nan'),float('inf')]:
            source=self.source();source['points'][3]['x']=value
            with self.subTest(value=value),self.assertRaises(ValidationError):GeometrySourceDataV1.model_validate(source)
        source=self.source();source['points'][3]['x']+=LIMITS['coordinateTolerance']/2
        GeometrySourceDataV1.model_validate(source)
