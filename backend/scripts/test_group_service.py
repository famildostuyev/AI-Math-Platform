from __future__ import annotations

import uuid

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.core.enums import (
    GroupMemberCategory,
    GroupMembershipStatus,
    RelationshipType,
    RoleName,
)
from app.database.session import SessionLocal
from app.models.grade import Grade
from app.models.group import Group
from app.models.group_grade import GroupGrade
from app.models.group_member import GroupMember
from app.models.group_purpose import GroupPurpose
from app.models.purpose import Purpose
from app.models.role import Role
from app.models.user import User
from app.models.user_relationship import UserRelationship
from app.models.user_role import UserRole
from app.services.group_service import (
    GroupRelationshipRequiredError,
    GroupService,
    GroupValidationError,
)
from app.services.relationship_service import RelationshipService


def _require_role(
    db: Session,
    *,
    role_name: RoleName,
) -> Role:
    role = db.scalar(
        select(Role).where(
            func.lower(Role.name) == role_name.value.lower(),
            Role.is_active.is_(True),
            Role.deleted_at.is_(None),
        )
    )

    if role is None:
        raise RuntimeError(
            f"Required active role is missing: {role_name.value}"
        )

    return role


def _require_grade(
    db: Session,
    *,
    name: str,
) -> Grade:
    grade = db.scalar(
        select(Grade).where(
            Grade.name == name,
            Grade.is_active.is_(True),
            Grade.deleted_at.is_(None),
        )
    )

    if grade is None:
        raise RuntimeError(
            f"Required active grade is missing: {name}"
        )

    return grade


def _require_purpose(
    db: Session,
    *,
    name: str,
) -> Purpose:
    purpose = db.scalar(
        select(Purpose).where(
            Purpose.name == name,
            Purpose.is_active.is_(True),
            Purpose.deleted_at.is_(None),
        )
    )

    if purpose is None:
        raise RuntimeError(
            f"Required active purpose is missing: {name}"
        )

    return purpose


def _create_user_with_role(
    db: Session,
    *,
    role: Role,
    label: str,
) -> User:
    token = uuid.uuid4().hex

    user = User(
        first_name="GroupTest",
        last_name=label,
        email=f"group.test.{label.lower()}.{token}@example.com",
        phone=None,
        password_hash="group-service-functional-test-only",
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


def _accept_relationship(
    relationship_service: RelationshipService,
    *,
    requester_id: uuid.UUID,
    recipient_id: uuid.UUID,
    relationship_type: RelationshipType,
) -> UserRelationship:
    relationship = relationship_service.send_request(
        requester_id=requester_id,
        recipient_id=recipient_id,
        relationship_type=relationship_type,
    )

    return relationship_service.accept_request(
        relationship_id=relationship.id,
        actor_id=recipient_id,
    )


def _pass(message: str) -> None:
    print(f"[PASS] {message}")


def _cleanup(
    db: Session,
    *,
    created_user_ids: list[uuid.UUID],
    created_group_ids: list[uuid.UUID],
) -> None:
    db.rollback()

    if created_group_ids:
        db.execute(
            delete(GroupMember).where(
                GroupMember.group_id.in_(created_group_ids)
            )
        )
        db.execute(
            delete(GroupGrade).where(
                GroupGrade.group_id.in_(created_group_ids)
            )
        )
        db.execute(
            delete(GroupPurpose).where(
                GroupPurpose.group_id.in_(created_group_ids)
            )
        )
        db.execute(
            delete(Group).where(
                Group.id.in_(created_group_ids)
            )
        )

    if created_user_ids:
        db.execute(
            delete(UserRelationship).where(
                (UserRelationship.requester_id.in_(created_user_ids))
                | (UserRelationship.recipient_id.in_(created_user_ids))
                | (UserRelationship.context_student_id.in_(created_user_ids))
                | (UserRelationship.blocked_by_id.in_(created_user_ids))
            )
        )

        db.execute(
            delete(UserRole).where(
                UserRole.user_id.in_(created_user_ids)
            )
        )

        db.execute(
            delete(User).where(
                User.id.in_(created_user_ids)
            )
        )

    db.commit()


def main() -> None:
    db = SessionLocal()

    created_user_ids: list[uuid.UUID] = []
    created_group_ids: list[uuid.UUID] = []

    try:
        teacher_role = _require_role(
            db,
            role_name=RoleName.TEACHER,
        )
        student_role = _require_role(
            db,
            role_name=RoleName.STUDENT,
        )

        grade_10 = _require_grade(
            db,
            name="grade_10",
        )
        grade_11 = _require_grade(
            db,
            name="grade_11",
        )

        purpose_buraxilis_11 = _require_purpose(
            db,
            name="buraxilis_11",
        )
        purpose_blok_i = _require_purpose(
            db,
            name="blok_i_qrup",
        )
        purpose_miq = _require_purpose(
            db,
            name="miq",
        )
        purpose_sertifikatlasdirma = _require_purpose(
            db,
            name="sertifikatlasdirma",
        )

        teacher_owner = _create_user_with_role(
            db,
            role=teacher_role,
            label="TeacherOwner",
        )
        teacher_member = _create_user_with_role(
            db,
            role=teacher_role,
            label="TeacherMember",
        )
        student_1 = _create_user_with_role(
            db,
            role=student_role,
            label="StudentOne",
        )
        student_2 = _create_user_with_role(
            db,
            role=student_role,
            label="StudentTwo",
        )

        created_user_ids.extend(
            [
                teacher_owner.id,
                teacher_member.id,
                student_1.id,
                student_2.id,
            ]
        )

        relationship_service = RelationshipService(db)
        group_service = GroupService(db)

        # ---------------------------------------------------------
        # 1. Student group: multiple grades + multiple purposes
        # ---------------------------------------------------------
        student_group = group_service.create_group(
            owner_teacher_id=teacher_owner.id,
            name="10-11-ci sinif Riyaziyyat hazırlığı",
            member_category=GroupMemberCategory.STUDENT,
            description="Functional test student group",
            grade_ids=[grade_10.id, grade_11.id],
            purpose_ids=[
                purpose_buraxilis_11.id,
                purpose_blok_i.id,
            ],
        )
        created_group_ids.append(student_group.id)

        _pass(
            "Student group created with 10th/11th grades and multiple purposes."
        )

        # Invitation must fail before accepted Teacher <-> Student relation.
        try:
            group_service.invite_member(
                group_id=student_group.id,
                actor_id=teacher_owner.id,
                user_id=student_1.id,
                grade_id=grade_10.id,
            )
        except GroupRelationshipRequiredError:
            _pass(
                "Student invitation blocked without accepted teacher-student relationship."
            )
        else:
            raise AssertionError(
                "Student invitation was allowed without relationship."
            )

        _accept_relationship(
            relationship_service,
            requester_id=teacher_owner.id,
            recipient_id=student_1.id,
            relationship_type=RelationshipType.TEACHER_TO_STUDENT,
        )

        membership_1 = group_service.invite_member(
            group_id=student_group.id,
            actor_id=teacher_owner.id,
            user_id=student_1.id,
            grade_id=grade_10.id,
        )
        _pass("Student invited after accepted relationship.")

        membership_1 = group_service.accept_invitation(
            membership_id=membership_1.id,
            actor_id=student_1.id,
        )

        if membership_1.status != GroupMembershipStatus.ACTIVE:
            raise AssertionError(
                "Accepted student membership is not ACTIVE."
            )

        _pass("Student accepted group invitation.")

        # A teacher cannot be inserted into a student group.
        try:
            group_service.invite_member(
                group_id=student_group.id,
                actor_id=teacher_owner.id,
                user_id=teacher_member.id,
                grade_id=grade_11.id,
            )
        except GroupValidationError:
            _pass("Teacher correctly blocked from student group.")
        else:
            raise AssertionError(
                "Teacher was incorrectly allowed into student group."
            )

        # Second student: test owner removal.
        _accept_relationship(
            relationship_service,
            requester_id=student_2.id,
            recipient_id=teacher_owner.id,
            relationship_type=RelationshipType.STUDENT_TO_TEACHER,
        )

        membership_2 = group_service.invite_member(
            group_id=student_group.id,
            actor_id=teacher_owner.id,
            user_id=student_2.id,
            grade_id=grade_11.id,
        )

        membership_2 = group_service.accept_invitation(
            membership_id=membership_2.id,
            actor_id=student_2.id,
        )

        membership_2 = group_service.remove_member(
            membership_id=membership_2.id,
            actor_id=teacher_owner.id,
        )

        if membership_2.status != GroupMembershipStatus.REMOVED:
            raise AssertionError(
                "Removed student membership is not REMOVED."
            )

        _pass("Group owner removed an active student member.")

        membership_1 = group_service.leave_group(
            membership_id=membership_1.id,
            actor_id=student_1.id,
        )

        if membership_1.status != GroupMembershipStatus.LEFT:
            raise AssertionError(
                "Student membership is not LEFT after leaving."
            )

        _pass("Student left the group successfully.")

        # ---------------------------------------------------------
        # 2. Teacher preparation group
        # ---------------------------------------------------------
        teacher_group = group_service.create_group(
            owner_teacher_id=teacher_owner.id,
            name="MİQ və Sertifikatlaşdırma hazırlığı",
            member_category=GroupMemberCategory.TEACHER,
            description="Functional test teacher group",
            grade_ids=None,
            purpose_ids=[
                purpose_miq.id,
                purpose_sertifikatlasdirma.id,
            ],
        )
        created_group_ids.append(teacher_group.id)

        _pass(
            "Teacher preparation group created with MİQ/Sertifikatlaşdırma purposes."
        )

        try:
            group_service.invite_member(
                group_id=teacher_group.id,
                actor_id=teacher_owner.id,
                user_id=teacher_member.id,
            )
        except GroupRelationshipRequiredError:
            _pass(
                "Teacher invitation blocked without accepted teacher-teacher relationship."
            )
        else:
            raise AssertionError(
                "Teacher invitation was allowed without relationship."
            )

        _accept_relationship(
            relationship_service,
            requester_id=teacher_owner.id,
            recipient_id=teacher_member.id,
            relationship_type=RelationshipType.TEACHER_TO_TEACHER,
        )

        teacher_membership = group_service.invite_member(
            group_id=teacher_group.id,
            actor_id=teacher_owner.id,
            user_id=teacher_member.id,
        )

        teacher_membership = group_service.accept_invitation(
            membership_id=teacher_membership.id,
            actor_id=teacher_member.id,
        )

        if teacher_membership.status != GroupMembershipStatus.ACTIVE:
            raise AssertionError(
                "Accepted teacher membership is not ACTIVE."
            )

        _pass("Teacher joined teacher-preparation group.")

        teacher_membership = group_service.leave_group(
            membership_id=teacher_membership.id,
            actor_id=teacher_member.id,
        )

        if teacher_membership.status != GroupMembershipStatus.LEFT:
            raise AssertionError(
                "Teacher membership is not LEFT after leaving."
            )

        _pass("Teacher left teacher-preparation group.")

        print()
        print("GROUP SERVICE FUNCTIONAL TESTS PASSED.")

    finally:
        try:
            _cleanup(
                db,
                created_user_ids=created_user_ids,
                created_group_ids=created_group_ids,
            )
            print("Test data cleaned up successfully.")
        finally:
            db.close()


if __name__ == "__main__":
    main()