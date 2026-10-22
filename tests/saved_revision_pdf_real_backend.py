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
        password, marker = secrets.token_urlsafe(40), f'PDF_REAL_ACCEPTANCE_{uuid.uuid4().hex[:12]}'
        email = f'pdf-acceptance-{uuid.uuid4().hex}@example.test'
        with SessionLocal() as db:
            role = db.scalar(select(Role).where(Role.name == 'admin', Role.is_active.is_(True)))
            assert role is not None
            user = User(first_name='PDF Acceptance', last_name='Temporary', email=email, password_hash=hash_password(password), is_active=True, is_email_verified=True, last_active_role_id=role.id)
            db.add(user); db.flush(); user_id = user.id
            db.add(UserRole(user_id=user_id, role_id=role.id, is_active=True, assigned_by=None)); db.commit()
        login = client.post('/api/v1/auth/login', json=dict(identifier=email, password=password, device_name='PDF acceptance setup'))
        assert login.status_code == 200
        client.headers['Authorization'] = 'Bearer ' + login.json()['access_token']
        types = client.get('/api/v1/catalog/question-types'); assert types.status_code == 200
        created = client.post('/api/v1/question-editor/drafts', json=dict(question_type_id=types.json()[0]['id'])); assert created.status_code == 201
        revision_id = created.json()['revision_id']
        scene = json.loads(subprocess.check_output(['node', 'tests/saved_revision_pdf_browser.mjs', '--scene-fixture'], cwd=ROOT, encoding='utf-8'))
        document = dict(type='document', content=[dict(type='paragraph', attrs=None, content=[dict(type='text', text=marker + ' — Silindr üzərində M₁ α nöqtəsi.', marks=[])])])
        for kind, payload, extra in [
            ('text', dict(document=document, format_version=1), {}),
            ('geometry', dict(source_data=scene, format_version=1), dict(visual_placement=dict(version=1, layoutMode='floating', anchor=dict(kind='document'), position=dict(x=0, y=70, unit='px'), size=dict(width=320, height=260, unit='px')))),
        ]:
            loaded = client.get('/api/v1/question-editor/revisions/' + revision_id); assert loaded.status_code == 200
            response = client.post(f'/api/v1/question-editor/revisions/{revision_id}/blocks/{kind}', json=dict(block_type=kind, payload=payload, expected_revision_updated_at=loaded.json()['updated_at'], **extra))
            assert response.status_code == 201, response.text
        before = client.get('/api/v1/question-editor/revisions/' + revision_id).json()
        artifact_dir = Path(tempfile.mkdtemp(prefix='saved-revision-pdf-artifacts-'))
        pdf_path = artifact_dir / 'saved-question.pdf'
        context = dict(backend=backend, email=email, password=password, marker=marker, revisionId=revision_id, pdfPath=str(pdf_path))
        browser_flags = [flag for flag in ('--question-bank-layout', '--expect-broken') if flag in sys.argv]
        subprocess.run(['node', 'tests/saved_revision_pdf_browser.mjs', *browser_flags], cwd=ROOT, env=dict(os.environ, SAVED_PDF_REAL_CONTEXT=json.dumps(context)), check=True)
        after = client.get('/api/v1/question-editor/revisions/' + revision_id).json()
        assert before == after, 'PDF preparation must not mutate the saved revision'
        with engine.connect() as connection:
            saved = connection.execute(text('SELECT g.source_data FROM geometry_block_contents g JOIN content_blocks b ON b.id=g.content_block_id WHERE b.question_revision_id=:revision'), dict(revision=uuid.UUID(revision_id))).scalar_one()
            assert saved == scene
        print('PASS: persisted PostgreSQL geometry/camera/Unicode label preserved; revision unchanged')
        print('Acceptance revision:', revision_id)
        try:
            import fitz
        except ImportError:
            print('BLOCKED: PDF rasterization unavailable; no dependencies installed')
        else:
            with fitz.open(pdf_path) as pdf:
                assert len(pdf) == 1
                page = pdf[0]
                assert marker in page.get_text()
                assert abs(page.rect.width - 595.28) < 1 and abs(page.rect.height - 841.89) < 1
                png = artifact_dir / 'saved-question-page-1.png'
                page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5)).save(png)
                print('PASS: actual one-page A4 PDF text and page dimensions')
                print('PDF page image:', png)
    finally:
        if user_id is not None:
            with SessionLocal() as db:
                db.get(User, user_id).is_active = False
                for role in db.scalars(select(UserRole).where(UserRole.user_id == user_id)):
                    role.is_active = False
                for session in db.scalars(select(UserSession).where(UserSession.user_id == user_id)):
                    revoke_session(db, session=session, reason='PDF acceptance completed')
                db.commit()
            print('PASS: temporary acceptance admin disabled; roles disabled and sessions revoked')
        client.close(); server.terminate()
        try:
            server.wait(timeout=10)
        except subprocess.TimeoutExpired:
            server.kill(); server.wait()


if __name__ == '__main__':
    main()
