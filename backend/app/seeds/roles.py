from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.role import Role


DEFAULT_ROLES = (
    {
        "name": "admin",
        "display_name": "Administrator",
        "description": "Full system administration access.",
        "is_system": True,
        "is_active": True,
    },
    {
        "name": "teacher",
        "display_name": "Teacher",
        "description": "Teacher access for managing students and learning activities.",
        "is_system": True,
        "is_active": True,
    },
    {
        "name": "student",
        "display_name": "Student",
        "description": "Student access for learning activities and assessments.",
        "is_system": True,
        "is_active": True,
    },
    {
        "name": "parent",
        "display_name": "Parent",
        "description": "Parent access for monitoring student progress.",
        "is_system": True,
        "is_active": True,
    },
)


def seed_roles(db: Session) -> None:
    """
    Create or synchronize the platform's default system roles.

    Running this function repeatedly does not create duplicate roles.
    """

    role_names = [role_data["name"] for role_data in DEFAULT_ROLES]

    existing_roles = db.scalars(
        select(Role).where(Role.name.in_(role_names))
    ).all()

    roles_by_name = {
        role.name: role
        for role in existing_roles
    }

    for role_data in DEFAULT_ROLES:
        existing_role = roles_by_name.get(role_data["name"])

        if existing_role is None:
            db.add(Role(**role_data))
            continue

        existing_role.display_name = role_data["display_name"]
        existing_role.description = role_data["description"]
        existing_role.is_system = role_data["is_system"]
        existing_role.is_active = role_data["is_active"]

    db.commit()
