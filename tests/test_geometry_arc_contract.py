import copy
import math
import sys
import unittest
from pathlib import Path
from pydantic import ValidationError
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
from app.schemas.question_editor import GeometrySourceDataV1, MIN_CIRCLE_RADIUS, MIN_ARC_SWEEP

class GeometryArcContractTest(unittest.TestCase):
    def source(self):
        return dict(schema_version=1,viewport=dict(min_x=0,min_y=0,width=100,height=100),description='Arc',points=[dict(id='p',x=20,y=30,label=None)],segments=[],polygons=[],texts=[])

    def test_legacy_and_roundtrip(self):
        source=self.source();self.assertEqual(GeometrySourceDataV1.model_validate(source).model_dump(),source)
        for kind in ['arc','sector']:
            source['arcs']=[dict(id='a',kind=kind,center_point_id='p',radius=20,start_angle=11*math.pi/6,sweep_angle=math.pi/3)]
            self.assertEqual(GeometrySourceDataV1.model_validate(source).model_dump(),source)

    def test_invalid(self):
        source=self.source();source['arcs']=[dict(id='a',kind='arc',center_point_id='p',radius=20,start_angle=0,sweep_angle=1)]
        patches=[dict(kind='circle'),dict(center_point_id='missing'),dict(id='p'),dict(id='1bad'),dict(extra=1)]
        patches += [dict(radius=x) for x in [0,-1,MIN_CIRCLE_RADIUS,float('nan'),float('inf'),'20',True]]
        patches += [dict(start_angle=x) for x in [-1,math.tau,float('nan'),float('inf'),'0',True]]
        patches += [dict(sweep_angle=x) for x in [0,-1,MIN_ARC_SWEEP,math.tau-MIN_ARC_SWEEP,math.tau,float('nan'),float('inf'),'1',True]]
        for patch in patches:
            bad=copy.deepcopy(source);bad['arcs'][0].update(patch)
            with self.subTest(patch=patch),self.assertRaises(ValidationError):GeometrySourceDataV1.model_validate(bad)
        del source['arcs'][0]['center_point_id']
        with self.assertRaises(ValidationError):GeometrySourceDataV1.model_validate(source)
