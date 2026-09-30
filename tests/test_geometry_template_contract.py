import sys
import unittest
from pathlib import Path
from pydantic import ValidationError

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from app.schemas.question_editor import GeometryPolygonV1, REGULAR_POLYGON_LIMITS


class GeometryTemplateContractTest(unittest.TestCase):
    def test_triangle_identity_round_trip(self):
        for kind in ['triangle', 'right_triangle', 'rectangle', 'square', 'parallelogram', 'rhombus', 'trapezoid']:
            vertices = ['a', 'b', 'c'] if kind in ['triangle', 'right_triangle'] else ['a', 'b', 'c', 'd']
            value = dict(id='figure', point_ids=vertices, template=dict(kind=kind))
            self.assertEqual(GeometryPolygonV1.model_validate(value).model_dump(), value)

    def test_legacy_omits_metadata(self):
        value = dict(id='p', point_ids=['a', 'b', 'c'])
        self.assertEqual(GeometryPolygonV1.model_validate(value).model_dump(), value)

    def test_malformed_metadata_rejected(self):
        for metadata in [None, {}, {'kind': 'square'}, {'kind': 'regular_polygon', 'n': 4}, {'kind': 'triangle', 'n': 3}, {'kind': 'triangle', 'preview': True}]:
            with self.subTest(metadata=metadata), self.assertRaises(ValidationError):
                GeometryPolygonV1.model_validate(dict(id='p', point_ids=['a', 'b', 'c'], template=metadata))
        for kind in ['triangle', 'right_triangle']:
            with self.subTest(kind=kind), self.assertRaises(ValidationError):
                GeometryPolygonV1.model_validate(dict(id='p', point_ids=['a', 'b', 'c', 'd'], template=dict(kind=kind)))
        for kind in ['rectangle', 'square', 'parallelogram', 'rhombus', 'trapezoid']:
            for vertices in [['a', 'b', 'c'], ['a', 'b', 'c', 'd', 'e']]:
                with self.subTest(kind=kind), self.assertRaises(ValidationError):
                    GeometryPolygonV1.model_validate(dict(id='p', point_ids=vertices, template=dict(kind=kind)))

    def test_regular_metadata(self):
        for n in [3, 5, 6, 7, REGULAR_POLYGON_LIMITS['maxSides']]:
            value = dict(id='p', point_ids=[f'p{i}' for i in range(n)], template=dict(kind='regular_polygon', n=n))
            self.assertEqual(GeometryPolygonV1.model_validate(value).model_dump(), value)
        for metadata in [dict(kind='regular_polygon'), dict(kind='regular_polygon', n=3, extra=1), *[dict(kind='regular_polygon', n=n) for n in [None, True, '3', 2, 3.0, 4.5, float('nan'), float('inf'), REGULAR_POLYGON_LIMITS['maxSides'] + 1, 6]]]:
            with self.subTest(metadata=metadata), self.assertRaises(ValidationError):
                GeometryPolygonV1.model_validate(dict(id='p', point_ids=['a', 'b', 'c'], template=metadata))
