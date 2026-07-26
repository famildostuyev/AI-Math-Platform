from sqlalchemy import select

from app.core.security import hash_password
from app.database.session import SessionLocal
from app.models.role import Role
from app.models.user import User
from app.models.user_role import UserRole


ADMIN_EMAIL = "admin@example.com"
ADMIN_PASSWORD = "Admin123!"


def create_admin() -> None:
    db = SessionLocal()

    try:
        existing_admin = db.scalar(
            select(User).where(User.email == ADMIN_EMAIL)
        )

        if existing_admin:
            print("Admin user already exists.")
            return

        admin_role = db.scalar(
            select(Role).where(Role.name == "admin")
        )

        if admin_role is None:
            raise RuntimeError(
                "Admin role not found. Run database seeds first."
            )

        admin = User(
            email=ADMIN_EMAIL,
            password_hash=hash_password(ADMIN_PASSWORD),
            is_email_verified=True,
            is_active=True,
        )

        db.add(admin)
        db.flush()  # admin.id əldə etmək üçün

        db.add(
            UserRole(
                user_id=admin.id,
                role_id=admin_role.id,
                assigned_by=None,
                is_active=True,
            )
        )

        admin.last_active_role_id = admin_role.id

        db.commit()

        print("Admin user created successfully.")
        print(f"Email: {ADMIN_EMAIL}")
        print(f"Password: {ADMIN_PASSWORD}")

    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    create_admin()