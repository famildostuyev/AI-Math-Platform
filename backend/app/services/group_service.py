from __future__ import annotations

import uuid

from sqlalchemy import and_, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.enums import (
    GroupMemberCategory,
    GroupMemberRole,
    GroupMembershipStatus,
    RelationshipStatus,
    RelationshipType,
    RoleName,
)
from app.core.security import utc_now
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


class GroupServiceError(Exception):
    """Base exception for group-service failures."""


class GroupNotFoundError(GroupServiceError):
    """Raised when a group cannot be found."""


class GroupPermissionError(GroupServiceError):
    """Raised when a user cannot perform an action on a group."""


class GroupMemberNotFoundError(GroupServiceError):
    """Raised when a group membership cannot be found."""


class GroupMemberConflictError(GroupServiceError):
    """Raised when an equivalent membership already exists."""


class GroupValidationError(GroupServiceError):
    """Raised when group data is invalid."""


class GroupRelationshipRequiredError(GroupServiceError):
    """Raised when a required accepted relationship does not exist."""


class GroupCatalogItemNotFoundError(GroupServiceError):
    """Raised when a grade or purpose cannot be found."""


class GroupService:
    """
    Application service responsible for group workflows.

    Responsibilities:

    - create and update groups;
    - attach grades and purposes;
    - invite student or teacher members;
    - require an accepted relationship before invitation;
    - accept or reject group invitations;
    - leave or remove members;
    - preserve transaction boundaries.

    Educational compatibility rules between purposes and group categories
    are intentionally not hard-coded here yet. Those rules will be added
    after they are finalized.
    """

    def __init__(self, db: Session) -> None:
        self.db = db

    def _get_active_user(
        self,
        *,
        user_id: uuid.UUID,
    ) -> User:
        user = self.db.scalar(
            select(User).where(
                User.id == user_id,
                User.is_active.is_(True),
                User.deleted_at.is_(None),
            )
        )

        if user is None:
            raise GroupValidationError(
                "Active user was not found."
            )

        return user

    def _user_has_role(
        self,
        *,
        user_id: uuid.UUID,
        role_name: RoleName,
    ) -> bool:
        statement = (
            select(UserRole.id)
            .join(Role, Role.id == UserRole.role_id)
            .where(
                UserRole.user_id == user_id,
                UserRole.is_active.is_(True),
                UserRole.deleted_at.is_(None),
                Role.is_active.is_(True),
                Role.deleted_at.is_(None),
                func.lower(Role.name) == role_name.value.lower(),
            )
            .limit(1)
        )

        return self.db.scalar(statement) is not None

    def _get_group_for_update(
        self,
        *,
        group_id: uuid.UUID,
    ) -> Group:
        group = self.db.scalar(
            select(Group)
            .where(
                Group.id == group_id,
                Group.deleted_at.is_(None),
            )
            .with_for_update()
        )

        if group is None:
            raise GroupNotFoundError(
                "Group was not found."
            )

        return group

    def _require_owner(
        self,
        *,
        group: Group,
        actor_id: uuid.UUID,
    ) -> None:
        if group.owner_teacher_id != actor_id:
            raise GroupPermissionError(
                "Only the group owner can perform this action."
            )

    def _get_grade(
        self,
        *,
        grade_id: uuid.UUID,
    ) -> Grade:
        grade = self.db.scalar(
            select(Grade).where(
                Grade.id == grade_id,
                Grade.is_active.is_(True),
                Grade.deleted_at.is_(None),
            )
        )

        if grade is None:
            raise GroupCatalogItemNotFoundError(
                "Active grade was not found."
            )

        return grade

    def _get_purpose(
        self,
        *,
        purpose_id: uuid.UUID,
    ) -> Purpose:
        purpose = self.db.scalar(
            select(Purpose).where(
                Purpose.id == purpose_id,
                Purpose.is_active.is_(True),
                Purpose.deleted_at.is_(None),
            )
        )

        if purpose is None:
            raise GroupCatalogItemNotFoundError(
                "Active purpose was not found."
            )

        return purpose

    def _has_accepted_relationship(
        self,
        *,
        first_user_id: uuid.UUID,
        second_user_id: uuid.UUID,
        relationship_types: tuple[RelationshipType, ...],
    ) -> bool:
        pair_condition = or_(
            and_(
                UserRelationship.requester_id == first_user_id,
                UserRelationship.recipient_id == second_user_id,
            ),
            and_(
                UserRelationship.requester_id == second_user_id,
                UserRelationship.recipient_id == first_user_id,
            ),
        )

        statement = (
            select(UserRelationship.id)
            .where(
                pair_condition,
                UserRelationship.relationship_type.in_(
                    relationship_types
                ),
                UserRelationship.status == RelationshipStatus.ACCEPTED,
                UserRelationship.deleted_at.is_(None),
            )
            .limit(1)
        )

        return self.db.scalar(statement) is not None

    def _validate_member_for_group(
        self,
        *,
        group: Group,
        user_id: uuid.UUID,
    ) -> None:
        self._get_active_user(user_id=user_id)

        if group.member_category == GroupMemberCategory.STUDENT:
            if not self._user_has_role(
                user_id=user_id,
                role_name=RoleName.STUDENT,
            ):
                raise GroupValidationError(
                    "Student group members must have the student role."
                )

            if not self._has_accepted_relationship(
                first_user_id=group.owner_teacher_id,
                second_user_id=user_id,
                relationship_types=(
                    RelationshipType.TEACHER_TO_STUDENT,
                    RelationshipType.STUDENT_TO_TEACHER,
                ),
            ):
                raise GroupRelationshipRequiredError(
                    "An accepted teacher-student relationship is required."
                )

            return

        if group.member_category == GroupMemberCategory.TEACHER:
            if not self._user_has_role(
                user_id=user_id,
                role_name=RoleName.TEACHER,
            ):
                raise GroupValidationError(
                    "Teacher group members must have the teacher role."
                )

            if not self._has_accepted_relationship(
                first_user_id=group.owner_teacher_id,
                second_user_id=user_id,
                relationship_types=(
                    RelationshipType.TEACHER_TO_TEACHER,
                ),
            ):
                raise GroupRelationshipRequiredError(
                    "An accepted teacher-teacher relationship is required."
                )

            return

        raise GroupValidationError(
            "Unsupported group member category."
        )

    def create_group(
        self,
        *,
        owner_teacher_id: uuid.UUID,
        name: str,
        member_category: GroupMemberCategory,
        description: str | None = None,
        grade_ids: list[uuid.UUID] | None = None,
        purpose_ids: list[uuid.UUID] | None = None,
    ) -> Group:
        normalized_name = name.strip()

        if not normalized_name:
            raise GroupValidationError(
                "Group name cannot be empty."
            )

        self._get_active_user(user_id=owner_teacher_id)

        if not self._user_has_role(
            user_id=owner_teacher_id,
            role_name=RoleName.TEACHER,
        ):
            raise GroupValidationError(
                "Group owner must have the teacher role."
            )

        if (
            member_category == GroupMemberCategory.TEACHER
            and grade_ids
        ):
            raise GroupValidationError(
                "Teacher preparation groups cannot have grade assignments."
            )

        try:
            group = Group(
                name=normalized_name,
                description=description.strip()
                if description and description.strip()
                else None,
                owner_teacher_id=owner_teacher_id,
                member_category=member_category,
                is_active=True,
            )

            self.db.add(group)
            self.db.flush()

            for grade_id in dict.fromkeys(grade_ids or []):
                self._get_grade(grade_id=grade_id)
                self.db.add(
                    GroupGrade(
                        group_id=group.id,
                        grade_id=grade_id,
                    )
                )

            for purpose_id in dict.fromkeys(purpose_ids or []):
                self._get_purpose(purpose_id=purpose_id)
                self.db.add(
                    GroupPurpose(
                        group_id=group.id,
                        purpose_id=purpose_id,
                    )
                )

            self.db.commit()
            self.db.refresh(group)

            return group

        except IntegrityError as exc:
            self.db.rollback()
            raise GroupValidationError(
                "Group could not be created because of a data conflict."
            ) from exc
        except Exception:
            self.db.rollback()
            raise

    def add_grade(
        self,
        *,
        group_id: uuid.UUID,
        actor_id: uuid.UUID,
        grade_id: uuid.UUID,
    ) -> GroupGrade:
        try:
            group = self._get_group_for_update(group_id=group_id)
            self._require_owner(group=group, actor_id=actor_id)

            if group.member_category != GroupMemberCategory.STUDENT:
                raise GroupValidationError(
                    "Only student groups can have grades."
                )

            self._get_grade(grade_id=grade_id)

            existing = self.db.scalar(
                select(GroupGrade).where(
                    GroupGrade.group_id == group_id,
                    GroupGrade.grade_id == grade_id,
                    GroupGrade.deleted_at.is_(None),
                )
            )

            if existing is not None:
                return existing

            group_grade = GroupGrade(
                group_id=group_id,
                grade_id=grade_id,
            )
            self.db.add(group_grade)
            self.db.commit()
            self.db.refresh(group_grade)
            return group_grade

        except Exception:
            self.db.rollback()
            raise

    def add_purpose(
        self,
        *,
        group_id: uuid.UUID,
        actor_id: uuid.UUID,
        purpose_id: uuid.UUID,
    ) -> GroupPurpose:
        try:
            group = self._get_group_for_update(group_id=group_id)
            self._require_owner(group=group, actor_id=actor_id)
            self._get_purpose(purpose_id=purpose_id)

            existing = self.db.scalar(
                select(GroupPurpose).where(
                    GroupPurpose.group_id == group_id,
                    GroupPurpose.purpose_id == purpose_id,
                    GroupPurpose.deleted_at.is_(None),
                )
            )

            if existing is not None:
                return existing

            group_purpose = GroupPurpose(
                group_id=group_id,
                purpose_id=purpose_id,
            )
            self.db.add(group_purpose)
            self.db.commit()
            self.db.refresh(group_purpose)
            return group_purpose

        except Exception:
            self.db.rollback()
            raise

    def invite_member(
        self,
        *,
        group_id: uuid.UUID,
        actor_id: uuid.UUID,
        user_id: uuid.UUID,
        grade_id: uuid.UUID | None = None,
    ) -> GroupMember:
        if actor_id == user_id:
            raise GroupValidationError(
                "Group owner cannot invite themselves as a member."
            )

        try:
            group = self._get_group_for_update(group_id=group_id)
            self._require_owner(group=group, actor_id=actor_id)
            self._validate_member_for_group(
                group=group,
                user_id=user_id,
            )

            if group.member_category == GroupMemberCategory.TEACHER:
                if grade_id is not None:
                    raise GroupValidationError(
                        "Teacher group members cannot have a grade."
                    )
            else:
                if grade_id is not None:
                    self._get_grade(grade_id=grade_id)

                    grade_link = self.db.scalar(
                        select(GroupGrade.id).where(
                            GroupGrade.group_id == group.id,
                            GroupGrade.grade_id == grade_id,
                            GroupGrade.deleted_at.is_(None),
                        )
                    )

                    if grade_link is None:
                        raise GroupValidationError(
                            "Member grade must be attached to the group."
                        )

            membership = self.db.scalar(
                select(GroupMember)
                .where(
                    GroupMember.group_id == group.id,
                    GroupMember.user_id == user_id,
                    GroupMember.deleted_at.is_(None),
                )
                .with_for_update()
            )

            now = utc_now()

            if membership is not None:
                if membership.status in (
                    GroupMembershipStatus.PENDING,
                    GroupMembershipStatus.ACTIVE,
                ):
                    raise GroupMemberConflictError(
                        "User already has a pending or active group membership."
                    )

                membership.grade_id = grade_id
                membership.invited_by = actor_id
                membership.member_role = GroupMemberRole.MEMBER
                membership.status = GroupMembershipStatus.PENDING
                membership.joined_at = None
                membership.left_at = None

                self.db.commit()
                self.db.refresh(membership)
                return membership

            membership = GroupMember(
                group_id=group.id,
                user_id=user_id,
                grade_id=grade_id,
                invited_by=actor_id,
                member_role=GroupMemberRole.MEMBER,
                status=GroupMembershipStatus.PENDING,
                joined_at=None,
                left_at=None,
            )

            self.db.add(membership)
            self.db.commit()
            self.db.refresh(membership)

            return membership

        except IntegrityError as exc:
            self.db.rollback()
            raise GroupMemberConflictError(
                "Group membership already exists."
            ) from exc
        except Exception:
            self.db.rollback()
            raise

    def accept_invitation(
        self,
        *,
        membership_id: uuid.UUID,
        actor_id: uuid.UUID,
    ) -> GroupMember:
        try:
            membership = self.db.scalar(
                select(GroupMember)
                .where(
                    GroupMember.id == membership_id,
                    GroupMember.deleted_at.is_(None),
                )
                .with_for_update()
            )

            if membership is None:
                raise GroupMemberNotFoundError(
                    "Group membership was not found."
                )

            if membership.user_id != actor_id:
                raise GroupPermissionError(
                    "Only the invited user can accept the invitation."
                )

            if membership.status != GroupMembershipStatus.PENDING:
                raise GroupValidationError(
                    "Only pending invitations can be accepted."
                )

            group = self._get_group_for_update(
                group_id=membership.group_id,
            )

            self._validate_member_for_group(
                group=group,
                user_id=actor_id,
            )

            membership.status = GroupMembershipStatus.ACTIVE
            membership.joined_at = utc_now()
            membership.left_at = None

            self.db.commit()
            self.db.refresh(membership)
            return membership

        except Exception:
            self.db.rollback()
            raise

    def reject_invitation(
        self,
        *,
        membership_id: uuid.UUID,
        actor_id: uuid.UUID,
    ) -> GroupMember:
        try:
            membership = self.db.scalar(
                select(GroupMember)
                .where(
                    GroupMember.id == membership_id,
                    GroupMember.deleted_at.is_(None),
                )
                .with_for_update()
            )

            if membership is None:
                raise GroupMemberNotFoundError(
                    "Group membership was not found."
                )

            if membership.user_id != actor_id:
                raise GroupPermissionError(
                    "Only the invited user can reject the invitation."
                )

            if membership.status != GroupMembershipStatus.PENDING:
                raise GroupValidationError(
                    "Only pending invitations can be rejected."
                )

            membership.status = GroupMembershipStatus.REJECTED
            membership.joined_at = None
            membership.left_at = utc_now()

            self.db.commit()
            self.db.refresh(membership)
            return membership

        except Exception:
            self.db.rollback()
            raise

    def leave_group(
        self,
        *,
        membership_id: uuid.UUID,
        actor_id: uuid.UUID,
    ) -> GroupMember:
        try:
            membership = self.db.scalar(
                select(GroupMember)
                .where(
                    GroupMember.id == membership_id,
                    GroupMember.deleted_at.is_(None),
                )
                .with_for_update()
            )

            if membership is None:
                raise GroupMemberNotFoundError(
                    "Group membership was not found."
                )

            if membership.user_id != actor_id:
                raise GroupPermissionError(
                    "Only the member can leave the group."
                )

            if membership.status != GroupMembershipStatus.ACTIVE:
                raise GroupValidationError(
                    "Only active members can leave the group."
                )

            membership.status = GroupMembershipStatus.LEFT
            membership.left_at = utc_now()

            self.db.commit()
            self.db.refresh(membership)
            return membership

        except Exception:
            self.db.rollback()
            raise

    def remove_member(
        self,
        *,
        membership_id: uuid.UUID,
        actor_id: uuid.UUID,
    ) -> GroupMember:
        try:
            membership = self.db.scalar(
                select(GroupMember)
                .where(
                    GroupMember.id == membership_id,
                    GroupMember.deleted_at.is_(None),
                )
                .with_for_update()
            )

            if membership is None:
                raise GroupMemberNotFoundError(
                    "Group membership was not found."
                )

            group = self._get_group_for_update(
                group_id=membership.group_id,
            )
            self._require_owner(group=group, actor_id=actor_id)

            if membership.status not in (
                GroupMembershipStatus.PENDING,
                GroupMembershipStatus.ACTIVE,
            ):
                raise GroupValidationError(
                    "Only pending or active memberships can be removed."
                )

            membership.status = GroupMembershipStatus.REMOVED
            membership.left_at = utc_now()

            self.db.commit()
            self.db.refresh(membership)
            return membership

        except Exception:
            self.db.rollback()
            raise