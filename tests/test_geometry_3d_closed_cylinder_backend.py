import copy
import json
import math
from pathlib import Path
import subprocess
import tempfile
import unittest

from app.schemas import geometry_3d_analytic as g
from tests import test_geometry_3d_analytic_backend as parity

ROOT = Path(__file__).resolve().parents[1]


class ClosedCylinderTest(unittest.TestCase):
    def test_shared_cases_and_frontend_backend_parity(self):
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp) / 'closed-cylinder.json'
            subprocess.run(['node', 'tests/test_geometry_3d_closed_cylinder.mjs', str(output)], cwd=ROOT, check=True)
            records = json.loads(output.read_text(encoding='utf-8'))
        self.assertEqual(len(records), 225)
        for record in records:
            before = copy.deepcopy(record)
            actual = g.intersect_closed_cylinder(record['solid'], record['ray'])
            parity.AnalyticParityTest().compare(actual, record['hits'], 1e-8)
            self.assertEqual(record, before)
            self.assertEqual(actual, g.intersect_closed_cylinder(record['solid'], record['ray']))

    def test_strict_validation(self):
        solid = dict(id='cylinder', kind='cylinder', mode='parametric', frame=dict(origin=[0, 0, 0], x_axis=[1, 0, 0], y_axis=[0, 1, 0]), parameters=dict(radius=2, height=4), features=[])
        ray = dict(origin=[0, 0, -2], direction=[0, 0, 1])
        for kind in ('cone', 'sphere'):
            with self.assertRaises(ValueError):
                g.intersect_closed_cylinder(dict(solid, kind=kind), ray)
        for key in ('radius', 'height'):
            for value in (0, -1, True, float('nan'), float('inf')):
                with self.assertRaises(ValueError):
                    g.intersect_closed_cylinder(dict(solid, parameters=dict(solid['parameters'], **{key: value})), ray)
        for bad_ray in (dict(ray, direction=[0, 0, 0]), dict(ray, origin=[True, 0, 0]), dict(ray, direction=[0, 0, math.inf]), dict(ray, clip=dict(origin=[0, 0, -2], forward=[0, 0, 2], near=.1, far=10))):
            with self.assertRaises(ValueError):
                g.intersect_closed_cylinder(solid, bad_ray)
        with self.assertRaises(ValueError):
            g.intersect_closed_cylinder(dict(solid, frame=dict(solid['frame'], x_axis=[2, 0, 0])), ray)


if __name__ == '__main__':
    unittest.main()
