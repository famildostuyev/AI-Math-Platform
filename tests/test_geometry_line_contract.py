import copy
import sys
import unittest
from pathlib import Path
from pydantic import ValidationError

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from app.schemas.question_editor import GeometrySourceDataV1


def line_fixture():
    return dict(schema_version=1, description='All line families', viewport=dict(min_x=0, min_y=0, width=100, height=100),
                points=[dict(id=id, x=x, y=y, label=id.upper()) for id, x, y in [('a', 10, 10), ('b', 60, 20), ('c', 30, 70)]],
                segments=[dict(id='s', start_point_id='a', end_point_id='b')],
                polygons=[dict(id='p', point_ids=['a', 'b', 'c'])], texts=[],
                lines=[dict(id=kind, kind=kind, start_point_id='a', end_point_id='b') for kind in ['line', 'directed_line', 'vector']],
                polylines=[dict(id='open', point_ids=['b', 'c', 'a'])])


class GeometryLineContractTest(unittest.TestCase):
    def test_semantic_round_trip(self):
        value = line_fixture()
        parsed = GeometrySourceDataV1.model_validate(value)
        self.assertEqual(GeometrySourceDataV1.model_validate_json(parsed.model_dump_json()).model_dump(), value)

    def test_legacy_defaults(self):
        value = line_fixture()
        del value['lines'], value['polylines']
        parsed = GeometrySourceDataV1.model_validate(value)
        self.assertEqual(parsed.lines, [])
        self.assertEqual(parsed.polylines, [])

    def test_invalid_graph_and_transient_fields_rejected(self):
        mutations = [
            lambda g: g['lines'][0].update(kind='ray'),
            lambda g: g['lines'][0].update(preview=True),
            lambda g: g['lines'][0].update(end_point_id='missing'),
            lambda g: g['lines'][0].update(end_point_id='a'),
            lambda g: g['lines'][0].update(id='a'),
            lambda g: g['points'][1].update(x=10, y=10),
            lambda g: g['polylines'][0].update(closed=True),
            lambda g: g['polylines'][0].update(point_ids=['a']),
            lambda g: g['polylines'][0].update(point_ids=['a', 'b', 'a']),
            lambda g: g['polylines'][0].update(point_ids=['a', 'missing']),
            lambda g: g.update(preview={}),
        ]
        for mutate in mutations:
            value = copy.deepcopy(line_fixture()); mutate(value)
            with self.subTest(value=value), self.assertRaises(ValidationError):
                GeometrySourceDataV1.model_validate(value)
