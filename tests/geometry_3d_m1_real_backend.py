"""Opt-in M1 authenticated local HTTP/PostgreSQL acceptance; no migrations."""
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
sys.path.insert(0, str(ROOT))
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
from app.services.session_service import revoke_session
from tests.test_geometry_v1_contract import geometry_v1

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--temporary-admin', action='store_true', required=True)
    parser.parse_args()
    assert settings.APP_ENV == 'development' and engine.url.host in ('localhost', '127.0.0.1')
    with engine.connect() as connection:
        assert connection.execute(text('SELECT 1')).scalar_one() == 1
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0)); port = sock.getsockname()[1]
    server = subprocess.Popen([sys.executable, '-B', '-m', 'uvicorn', 'app.main:app', '--app-dir', str(ROOT / 'backend'), '--host', '127.0.0.1', '--port', str(port), '--log-level', 'error', '--no-access-log'], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=subprocess.CREATE_NO_WINDOW)
    user_id = None
    client = httpx.Client(base_url=f'http://127.0.0.1:{port}', timeout=30)
    try:
        for _ in range(100):
            try:
                if client.get('/').status_code == 200: break
            except httpx.ConnectError: pass
            time.sleep(.1)
        else: raise RuntimeError('Local backend did not start')
        password = secrets.token_urlsafe(40)
        email = f'geometry-m1-{uuid.uuid4().hex}@example.test'
        with SessionLocal() as db:
            role = db.scalar(select(Role).where(Role.name == 'admin', Role.is_active.is_(True)))
            assert role is not None
            user = User(first_name='Geometry M1', last_name='Acceptance', email=email, password_hash=hash_password(password), is_active=True, is_email_verified=True, last_active_role_id=role.id)
            db.add(user); db.flush(); user_id = user.id
            db.add(UserRole(user_id=user_id, role_id=role.id, is_active=True, assigned_by=None)); db.commit()
        login = client.post('/api/v1/auth/login', json=dict(identifier=email, password=password, device_name='M1 acceptance'))
        assert login.status_code == 200
        client.headers['Authorization'] = 'Bearer ' + login.json()['access_token']
        def api(method, path, body=None, expected=200):
            response = client.request(method, '/api/v1' + path, **({'params': body} if method == 'DELETE' else {'json': body}))
            assert response.status_code == expected, f'{method} {path}: {response.status_code}: {response.text[:500]}'
            return response.json() if response.content else None
        types = api('GET', '/catalog/question-types')
        draft = api('POST', '/question-editor/drafts', dict(question_type_id=types[0]['id']), 201)
        path = '/question-editor/revisions/' + draft['revision_id']
        reload = lambda: api('GET', path)
        scene = json.loads((ROOT / 'tests/geometry_3d_canonical.json').read_text(encoding='utf-8'))
        blocks = []
        for source in (geometry_v1(), scene):
            blocks.append(api('POST', path + '/blocks/geometry', dict(block_type='geometry', payload=dict(source_data=source, format_version=1), expected_revision_updated_at=reload()['updated_at']), 201))
        legacy, block = blocks
        loaded = reload()
        assert [b['payload']['source_data']['schema_version'] for b in loaded['blocks']] == [1, 2]
        assert loaded['blocks'][1]['payload']['source_data'] == scene
        operations = json.loads(subprocess.check_output(['node', str(ROOT / 'tests/geometry_3d_m1_reload_edit.mjs')], input=json.dumps(scene).encode(), cwd=ROOT))
        stale = loaded['updated_at']
        for stage in ('edited', 'detached'):
            expected = operations[stage]
            api('PATCH', path + f"/blocks/{block['id']}/geometry", dict(source_data=expected, expected_revision_updated_at=reload()['updated_at']))
            assert reload()['blocks'][1]['payload']['source_data'] == expected
        unchanged = reload()
        api('PATCH', path + f"/blocks/{block['id']}/geometry", dict(source_data=scene, expected_revision_updated_at=stale), 409)
        for bad in (dict(operations['detached'], schema_version=99), dict(operations['detached'], editing_camera={})):
            api('PATCH', path + f"/blocks/{block['id']}/geometry", dict(source_data=bad, expected_revision_updated_at=unchanged['updated_at']), 422)
        cycle = copy.deepcopy(scene); cycle['linear_objects'][0]['a'] = 'd'
        api('PATCH', path + f"/blocks/{block['id']}/geometry", dict(source_data=cycle, expected_revision_updated_at=unchanged['updated_at']), 422)
        assert reload() == unchanged
        assert unchanged['blocks'][0]['payload']['source_data'] == legacy['payload']['source_data']
        with engine.connect() as connection:
            rows = connection.execute(text('SELECT b.id, g.source_data FROM content_blocks b JOIN geometry_block_contents g ON g.content_block_id=b.id WHERE b.question_revision_id=:revision'), dict(revision=uuid.UUID(draft['revision_id']))).mappings().all()
            assert len(rows) == 2
            expected = {b['id']: b['payload']['source_data'] for b in unchanged['blocks']}
            assert all(row['source_data'] == expected[str(row['id'])] for row in rows)
        api('DELETE', path + f"/blocks/{block['id']}", dict(expected_revision_updated_at=unchanged['updated_at']), 204)
        assert reload()['blocks'] == [unchanged['blocks'][0]]
        print('PASS: real authenticated HTTP/PostgreSQL mixed V1/V2 create/reload, post-reload frontend evaluation, stable IDs, saved camera, safe detachment, 409/422 atomic rejection and block deletion')
        print('Acceptance revision:', draft['revision_id'])
    finally:
        if user_id is not None:
            with SessionLocal() as db:
                db.get(User, user_id).is_active = False
                for role in db.scalars(select(UserRole).where(UserRole.user_id == user_id)): role.is_active = False
                for session in db.scalars(select(UserSession).where(UserSession.user_id == user_id)): revoke_session(db, session=session, reason='M1 acceptance completed')
                db.commit()
            with SessionLocal() as db:
                assert not db.get(User, user_id).is_active
                assert not list(db.scalars(select(UserRole).where(UserRole.user_id == user_id, UserRole.is_active.is_(True))))
                assert not list(db.scalars(select(UserSession).where(UserSession.user_id == user_id, UserSession.revoked_at.is_(None))))
            print('PASS: temporary admin inactive, roles disabled, sessions revoked')
        client.close(); server.terminate()
        try: server.wait(timeout=10)
        except subprocess.TimeoutExpired: server.kill(); server.wait()

if __name__ == '__main__': main()
