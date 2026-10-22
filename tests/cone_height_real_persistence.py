"""Opt-in development PostgreSQL/API round trip; no browser save claim."""
import json
import os
from pathlib import Path
import secrets
import socket
import subprocess
import sys
import tempfile
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
from app.services.session_service import revoke_session


def main():
    assert '--temporary-admin' in sys.argv
    assert settings.APP_ENV == 'development' and engine.url.host in ('localhost', '127.0.0.1')
    with engine.connect() as connection:
        assert connection.execute(text('SELECT 1')).scalar_one() == 1
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    server = subprocess.Popen([sys.executable, '-B', '-m', 'uvicorn', 'app.main:app', '--app-dir', str(ROOT / 'backend'), '--host', '127.0.0.1', '--port', str(port), '--log-level', 'error', '--no-access-log'], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=subprocess.CREATE_NO_WINDOW)
    client = httpx.Client(base_url=f'http://127.0.0.1:{port}', timeout=30)
    user_id = None
    try:
        for _ in range(100):
            try:
                if client.get('/').status_code == 200:
                    break
            except httpx.ConnectError:
                pass
            time.sleep(.1)
        else:
            raise RuntimeError('Development backend did not start')
        password = secrets.token_urlsafe(40)
        email = f'cone-height-{uuid.uuid4().hex}@example.test'
        with SessionLocal() as db:
            role = db.scalar(select(Role).where(Role.name == 'admin', Role.is_active.is_(True)))
            assert role is not None
            user = User(first_name='Cone Height', last_name='Acceptance', email=email, password_hash=hash_password(password), is_active=True, is_email_verified=True, last_active_role_id=role.id)
            db.add(user); db.flush(); user_id = user.id
            db.add(UserRole(user_id=user_id, role_id=role.id, is_active=True, assigned_by=None)); db.commit()
        login = client.post('/api/v1/auth/login', json=dict(identifier=email, password=password, device_name='Cone height acceptance'))
        assert login.status_code == 200
        client.headers['Authorization'] = 'Bearer ' + login.json()['access_token']
        types = client.get('/api/v1/catalog/question-types'); assert types.status_code == 200
        created = client.post('/api/v1/question-editor/drafts', json=dict(question_type_id=types.json()[0]['id'])); assert created.status_code == 201
        revision = created.json()['revision_id']
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp) / 'scenes.json'
            subprocess.run(['node', 'tests/test_geometry_3d_cone_height.mjs', str(output)], cwd=ROOT, check=True)
            scenes = json.loads(output.read_text(encoding='utf-8'))
        revision_path = f'/api/v1/question-editor/revisions/{revision}'
        loaded = client.get(revision_path).json()
        response = client.post(revision_path + '/blocks/geometry', json=dict(block_type='geometry', payload=dict(source_data=scenes[0], format_version=1), expected_revision_updated_at=loaded['updated_at']))
        assert response.status_code == 201, response.text
        block = next(b for b in client.get(revision_path).json()['blocks'] if b['block_type'] == 'geometry')
        for scene in [scenes[0], scenes[1], scenes[0]]:
            loaded = client.get(revision_path).json()
            response = client.patch(revision_path + f"/blocks/{block['id']}/geometry", json=dict(source_data=scene, format_version=1, expected_revision_updated_at=loaded['updated_at']))
            assert response.status_code == 200, response.text
            reopened = client.get(revision_path).json()
            assert next(b for b in reopened['blocks'] if b['id'] == block['id'])['payload']['source_data'] == scene
            with engine.connect() as connection:
                stored = connection.execute(text('SELECT source_data FROM geometry_block_contents WHERE content_block_id=:id'), dict(id=uuid.UUID(block['id']))).scalar_one()
                assert stored == scene
        print('PASS: real PostgreSQL/API create/update/reload; renamed S/O, saved camera, height present/removed/restored; exact JSONB equality')
        print('Acceptance revision:', revision)
    finally:
        if user_id is not None:
            with SessionLocal() as db:
                db.get(User, user_id).is_active = False
                for role in db.scalars(select(UserRole).where(UserRole.user_id == user_id)):
                    role.is_active = False
                for session in db.scalars(select(UserSession).where(UserSession.user_id == user_id)):
                    revoke_session(db, session=session, reason='Cone height acceptance completed')
                db.commit()
        client.close(); server.terminate(); server.wait(timeout=10)


if __name__ == '__main__':
    main()
