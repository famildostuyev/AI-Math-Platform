from __future__ import annotations

import uuid

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.core.enums import RelationshipType, RoleName
from app.database.session import SessionLocal
from app.models.role import Role
from app.models.user import User
from app.models.user_relationship import UserRelationship
from app.models.user_role import UserRole
from app.services.relationship_service import (
    RelationshipBlockedError,
    RelationshipConflictError,
    RelationshipContextError,
    RelationshipService,
)


def require_role(db: Session, role_name: RoleName) -> Role:
    role = db.scalar(
        select(Role).where(
            func.lower(Role.name) == role_name.value.lower(),
            Role.is_active.is_(True),
            Role.deleted_at.is_(None),
        )
    )
    if role is None:
        raise RuntimeError(f"Missing active role: {role_name.value}")
    return role


def create_user(db: Session, role: Role, label: str) -> User:
    token = uuid.uuid4().hex
    user = User(
        first_name="Relationship",
        last_name=label,
        email=f"{label.lower()}.{token}@example.com",
        phone=None,
        password_hash="relationship-service-test-only",
        is_email_verified=True,
        is_phone_verified=False,
        is_active=True,
    )
    db.add(user)
    db.flush()
    db.add(
        UserRole(
            user_id=user.id,
            role_id=role.id,
            assigned_by=None,
            is_active=True,
        )
    )
    user.last_active_role_id = role.id
    db.commit()
    db.refresh(user)
    return user


def pass_msg(message: str) -> None:
    print(f"[PASS] {message}")


def cleanup(db: Session, user_ids: list[uuid.UUID]) -> None:
    if not user_ids:
        return
    db.rollback()
    db.execute(
        delete(UserRelationship).where(
            (UserRelationship.requester_id.in_(user_ids))
            | (UserRelationship.recipient_id.in_(user_ids))
            | (UserRelationship.context_student_id.in_(user_ids))
            | (UserRelationship.blocked_by_id.in_(user_ids))
        )
    )
    db.execute(delete(UserRole).where(UserRole.user_id.in_(user_ids)))
    db.execute(delete(User).where(User.id.in_(user_ids)))
    db.commit()


def main() -> None:
    db = SessionLocal()
    created_user_ids: list[uuid.UUID] = []

    try:
        teacher_role = require_role(db, RoleName.TEACHER)
        student_role = require_role(db, RoleName.STUDENT)
        parent_role = require_role(db, RoleName.PARENT)

        teacher_1 = create_user(db, teacher_role, "TeacherOne")
        teacher_2 = create_user(db, teacher_role, "TeacherTwo")
        student = create_user(db, student_role, "Student")
        parent = create_user(db, parent_role, "Parent")

        created_user_ids.extend(
            [teacher_1.id, teacher_2.id, student.id, parent.id]
        )

        service = RelationshipService(db)

        teacher_student = service.send_request(
            requester_id=teacher_1.id,
            recipient_id=student.id,
            relationship_type=RelationshipType.TEACHER_TO_STUDENT,
        )
        pass_msg("Teacher -> Student request created.")

        try:
            service.send_request(
                requester_id=teacher_1.id,
                recipient_id=student.id,
                relationship_type=RelationshipType.TEACHER_TO_STUDENT,
            )
        except RelationshipConflictError:
            pass_msg("Duplicate pending request blocked.")
        else:
            raise AssertionError("Duplicate pending request was allowed.")

        service.accept_request(
            relationship_id=teacher_student.id,
            actor_id=student.id,
        )
        pass_msg("Teacher -> Student request accepted.")

        try:
            service.send_request(
                requester_id=student.id,
                recipient_id=teacher_1.id,
                relationship_type=RelationshipType.STUDENT_TO_TEACHER,
            )
        except RelationshipConflictError:
            pass_msg("Reverse request blocked after acceptance.")
        else:
            raise AssertionError("Reverse request was allowed.")

        teacher_teacher = service.send_request(
            requester_id=teacher_1.id,
            recipient_id=teacher_2.id,
            relationship_type=RelationshipType.TEACHER_TO_TEACHER,
        )
        service.reject_request(
            relationship_id=teacher_teacher.id,
            actor_id=teacher_2.id,
        )
        pass_msg("Teacher -> Teacher rejection works.")

        teacher_teacher = service.send_request(
            requester_id=teacher_1.id,
            recipient_id=teacher_2.id,
            relationship_type=RelationshipType.TEACHER_TO_TEACHER,
        )
        service.accept_request(
            relationship_id=teacher_teacher.id,
            actor_id=teacher_2.id,
        )
        service.end_relationship(
            relationship_id=teacher_teacher.id,
            actor_id=teacher_1.id,
        )
        pass_msg("Teacher -> Teacher accept/end works.")

        teacher_teacher = service.send_request(
            requester_id=teacher_1.id,
            recipient_id=teacher_2.id,
            relationship_type=RelationshipType.TEACHER_TO_TEACHER,
        )
        service.block_relationship(
            relationship_id=teacher_teacher.id,
            actor_id=teacher_2.id,
        )
        pass_msg("Teacher -> Teacher blocking works.")

        try:
            service.send_request(
                requester_id=teacher_1.id,
                recipient_id=teacher_2.id,
                relationship_type=RelationshipType.TEACHER_TO_TEACHER,
            )
        except RelationshipBlockedError:
            pass_msg("New request blocked by existing block.")
        else:
            raise AssertionError("Blocked pair created a new request.")

        try:
            service.send_request(
                requester_id=parent.id,
                recipient_id=teacher_1.id,
                relationship_type=RelationshipType.PARENT_TO_TEACHER,
                context_student_id=None,
            )
        except RelationshipContextError:
            pass_msg("Parent -> Teacher requires student context.")
        else:
            raise AssertionError("Missing context was allowed.")

        parent_student = service.send_request(
            requester_id=parent.id,
            recipient_id=student.id,
            relationship_type=RelationshipType.PARENT_TO_STUDENT,
        )
        service.accept_request(
            relationship_id=parent_student.id,
            actor_id=student.id,
        )
        pass_msg("Parent -> Student relationship accepted.")

        parent_teacher = service.send_request(
            requester_id=parent.id,
            recipient_id=teacher_1.id,
            relationship_type=RelationshipType.PARENT_TO_TEACHER,
            context_student_id=student.id,
        )
        service.accept_request(
            relationship_id=parent_teacher.id,
            actor_id=teacher_1.id,
        )
        pass_msg("Parent -> Teacher context relationship accepted.")

        print()
        print("RELATIONSHIP SERVICE FUNCTIONAL TESTS PASSED.")

    finally:
        try:
            cleanup(db, created_user_ids)
            print("Test data cleaned up successfully.")
        finally:
            db.close()


if __name__ == "__main__":
    main()
