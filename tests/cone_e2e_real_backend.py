"""Opt-in isolated development admin/draft + production App/Edge/PostgreSQL PDF check."""
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
    backend = f'http://127.0.0.1:{port}'
    server = subprocess.Popen([sys.executable, '-B', '-m', 'uvicorn', 'app.main:app', '--app-dir', str(ROOT / 'backend'), '--host', '127.0.0.1', '--port', str(port), '--log-level', 'error', '--no-access-log'], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=subprocess.CREATE_NO_WINDOW)
    client = httpx.Client(base_url=backend, timeout=30)
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
            raise RuntimeError('Local development backend failed to start')
        password, marker = secrets.token_urlsafe(40), f'CONE_E2E_ACCEPTANCE_{uuid.uuid4().hex[:12]}'
        email = f'cone-e2e-{uuid.uuid4().hex}@example.test'
        with SessionLocal() as db:
            role = db.scalar(select(Role).where(Role.name == 'admin', Role.is_active.is_(True)))
            assert role is not None
            user = User(first_name='Cone E2E', last_name='Temporary', email=email, password_hash=hash_password(password), is_active=True, is_email_verified=True, last_active_role_id=role.id)
            db.add(user); db.flush(); user_id = user.id
            db.add(UserRole(user_id=user_id, role_id=role.id, is_active=True, assigned_by=None)); db.commit()
        login = client.post('/api/v1/auth/login', json=dict(identifier=email, password=password, device_name='Cone acceptance setup'))
        assert login.status_code == 200
        client.headers['Authorization'] = 'Bearer ' + login.json()['access_token']
        types = client.get('/api/v1/catalog/question-types'); assert types.status_code == 200
        created = client.post('/api/v1/question-editor/drafts', json=dict(question_type_id=types.json()[0]['id'])); assert created.status_code == 201
        revision_id = created.json()['revision_id']
        document = dict(type='document', content=[dict(type='paragraph', attrs=None, content=[dict(type='text', text=marker, marks=[])])])
        loaded = client.get('/api/v1/question-editor/revisions/' + revision_id).json()
        response = client.post(f'/api/v1/question-editor/revisions/{revision_id}/blocks/text', json=dict(block_type='text', payload=dict(document=document, format_version=1), expected_revision_updated_at=loaded['updated_at']))
        assert response.status_code == 201, response.text
        artifact_dir = Path(tempfile.mkdtemp(prefix='cone-e2e-'))
        context = dict(backend=backend, email=email, password=password, marker=marker, revisionId=revision_id, artifacts=str(artifact_dir))
        subprocess.run(['node', 'tests/cone_e2e_browser.mjs'], cwd=ROOT, env=dict(os.environ, CONE_E2E_CONTEXT=json.dumps(context)), check=True)
        result = json.loads((artifact_dir / 'result.json').read_text(encoding='utf-8'))
        after = client.get('/api/v1/question-editor/revisions/' + revision_id).json()
        block = next(b for b in after['blocks'] if b['id'] == result['frameId'])
        assert block['payload']['source_data'] == result['final']
        with engine.connect() as connection:
            saved = connection.execute(text('SELECT source_data FROM geometry_block_contents WHERE content_block_id=:block'), dict(block=uuid.UUID(result['frameId']))).scalar_one()
            assert saved == result['final']
        print('PASS: final real UI-saved scene equals PostgreSQL JSONB and real revision GET exactly')
        print('Acceptance revision:', revision_id)
        print('Artifacts:', artifact_dir)
    finally:
        if user_id is not None:
            with SessionLocal() as db:
                db.get(User, user_id).is_active = False
                for role in db.scalars(select(UserRole).where(UserRole.user_id == user_id)):
                    role.is_active = False
                for session in db.scalars(select(UserSession).where(UserSession.user_id == user_id)):
                    revoke_session(db, session=session, reason='Cone acceptance completed')
                db.commit()
            print('PASS: temporary acceptance admin disabled; roles disabled and sessions revoked')
        client.close(); server.terminate()
        try:
            server.wait(timeout=10)
        except subprocess.TimeoutExpired:
            server.kill(); server.wait()


if __name__ == '__main__':
    main()
