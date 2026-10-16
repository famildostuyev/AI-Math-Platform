"""Opt-in real M5 Edge/editor/HTTP/PostgreSQL acceptance, isolated development draft."""
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
    user_id = None
    client = httpx.Client(base_url=f'http://127.0.0.1:{port}', timeout=30)
    try:
        for _ in range(100):
            try:
                if client.get('/').status_code == 200:
                    break
            except httpx.ConnectError:
                pass
            time.sleep(.1)
        else:
            raise RuntimeError('Local development backend did not start')
        password = secrets.token_urlsafe(40)
        email = f'geometry-m5-{uuid.uuid4().hex}@example.test'
        with SessionLocal() as db:
            role = db.scalar(select(Role).where(Role.name == 'admin', Role.is_active.is_(True)))
            assert role is not None
            user = User(first_name='Geometry M5', last_name='Acceptance', email=email, password_hash=hash_password(password), is_active=True, is_email_verified=True, last_active_role_id=role.id)
            db.add(user)
            db.flush()
            user_id = user.id
            db.add(UserRole(user_id=user_id, role_id=role.id, is_active=True, assigned_by=None))
            db.commit()
        login = client.post('/api/v1/auth/login', json=dict(identifier=email, password=password, device_name='M5 acceptance'))
        assert login.status_code == 200
        token = login.json()['access_token']
        client.headers['Authorization'] = 'Bearer ' + token
        types = client.get('/api/v1/catalog/question-types')
        assert types.status_code == 200
        created = client.post('/api/v1/question-editor/drafts', json=dict(question_type_id=types.json()[0]['id']))
        assert created.status_code == 201
        draft = created.json()
        with tempfile.TemporaryDirectory(prefix='geometry-m5-') as temp:
            result_path = str(Path(temp) / 'result.json')
            env = dict(os.environ, M5_REAL_CONTEXT=json.dumps(dict(backend=f'http://127.0.0.1:{port}', revision_id=draft['revision_id'], token=token)), M5_REAL_OUTPUT=result_path)
            subprocess.run(['node', 'tests/geometry_frame_browser.mjs', '--m5-real'], cwd=ROOT, env=env, check=True)
            result = json.loads(Path(result_path).read_text(encoding='utf-8'))
        loaded = client.get('/api/v1/question-editor/revisions/' + draft['revision_id'])
        assert loaded.status_code == 200
        block = next(b for b in loaded.json()['blocks'] if b['id'] == result['frameId'])
        assert block['payload']['source_data'] == result['second']
        assert result['first'] != result['second']
        with engine.connect() as connection:
            rows = connection.execute(text('SELECT b.id, g.source_data FROM content_blocks b JOIN geometry_block_contents g ON g.content_block_id=b.id WHERE b.question_revision_id=:revision'), dict(revision=uuid.UUID(draft['revision_id']))).mappings().all()
            assert len(rows) == 1 and str(rows[0]['id']) == result['frameId']
            assert rows[0]['source_data'] == result['second']
        print('PASS: PostgreSQL JSONB equals second real Edge saved/reloaded scene exactly; HTTP 201 Create + 200 Update/GET')
        print('Acceptance revision:', draft['revision_id'])
        print('Acceptance block:', result['frameId'])
    finally:
        if user_id is not None:
            with SessionLocal() as db:
                db.get(User, user_id).is_active = False
                for role in db.scalars(select(UserRole).where(UserRole.user_id == user_id)):
                    role.is_active = False
                for session in db.scalars(select(UserSession).where(UserSession.user_id == user_id)):
                    revoke_session(db, session=session, reason='M5 acceptance completed')
                db.commit()
            print('PASS: temporary development admin disabled, roles disabled, sessions revoked')
        client.close()
        server.terminate()
        try:
            server.wait(timeout=10)
        except subprocess.TimeoutExpired:
            server.kill()
            server.wait()


if __name__ == '__main__':
    main()
