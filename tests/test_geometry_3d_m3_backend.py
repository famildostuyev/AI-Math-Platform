import copy
import json
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from pydantic import ValidationError
from app.schemas.question_editor import GeometryBlockCreate, GeometryBlockUpdate, GeometryBlockRead
from tests.test_geometry_v1_contract import NOW, geometry_v1

SCENE = json.loads((Path(__file__).parent / 'geometry_3d_m3_canonical.json').read_text(encoding='utf-8'))

class Geometry3DM3BackendTest(unittest.TestCase):
    def test_authored_primitives_roundtrip_and_v1_coexistence(self):
        for source in (geometry_v1(), SCENE):
            create = GeometryBlockCreate.model_validate(dict(block_type='geometry', payload=dict(source_data=source), expected_revision_updated_at=NOW))
            canonical = create.payload.source_data.model_dump(mode='json')
            self.assertEqual(canonical, source)
            update = GeometryBlockUpdate.model_validate(dict(source_data=canonical, expected_revision_updated_at=NOW))
            self.assertEqual(update.source_data.model_dump(mode='json'), source)
            read = GeometryBlockRead.model_validate(dict(id='00000000-0000-0000-0000-000000000001',block_type='geometry',sort_order=0,payload=dict(source_data=source,format_version=1)))
            self.assertEqual(read.payload.source_data, source)

    def test_degenerate_nonfinite_duplicate_reference_and_cycle_rejected(self):
        cases = []
        bad = copy.deepcopy(SCENE); bad['points'][0]['position'] = [float('nan'),0,0]; cases.append(bad)
        bad = copy.deepcopy(SCENE); bad['planes'][0]['point_ids'] = ['a','b','d']; cases.append(bad)
        bad = copy.deepcopy(SCENE); bad['linear_objects'][0]['b'] = 'a'; cases.append(bad)
        bad = copy.deepcopy(SCENE); bad['linear_objects'][0]['a'] = 'missing'; cases.append(bad)
        bad = copy.deepcopy(SCENE); bad['linear_objects'][0]['a'] = 'd'; cases.append(bad)
        bad = copy.deepcopy(SCENE); bad['points'][1]['id'] = 'a'; cases.append(bad)
        for source in cases:
            with self.assertRaises(ValidationError):
                GeometryBlockUpdate.model_validate(dict(source_data=source,expected_revision_updated_at=NOW))

if __name__ == '__main__': unittest.main()
