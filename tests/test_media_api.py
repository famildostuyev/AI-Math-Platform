from __future__ import annotations

import os
import sys
import unittest
import uuid
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch


os.environ["DATABASE_URL"] = (
    "postgresql+psycopg2://unused:unused@127.0.0.1:1/unused"
)
os.environ["APP_ENV"] = "testing"
os.environ["DEBUG"] = "false"
os.environ["JWT_SECRET_KEY"] = "test-jwt-secret-key-00000000000001"
os.environ["REFRESH_TOKEN_HASH_KEY"] = (
    "test-refresh-token-hash-key-000001"
)
os.environ["VERIFICATION_CODE_HASH_KEY"] = (
    "test-verification-code-hash-key-01"
)

BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from fastapi.testclient import TestClient

from app.api.deps import get_current_active_user
from app.api.media import get_media_asset_service, router as media_router
from app.core.config import settings
from app.core.enums import RoleName
from app.database.session import get_db
from app.main import app
from app.schemas.media_asset import MediaAssetRead
from app.services.media_asset_service import (
    EmptyImageError,
    ImageDimensionsError,
    ImageTooLargeError,
    InvalidImageError,
)


NOW = datetime(2026, 8, 16, 12, 0, tzinfo=timezone.utc)


class MediaApiTest(unittest.TestCase):
    def setUp(self) -> None:
        self.db = MagicMock()
        self.db.scalar.return_value = RoleName.ADMIN.value
        self.current_user = SimpleNamespace(
            id=uuid.uuid4(),
            last_active_role_id=uuid.uuid4(),
        )
        self.service = MagicMock()

        def override_db():
            yield self.db

        app.dependency_overrides[get_db] = override_db
        app.dependency_overrides[get_current_active_user] = (
            lambda: self.current_user
        )
        app.dependency_overrides[get_media_asset_service] = (
            lambda: self.service
        )
        self.client = TestClient(app)

    def tearDown(self) -> None:
        app.dependency_overrides.clear()

    def _response(self) -> MediaAssetRead:
        return MediaAssetRead.model_validate({
            "id": uuid.uuid4(),
            "original_filename": "graph.png",
            "mime_type": "image/png",
            "size_bytes": 12,
            "width_px": 3,
            "height_px": 2,
            "created_at": NOW,
        })

    def test_admin_uploads_multipart_image_with_public_response(self) -> None:
        expected = self._response()
        self.service.create_image_asset.return_value = expected
        response = self.client.post(
            "/api/v1/media/assets/images",
            files={"file": ("graph.png", b"small image bytes", "image/png")},
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json(), expected.model_dump(mode="json"))
        call = self.service.create_image_asset.call_args
        self.assertTrue(hasattr(call.kwargs["upload"], "read"))
        self.assertEqual(call.kwargs["original_filename"], "graph.png")
        self.assertEqual(call.kwargs["submitted_mime_type"], "image/png")
        self.assertTrue(call.kwargs["upload"].closed)
        self.service.create_image_asset.assert_called_once()
        self.assertEqual(
            set(response.json()),
            {
                "id", "original_filename", "mime_type", "size_bytes",
                "width_px", "height_px", "created_at",
            },
        )
        for internal in (
            "storage_key", "sha256", "deleted_at", "updated_at",
            "path", "absolute_path", "relationships",
        ):
            self.assertNotIn(internal, response.json())

    @patch("app.api.media.MediaAssetService")
    @patch("app.api.media.LocalMediaStorage")
    def test_factory_constructs_storage_and_service_from_config(
        self,
        storage_class: MagicMock,
        service_class: MagicMock,
    ) -> None:
        result = get_media_asset_service(self.db)
        storage_class.assert_called_once_with(settings.MEDIA_ROOT)
        service_class.assert_called_once_with(
            self.db,
            storage=storage_class.return_value,
            max_image_bytes=settings.MEDIA_MAX_IMAGE_BYTES,
            max_image_pixels=settings.MEDIA_MAX_IMAGE_PIXELS,
        )
        self.assertIs(result, service_class.return_value)

    def test_missing_or_malformed_multipart_does_not_call_service(self) -> None:
        responses = (
            self.client.post("/api/v1/media/assets/images"),
            self.client.post(
                "/api/v1/media/assets/images",
                data={"description": "no file"},
            ),
            self.client.post(
                "/api/v1/media/assets/images",
                content=b"malformed",
                headers={"Content-Type": "multipart/form-data; boundary=missing"},
            ),
        )
        self.assertEqual(responses[0].status_code, 422)
        self.assertEqual(responses[1].status_code, 422)
        self.assertIn(responses[2].status_code, {400, 422})
        self.service.create_image_asset.assert_not_called()

    def test_domain_errors_map_to_stable_http_responses(self) -> None:
        cases = (
            (EmptyImageError(), 422, "Uploaded image is empty."),
            (
                ImageTooLargeError(), 413,
                "Uploaded image exceeds the allowed size.",
            ),
            (
                InvalidImageError(), 422,
                "Uploaded file is not a valid supported image.",
            ),
            (
                ImageDimensionsError(), 422,
                "Image dimensions exceed the allowed limit.",
            ),
        )
        for error, status_code, detail in cases:
            with self.subTest(error=type(error).__name__):
                self.service.reset_mock()
                self.service.create_image_asset.side_effect = error
                response = self.client.post(
                    "/api/v1/media/assets/images",
                    files={"file": ("image.bin", b"bytes", "application/octet-stream")},
                )
                self.assertEqual(response.status_code, status_code)
                self.assertEqual(response.json(), {"detail": detail})

    @patch("app.api.media.MediaAssetService")
    def test_unauthenticated_upload_returns_401_without_service_construction(
        self, service_class: MagicMock,
    ) -> None:
        del app.dependency_overrides[get_current_active_user]
        del app.dependency_overrides[get_media_asset_service]
        response = self.client.post(
            "/api/v1/media/assets/images",
            files={"file": ("graph.png", b"bytes", "image/png")},
        )
        self.assertEqual(response.status_code, 401)
        service_class.assert_not_called()

    @patch("app.api.media.MediaAssetService")
    def test_non_admin_upload_returns_403_without_service_construction(
        self, service_class: MagicMock,
    ) -> None:
        self.db.scalar.return_value = RoleName.TEACHER.value
        del app.dependency_overrides[get_media_asset_service]
        response = self.client.post(
            "/api/v1/media/assets/images",
            files={"file": ("graph.png", b"bytes", "image/png")},
        )
        self.assertEqual(response.status_code, 403)
        service_class.assert_not_called()

    def test_media_router_contains_only_upload_route(self) -> None:
        route_methods = {
            (method, route.path)
            for route in media_router.routes
            for method in getattr(route, "methods", set())
        }
        self.assertEqual(route_methods, {
            ("POST", "/media/assets/images"),
        })


if __name__ == "__main__":
    unittest.main()
