"""Opt-in real local HTTP/PostgreSQL acceptance of Edge-authored line geometry.

Run with --temporary-admin --source <Edge acceptance JSON>. Revokes sessions and
deactivates the dedicated account in finally; never applies a migration.
"""
import argparse
import copy
import json
import os
from pathlib import Path
import secrets
import socket
import subprocess
import sys
import time
import uuid

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'backend'))
os.environ.pop('DEBUG', None)
import httpx
from sqlalchemy import select, text
from app.core.config import settings
from app.core.security import hash_password
from app.database.session import SessionLocal, engine
from app.models.user import User
from app.models.role import Role
from app.models.user_role import UserRole
from app.models.user_session import UserSession
from app.schemas.question_editor import GeometrySourceDataV1
from app.services.session_service import revoke_session


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--temporary-admin', action='store_true', required=True)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--triangles', action='store_true', help='Minimal G2-D1 polygon metadata acceptance')
    parser.add_argument('--quadrilaterals', action='store_true', help='G2-D2 quadrilateral metadata acceptance')
    parser.add_argument('--regular', action='store_true', help='G2-D3 regular polygon metadata acceptance')
    parser.add_argument('--complete', action='store_true', help='G2-D4 complete 2D fixture with two distinct frames')
    parser.add_argument('--circles', action='store_true', help='G2-E1 circle/disk fixture with two distinct frames')
    parser.add_argument('--arcs', action='store_true', help='G2-E2 arc/sector and wrap-around fixture')
    parser.add_argument('--family', action='store_true', help='G2-E3 complete circular integration (with --arcs)')
    parser.add_argument('--midpoint', action='store_true', help='G2-F1 dependent midpoint fixture')
    parser.add_argument('--linear-constructions', action='store_true', help='G2-F2 parallel/perpendicular dependent chains')
    args = parser.parse_args()
    source = json.loads(args.source.read_text(encoding='utf-8'))
    assert sum([args.triangles, args.quadrilaterals, args.regular, args.complete, args.circles, args.arcs, args.midpoint, args.linear_constructions]) <= 1
    source_b = None
    assert not args.family or args.arcs
    acceptance = 'G2-F2' if args.linear_constructions else 'G2-F1' if args.midpoint else 'G2-E3' if args.family else 'G2-E2' if args.arcs else 'G2-E1' if args.circles else 'G2-D4' if args.complete else 'G2-D3' if args.regular else 'G2-D2' if args.quadrilaterals else 'G2-D1' if args.triangles else 'G2-C'
    if args.linear_constructions:
        source, source_b = source['a'], source['b']
        assert {c['kind'] for c in source['constructions']} == {'midpoint','parallel','perpendicular'}
        midpoint = next(c for c in source['constructions'] if c['kind']=='midpoint')
        parallel = next(c for c in source['constructions'] if c['kind']=='parallel' and c['source']['kind']=='segment' and c['through_point_id']==midpoint['output_point_id'])
        assert any(c['kind']=='perpendicular' and c['source']['id']==parallel['output_line_id'] for c in source['constructions'])
        assert source['polygons'] and source['circles'] and source_b['segments'] and source_b['circles']
        assert source_b['constructions'][0]['source']['kind']=='vector'
    elif args.midpoint:
        source, source_b = source['a'], source['b']
        assert len(source['constructions']) >= 2 and len(source_b['constructions']) == 1
        assert source['constructions'][0]['output_point_id'] in source['constructions'][1]['source_point_ids']
        assert source['polygons'] and source['circles'] and source_b['segments'] and source_b['circles']
    elif args.arcs:
        import math
        source, source_b = source['a'], source['b']
        assert [a['kind'] for a in source['arcs']] == ['arc', 'sector']
        assert source['arcs'][0]['start_angle'] + source['arcs'][0]['sweep_angle'] > math.tau
        assert {c['kind'] for c in source['circles']} == {'circle', 'disk'}
        assert source_b['arcs'][0]['kind'] == 'sector' and source_b['circles'][0]['kind'] == 'disk'
        if args.family:
            assert source['polygons'] and source['segments'] and source['lines'][0]['kind'] == 'vector'
            assert source_b['segments'] and source_b['arcs'][0]['sweep_angle'] > math.pi
    elif args.circles:
        source, source_b = source['a'], source['b']
        assert [c['kind'] for c in source['circles']] == ['circle', 'disk']
        assert source['polygons'] and source['segments']
        assert len(source_b['circles']) == 1 and source_b['circles'][0]['kind'] == 'disk'
        assert source_b['circles'][0]['radius'] != source['circles'][1]['radius']
    elif args.complete:
        source, source_b = source['a'], source['b']
        assert len(source['points']) == 51 and len(source['polygons']) == 12
        assert [p['template']['kind'] for p in source['polygons'][:7]] == ['triangle', 'right_triangle', 'rectangle', 'square', 'parallelogram', 'rhombus', 'trapezoid']
        assert [p['template'] for p in source['polygons'][7:10]] == [dict(kind='regular_polygon', n=n) for n in [5, 6, 7]]
        assert all('template' not in p for p in source['polygons'][10:])
        assert len(source_b['polygons']) == 3 and source_b != source
    elif args.regular:
        assert {p['template']['n'] for p in source['polygons']} >= {3, 5, 6, 7}
        assert all(p['template']['kind'] == 'regular_polygon' and len(p['point_ids']) == p['template']['n'] for p in source['polygons'])
    elif args.quadrilaterals:
        assert {polygon['template']['kind'] for polygon in source['polygons']} == {'rectangle', 'square', 'parallelogram', 'rhombus', 'trapezoid'}
        assert all(len(polygon['point_ids']) == 4 for polygon in source['polygons'])
    elif args.triangles:
        assert {polygon['template']['kind'] for polygon in source['polygons']} == {'triangle', 'right_triangle'}
        assert all(len(polygon['point_ids']) == 3 for polygon in source['polygons'])
    else:
        assert {line['kind'] for line in source['lines']} == {'line', 'directed_line', 'vector'}
        assert source['segments'] and source['polylines'] and source['polygons']
    GeometrySourceDataV1.model_validate(source)
    if source_b is not None:
        GeometrySourceDataV1.model_validate(source_b)
    assert settings.APP_ENV == 'development' and engine.url.host in ('localhost', '127.0.0.1')
    with engine.connect() as connection:
        assert connection.execute(text('SELECT 1')).scalar_one() == 1
        assert connection.execute(text('SELECT version_num FROM alembic_version')).scalar_one() == 'a8c0e2f4b619'
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0)); port = sock.getsockname()[1]
    server = subprocess.Popen([sys.executable, '-B', '-m', 'uvicorn', 'app.main:app', '--app-dir', str(ROOT / 'backend'),
                               '--host', '127.0.0.1', '--port', str(port), '--log-level', 'error', '--no-access-log'],
                              cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                              creationflags=subprocess.CREATE_NO_WINDOW)
    user_id = None
    client = httpx.Client(base_url=f'http://127.0.0.1:{port}', timeout=30)
    try:
        for _ in range(100):
            try:
                if client.get('/').status_code == 200: break
            except httpx.ConnectError: pass
            time.sleep(.1)
        else: raise RuntimeError('Local backend did not start')
        email, password = f'{acceptance.lower()}-{uuid.uuid4().hex}@example.test', secrets.token_urlsafe(40)
        with SessionLocal() as db:
            role = db.scalar(select(Role).where(Role.name == 'admin', Role.is_active.is_(True)))
            assert role is not None
            user = User(first_name=acceptance, last_name='Acceptance', email=email, password_hash=hash_password(password),
                        is_active=True, is_email_verified=True, last_active_role_id=role.id)
            db.add(user); db.flush(); user_id = user.id
            db.add(UserRole(user_id=user_id, role_id=role.id, is_active=True, assigned_by=None)); db.commit()
        response = client.post('/api/v1/auth/login', json={'identifier': email, 'password': password, 'device_name': acceptance + ' acceptance'})
        assert response.status_code == 200
        client.headers['Authorization'] = 'Bearer ' + response.json()['access_token']

        def api(method, path, body=None, expected=200):
            response = client.request(method, '/api/v1' + path, json=body)
            assert response.status_code == expected, f'{method} {path}: {response.status_code}: {response.text[:500]}'
            return response.json()

        types = api('GET', '/catalog/question-types')
        draft = api('POST', '/question-editor/drafts', {'question_type_id': types[0]['id']}, 201)
        revision_id = draft['revision_id']
        path = f'/question-editor/revisions/{revision_id}'
        reload = lambda: api('GET', path)
        layout = {'version': 1, 'layoutMode': 'floating', 'anchor': {'kind': 'document'},
                  'position': {'x': 20, 'y': 30, 'unit': 'px'}, 'size': {'width': 600, 'height': 440, 'unit': 'px'}}
        blocks = []
        for label, offset in [('A', 0), ('B', 4)]:
            content = copy.deepcopy(source_b if label == 'B' and source_b is not None else source); content['description'] = acceptance + ' real acceptance ' + label
            if source_b is None:
                for point in content['points']: point['x'] += offset
            blocks.append(api('POST', path + '/blocks/geometry', {'block_type': 'geometry',
                'payload': {'source_data': content, 'format_version': 1}, 'visual_placement': layout,
                'expected_revision_updated_at': reload()['updated_at']}, 201))
            assert blocks[-1]['payload']['source_data'] == content
        a, b = blocks
        # Exercise update as well as create, then layout-only persistence.
        api('PATCH', path + f"/blocks/{a['id']}/geometry", {'source_data': a['payload']['source_data'],
            'format_version': 1, 'expected_revision_updated_at': reload()['updated_at']})
        moved = copy.deepcopy(layout); moved['position'].update(x=130, y=170); moved['size'].update(width=760, height=520)
        api('PATCH', path + f"/blocks/{a['id']}/visual-placement", {'visual_placement': moved, 'expected_revision_updated_at': reload()['updated_at']})
        loaded = {block['id']: block for block in reload()['blocks']}
        assert loaded[a['id']]['visual_placement'] == moved
        assert loaded[b['id']] == b
        for block in blocks:
            assert loaded[block['id']]['payload']['source_data'] == block['payload']['source_data']
        if args.midpoint or args.linear_constructions:
            fresh = loaded[a['id']]['payload']['source_data']
            edited = json.loads(subprocess.run(['node', 'tests/geometry_midpoint_reload_edit.mjs'], cwd=ROOT,
                               input=json.dumps(fresh), capture_output=True, text=True, check=True).stdout)
            GeometrySourceDataV1.model_validate(edited)
            api('PATCH', path + f"/blocks/{a['id']}/geometry", {'source_data': edited,
                'format_version': 1, 'expected_revision_updated_at': reload()['updated_at']})
            loaded = {block['id']: block for block in reload()['blocks']}
            assert loaded[a['id']]['payload']['source_data'] == edited
            assert loaded[a['id']]['visual_placement'] == moved and loaded[b['id']] == b
            for patch in [dict(kind='parallel'), dict(source_point_ids=['foreign-frame-point', 'missing']),
                          dict(output_point_id='missing'), dict(source_point_ids=['point-1','point-1'])]:
                bad = copy.deepcopy(edited); bad['constructions'][0].update(patch)
                api('PATCH', path + f"/blocks/{a['id']}/geometry", {'source_data': bad,
                    'format_version': 1, 'expected_revision_updated_at': reload()['updated_at']}, 422)
            bad = copy.deepcopy(edited)
            output = bad['constructions'][0]['output_point_id']
            next(p for p in bad['points'] if p['id'] == output)['x'] += 1
            api('PATCH', path + f"/blocks/{a['id']}/geometry", {'source_data': bad,
                'format_version': 1, 'expected_revision_updated_at': reload()['updated_at']}, 422)
            assert {block['id']: block for block in reload()['blocks']} == loaded
            if args.linear_constructions:
                index = next(i for i,c in enumerate(edited['constructions']) if c['kind']=='parallel')
                for patch in [dict(source={'kind':'circle','id':'missing'}),dict(through_point_id='missing'),dict(source={'kind':'line','id':edited['constructions'][index]['output_line_id']})]:
                    bad=copy.deepcopy(edited);bad['constructions'][index].update(patch)
                    api('PATCH',path+f"/blocks/{a['id']}/geometry",{'source_data':bad,'format_version':1,'expected_revision_updated_at':reload()['updated_at']},422)
                assert {block['id']:block for block in reload()['blocks']} == loaded
            print('PASS: real API post-reload source edit recomputes dependent chain; malformed updates rejected without mutation')
        with engine.connect() as connection:
            rows = connection.execute(text('SELECT b.id, b.visual_placement, g.source_data FROM content_blocks b JOIN geometry_block_contents g ON g.content_block_id=b.id WHERE b.question_revision_id=:revision'), {'revision': uuid.UUID(revision_id)}).mappings().all()
            assert len(rows) == 2
            for row in rows:
                assert row['source_data'] == loaded[str(row['id'])]['payload']['source_data']
                assert row['visual_placement'] == loaded[str(row['id'])]['visual_placement']
        print('PASS:', acceptance, 'real authenticated HTTP/PostgreSQL create/update/reload, semantic identity, ordered references, coordinates, placement and independent frames')
        print('Acceptance revision:', revision_id)
    finally:
        if user_id is not None:
            with SessionLocal() as db:
                db.get(User, user_id).is_active = False
                for assignment in db.scalars(select(UserRole).where(UserRole.user_id == user_id)): assignment.is_active = False
                for session in db.scalars(select(UserSession).where(UserSession.user_id == user_id)):
                    revoke_session(db, session=session, reason=acceptance + ' acceptance completed')
                db.commit()
            with SessionLocal() as db:
                assert not db.get(User, user_id).is_active
                assert not list(db.scalars(select(UserSession).where(UserSession.user_id == user_id, UserSession.revoked_at.is_(None))))
                assert not list(db.scalars(select(UserRole).where(UserRole.user_id == user_id, UserRole.is_active.is_(True))))
            print('PASS: temporary admin inactive, active roles disabled, all sessions revoked (independently verified)')
        client.close(); server.terminate()
        try: server.wait(timeout=10)
        except subprocess.TimeoutExpired: server.kill(); server.wait()


if __name__ == '__main__':
    main()
