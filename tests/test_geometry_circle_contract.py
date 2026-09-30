import copy
import sys
import unittest
from pathlib import Path
from pydantic import ValidationError
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from app.schemas.question_editor import GeometrySourceDataV1, MIN_CIRCLE_RADIUS


class GeometryCircleContractTest(unittest.TestCase):
    def fixture(self):
        return dict(schema_version=1, viewport=dict(min_x=0,min_y=0,width=100,height=100),description='Circle',points=[dict(id='p',x=20,y=30,label=None)],segments=[],polygons=[],texts=[])

    def test_legacy_omission(self):
        source=self.fixture()
        self.assertEqual(GeometrySourceDataV1.model_validate(source).model_dump(), source)

    def test_circle_disk_round_trip(self):
        for kind in ['circle','disk']:
            source=self.fixture();source['circles']=[dict(id='c',center_point_id='p',radius=50,kind=kind)]
            self.assertEqual(GeometrySourceDataV1.model_validate(source).model_dump(), source)

    def test_strict_circle_graph(self):
        source=self.fixture();source['circles']=[dict(id='c',center_point_id='p',radius=50,kind='circle')]
        for patch in [dict(kind='ellipse'),dict(center_point_id='missing'),dict(id='p'),dict(id='0bad'),dict(extra=True),*[dict(radius=r) for r in [0,-1,MIN_CIRCLE_RADIUS,MIN_CIRCLE_RADIUS/2,float('nan'),float('inf'),'5',True]]]:
            bad=copy.deepcopy(source);bad['circles'][0].update(patch)
            with self.subTest(patch=patch),self.assertRaises(ValidationError):GeometrySourceDataV1.model_validate(bad)
        bad=copy.deepcopy(source);del bad['circles'][0]['center_point_id']
        with self.assertRaises(ValidationError):GeometrySourceDataV1.model_validate(bad)
        source['circles'].append(source['circles'][0])
        with self.assertRaises(ValidationError):GeometrySourceDataV1.model_validate(source)
