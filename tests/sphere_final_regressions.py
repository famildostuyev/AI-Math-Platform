"""Run existing sphere integration regressions without installing or changing application files."""
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
out = Path(tempfile.mkdtemp(prefix='sphere-final-regressions-'))
env = dict(os.environ, PYTHONPATH=str(ROOT / 'backend') + os.pathsep + str(ROOT))
results = []


def run(name, command):
    result = subprocess.run(command, cwd=ROOT, env=env, capture_output=True, text=True, encoding='utf-8', errors='replace')
    output = result.stdout + result.stderr
    (out / (name + '.log')).write_text(output, encoding='utf-8')
    row = dict(name=name, exit_code=result.returncode, result='PASS' if result.returncode == 0 else 'FAIL')
    match = re.search(r'Ran (\d+) tests?', output)
    if match:
        row['unittest_count'] = int(match[1])
    match = re.search(r'(?:ℹ tests |# tests )(\d+)', output)
    if match:
        row['node_test_count'] = int(match[1])
    results.append(row)
    (out / 'results.json').write_text(json.dumps(results, indent=2), encoding='utf-8')
    print(row['result'] + ': ' + name, flush=True)
    if result.returncode:
        print(output[-5000:], flush=True)


print('Artifacts: ' + str(out), flush=True)
frontend = sorted((ROOT / 'tests').glob('test_geometry_3d*.mjs'))
frontend += [ROOT / 'tests' / name for name in ('test_geometry_history_model.mjs', 'test_geometry_unified_menu.mjs', 'test_printable_revision_snapshot.mjs', 'test_printable_document.mjs', 'test_saved_revision_pdf.mjs')]
for path in frontend:
    run(path.stem, ['node', str(path)])
backend = sorted((ROOT / 'tests').glob('test_geometry_3d*.py'))
run('backend_geometry_parity', [sys.executable, '-B', '-m', 'unittest', *['tests.' + path.stem for path in backend]])
for project in ('app', 'node'):
    run('typescript_' + project, ['node', 'frontend/node_modules/typescript/bin/tsc', '-p', 'frontend/tsconfig.' + project + '.json', '--noEmit'])
summary = dict(frontend_suite_count=len(frontend), backend_module_count=len(backend), unittest_count=sum(r.get('unittest_count', 0) for r in results), node_test_count=sum(r.get('node_test_count', 0) for r in results), failures=[r['name'] for r in results if r['exit_code']], artifacts=str(out))
(out / 'summary.json').write_text(json.dumps(summary, indent=2), encoding='utf-8')
print(json.dumps(summary), flush=True)
sys.exit(bool(summary['failures']))
