"""Shared persisted-state fixtures for backend and runtime frontend parity."""
import copy
import json
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from pydantic import ValidationError
from app.schemas.question_editor import GeometrySourceDataV1
from tests.test_geometry_v1_contract import geometry_v1, update

CASES = json.loads(Path(__file__).with_name('geometry_v1_parity_cases.json').read_text(encoding='utf-8'))


def fixture(case):
    data = geometry_v1()
    # Keep references deterministic when ID boundary cases rename the first point.
    data['points'] = [dict(id=id, x=i, y=i * i, label=None) for i, id in enumerate(('a', 'b', 'c'))]
    data['segments'] = [dict(id='s', start_point_id='a', end_point_id='b')]
    data['polygons'] = [dict(id='p', point_ids=['a', 'b', 'c'])]
    data['texts'] = [dict(id='t', x=0, y=0, content='Text')]
    if case.get('emptyCollections'):
        for name in ('points', 'segments', 'polygons', 'texts'):
            del data[name]
    elif 'numeric' in case:
        # The same raw numeric input exercises every non-strict base float model.
        data['points'][0]['x'] = case['numeric']
        data['texts'][0]['x'] = case['numeric']
        data['viewport']['min_x'] = case['numeric']
    elif 'collection' in case:
        name = case['collection']
        seed = data[name][0]
        if name == 'points':
            data[name] += [dict(id=f'point_{i}', x=i, y=0, label=None) for i in range(case['count'] - 3)]
        else:
            data[name] = [dict(copy.deepcopy(seed), id=f'{name}_{i}') for i in range(case['count'])]
    else:
        parts = case['path'].split('.')
        target = data
        for part in parts[:-1]:
            target = target[int(part)] if isinstance(target, list) else target[part]
        if case.get('omit'):
            del target[parts[-1]]
        else:
            value = case['repeat'] * case['length'] if 'repeat' in case else case['value']
            target[parts[-1]] = value
            if case['path'] == 'points.0.id':
                data['segments'][0]['start_point_id'] = value
                data['polygons'][0]['point_ids'][0] = value
    return data


def evaluated_cases():
    results = []
    for case in CASES:
        data = fixture(case)
        try:
            canonical = update(data).source_data.model_dump(mode='json')
        except ValidationError:
            canonical = None
        if (canonical is not None) != case['valid']:
            raise AssertionError(case['name'])
        results.append(dict(name=case['name'], data=data, canonical=canonical))
    return results


class GeometryV1NormalizationParityTest(unittest.TestCase):
    def test_shared_boundaries(self):
        for case in CASES:
            with self.subTest(case=case['name']):
                data = fixture(case)
                if case['valid']:
                    update(data)
                else:
                    with self.assertRaises(ValidationError):
                        update(data)

    def test_nonfinite_base_fields(self):
        for value in (float('nan'), float('inf'), -float('inf')):
            for collection in ('points', 'texts'):
                with self.subTest(value=value, collection=collection):
                    data = fixture(CASES[0])
                    data[collection][0]['x'] = value
                    with self.assertRaises(ValidationError):
                        update(data)

    def test_distinct_coincident_segment_points_remain_valid(self):
        data = geometry_v1()
        data['points'][1].update(x=data['points'][0]['x'], y=data['points'][0]['y'])
        GeometrySourceDataV1.model_validate(data)


if __name__ == '__main__':
    if '--fixtures' in sys.argv:
        print(json.dumps(evaluated_cases(), ensure_ascii=True))
    else:
        unittest.main()
