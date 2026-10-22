import copy
import json
import math
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from app.schemas.geometry_3d import normalize_scene_3d
from app.schemas import geometry_3d_analytic as g

ROOT = Path(__file__).resolve().parents[1]


class AnalyticParityTest(unittest.TestCase):
    def compare(self, actual, expected, tolerance, path='result'):
        if isinstance(expected, dict):
            self.assertEqual(set(actual), set(expected), path)
            for key in expected:
                self.compare(actual[key], expected[key], tolerance, path+'.'+key)
        elif isinstance(expected, list):
            self.assertEqual(len(actual), len(expected), path)
            for i, value in enumerate(expected):
                self.compare(actual[i], value, tolerance, path+f'[{i}]')
        elif type(expected) in (float, int):
            self.assertTrue(math.isfinite(actual), path)
            self.assertLessEqual(abs(actual-expected), tolerance+64*sys.float_info.epsilon*abs(expected), path)
        else:
            self.assertEqual(actual, expected, path)

    def test_frontend_backend_calculation_and_canonical_parity(self):
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp) / 'analytic.json'
            subprocess.run(['node', 'tests/test_geometry_3d_analytic.mjs', str(output)], cwd=ROOT, check=True)
            records = json.loads(output.read_text(encoding='utf-8'))
        self.assertEqual(len(records), 695)
        for record in records:
            op, data = record['op'], record['input']
            snapshot = copy.deepcopy(data)
            if op == 'evaluate':
                result = g.evaluate_analytic_surface(data['solid'], data['uv'])
            elif op == 'inverse':
                result = g.inverse_analytic_surface(data['solid'], data['world'], data['hint'])
            elif op == 'bounds':
                result = g.analytic_bounds(data['solid'])
            elif op == 'features':
                result = g.analytic_feature_positions(data['solid'])
            elif op == 'wrap':
                result = g.wrap_surface_azimuth(data['u'])
            elif op == 'pointer':
                result = g.analytic_pointer_ray(data['camera'], data['width'], data['height'], data['x'], data['y'])
            elif op == 'ray':
                result = g.intersect_analytic_surface(data['solid'], data['ray'])
            elif op == 'scene':
                result = normalize_scene_3d(data['scene'])
                self.assertEqual(result, record['result'], 'exact canonical V2 parity')
            elif op == 'frame':
                frame = g.AnalyticFrame(data['frame'])
                result = dict(world=frame.to_world(data['local']), local=frame.to_local(data['world']), vector=frame.vector_to_local(frame.vector_to_world(data['local'])))
            else:
                self.fail(op)
            # Trigonometry is compared numerically; far-origin rays include their
            # input conditioning error budget. Persisted scene normalization is exact.
            magnitude = max(map(abs, data['ray']['origin'])) if op == 'ray' else 1
            self.compare(result, record['result'], max(1e-10, 128*sys.float_info.epsilon*magnitude), op)
            self.assertEqual(data, snapshot, 'immutable analytic inputs')

    def test_strict_domains_and_numerical_safety(self):
        frame = dict(origin=[0, 0, 0], x_axis=[1, 0, 0], y_axis=[0, 1, 0])
        for kind in ('cylinder', 'cone', 'sphere'):
            solid = dict(id='solid', mode='parametric', kind=kind, frame=frame, parameters=dict(radius=2, **({} if kind == 'sphere' else dict(height=4))), features=[])
            for uv in ([1, .5], [-.1, .5], [.2, -1], [.2, 2], [True, 0], [float('nan'), 0], [0, float('inf')]):
                with self.assertRaises(ValueError):
                    g.evaluate_analytic_surface(solid, uv)
            self.assertIsNone(g.inverse_analytic_surface(solid, [30, 0, 2]))
            with self.assertRaises(ValueError):
                g.intersect_analytic_surface(solid, dict(origin=[0, 0, 0], direction=[0, 0, 0]))
            for radius in (0, -1, True, float('inf'), float('nan')):
                bad = copy.deepcopy(solid)
                bad['parameters']['radius'] = radius
                with self.assertRaises(ValueError):
                    g.evaluate_analytic_surface(bad, [0, .5])
            for features in ([dict(slot='v_4', entity_id='bad')], [dict(slot='surface', entity_id='a'), dict(slot='surface', entity_id='b')]):
                with self.assertRaises(ValueError):
                    g.analytic_feature_positions(dict(solid, features=features))
        with self.assertRaises(ValueError):
            g.AnalyticFrame(dict(frame, x_axis=[2, 0, 0]))


if __name__ == '__main__':
    unittest.main()
