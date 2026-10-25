"""Manager and administrator account decisions."""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func, or_, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DbSession

from .auth_state import AuthContext, authorize, get_auth_context, revoke_user_sessions
from .database import get_db
from .models import AuditEvent, InstructorRequest, Role, User, UserRole, utcnow
from .schemas import (AccountStatusRequest, AdminUserPublic, InstructorDecision,
                      InstructorRequestPublic, RoleChangeRequest)
from .security import require_origin

router = APIRouter(prefix="/api/v1", tags=["administration"])
PRIVILEGED = {Role.manager, Role.administrator}


def public_user(user: User) -> AdminUserPublic:
    return AdminUserPublic(id=user.id, full_name=user.full_name, email=user.email,
        roles=sorted((entry.role for entry in user.roles), key=lambda role: role.value),
        email_verified=user.email_verified, created_at=user.created_at, is_active=user.is_active)


def require_target_access(context: AuthContext, target: User, role: Role | None = None) -> None:
    authorize(context, PRIVILEGED, sensitive=True)
    if context.session.active_role == Role.manager:
        if role in {Role.manager, Role.administrator} or any(
            entry.role in {Role.manager, Role.administrator} for entry in target.roles
        ):
            raise HTTPException(status_code=403, detail="Managers cannot change privileged accounts or roles")


def lock_admin_changes(db: DbSession) -> None:
    if db.get_bind().dialect.name == "postgresql":
        db.execute(text("SELECT pg_advisory_xact_lock(4170101)"))


def protect_last_admin(db: DbSession, target: User) -> None:
    if Role.administrator not in {entry.role for entry in target.roles} or not target.is_active:
        return
    lock_admin_changes(db)
    count = db.scalar(select(func.count()).select_from(UserRole).join(User).where(
        UserRole.role == Role.administrator, User.is_active.is_(True))) or 0
    if count <= 1:
        raise HTTPException(status_code=409, detail="Cannot remove last active administrator")


def get_target(db: DbSession, user_id: str) -> User:
    target = db.get(User, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    return target


@router.get("/admin/users", response_model=list[AdminUserPublic])
def list_users(search: str | None = None, role: Role | None = None, active: bool | None = None,
               context: AuthContext = Depends(get_auth_context), db: DbSession = Depends(get_db)):
    authorize(context, PRIVILEGED)
    query = select(User)
    if search:
        term = f"%{search.strip()[:100]}%"
        query = query.where(or_(User.email.ilike(term), User.full_name.ilike(term)))
    if role:
        query = query.where(User.roles.any(UserRole.role == role))
    if active is not None:
        query = query.where(User.is_active.is_(active))
    if context.session.active_role == Role.manager:
        query = query.where(~User.roles.any(UserRole.role.in_([Role.manager, Role.administrator])))
    return [public_user(user) for user in db.scalars(query.order_by(User.created_at.desc()).limit(100))]


@router.post("/admin/users/{user_id}/suspend", response_model=AdminUserPublic)
def suspend_user(user_id: str, payload: AccountStatusRequest, request: Request,
                 context: AuthContext = Depends(get_auth_context), db: DbSession = Depends(get_db)):
    require_origin(request)
    target = get_target(db, user_id)
    require_target_access(context, target)
    protect_last_admin(db, target)
    target.is_active = False
    revoke_user_sessions(db, target.id)
    db.add(AuditEvent(actor_id=context.user.id, subject_id=target.id, action="account.suspended", detail=payload.reason))
    db.commit()
    return public_user(target)


@router.post("/admin/users/{user_id}/reactivate", response_model=AdminUserPublic)
def reactivate_user(user_id: str, payload: AccountStatusRequest, request: Request,
                    context: AuthContext = Depends(get_auth_context), db: DbSession = Depends(get_db)):
    require_origin(request)
    target = get_target(db, user_id)
    require_target_access(context, target)
    target.is_active = True
    db.add(AuditEvent(actor_id=context.user.id, subject_id=target.id, action="account.reactivated", detail=payload.reason))
    db.commit()
    return public_user(target)


@router.post("/admin/users/{user_id}/roles", response_model=AdminUserPublic)
def grant_role(user_id: str, payload: RoleChangeRequest, request: Request,
               context: AuthContext = Depends(get_auth_context), db: DbSession = Depends(get_db)):
    require_origin(request)
    target = get_target(db, user_id)
    require_target_access(context, target, payload.role)
    if payload.role == Role.administrator:
        lock_admin_changes(db)
    if payload.role in {Role.instructor, Role.manager, Role.administrator} and not target.email_verified:
        raise HTTPException(status_code=409, detail="Verified email required for privileged role")
    if payload.role in {entry.role for entry in target.roles}:
        raise HTTPException(status_code=409, detail="Role already assigned")
    target.roles.append(UserRole(role=payload.role))
    revoke_user_sessions(db, target.id)
    db.add(AuditEvent(actor_id=context.user.id, subject_id=target.id,
                      action="role.granted", detail=f"{payload.role.value}: {payload.reason}"[:500]))
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Role already assigned") from exc
    return public_user(target)


@router.delete("/admin/users/{user_id}/roles/{role}", response_model=AdminUserPublic)
def revoke_role(user_id: str, role: Role, payload: AccountStatusRequest, request: Request,
                context: AuthContext = Depends(get_auth_context), db: DbSession = Depends(get_db)):
    require_origin(request)
    target = get_target(db, user_id)
    require_target_access(context, target, role)
    assigned = next((entry for entry in target.roles if entry.role == role), None)
    if assigned is None:
        raise HTTPException(status_code=404, detail="Role not assigned")
    if role == Role.administrator:
        protect_last_admin(db, target)
    if role == Role.student and Role.administrator in {entry.role for entry in target.roles}:
        raise HTTPException(status_code=409, detail="Administrator must retain Student fallback role")
    if len(target.roles) == 1:
        raise HTTPException(status_code=409, detail="Account must retain a role")
    target.roles.remove(assigned)
    revoke_user_sessions(db, target.id)
    db.add(AuditEvent(actor_id=context.user.id, subject_id=target.id,
                      action="role.revoked", detail=f"{role.value}: {payload.reason}"[:500]))
    db.commit()
    return public_user(target)


@router.get("/admin/instructor-applications", response_model=list[InstructorRequestPublic])
def list_instructor_requests(status: str | None = None,
                             context: AuthContext = Depends(get_auth_context), db: DbSession = Depends(get_db)):
    authorize(context, PRIVILEGED)
    query = select(InstructorRequest)
    if status:
        if status not in {"pending", "approved", "rejected"}:
            raise HTTPException(status_code=422, detail="Invalid status")
        query = query.where(InstructorRequest.status == status)
    records = db.scalars(query.order_by(InstructorRequest.created_at.desc()).limit(100)).all()
    return [InstructorRequestPublic.model_validate(record, from_attributes=True) for record in records]


def decide_request(application_id: str, decision: str, payload: InstructorDecision,
                   context: AuthContext, db: DbSession) -> InstructorRequestPublic:
    authorize(context, PRIVILEGED, sensitive=True)
    application = db.scalar(select(InstructorRequest).where(InstructorRequest.id == application_id).with_for_update())
    if application is None:
        raise HTTPException(status_code=404, detail="Application not found")
    if application.status != "pending":
        raise HTTPException(status_code=409, detail="Application already decided")
    if application.user_id == context.user.id:
        raise HTTPException(status_code=403, detail="Cannot decide own application")
    target = get_target(db, application.user_id)
    require_target_access(context, target)
    if not target.is_active:
        raise HTTPException(status_code=409, detail="Applicant account is inactive")
    if not target.email_verified:
        raise HTTPException(status_code=409, detail="Applicant email is not verified")
    if decision == "approved" and Role.instructor not in {entry.role for entry in target.roles}:
        target.roles.append(UserRole(role=Role.instructor))
        revoke_user_sessions(db, target.id)
    application.status = decision
    application.decided_at = utcnow()
    application.decided_by = context.user.id
    application.reason = payload.reason
    db.add(AuditEvent(actor_id=context.user.id, subject_id=target.id,
                      action=f"instructor.{decision}", detail=payload.reason))
    db.commit()
    return InstructorRequestPublic.model_validate(application, from_attributes=True)


@router.post("/admin/instructor-applications/{application_id}/approve", response_model=InstructorRequestPublic)
def approve_instructor(application_id: str, payload: InstructorDecision, request: Request,
                       context: AuthContext = Depends(get_auth_context), db: DbSession = Depends(get_db)):
    require_origin(request)
    return decide_request(application_id, "approved", payload, context, db)


@router.post("/admin/instructor-applications/{application_id}/reject", response_model=InstructorRequestPublic)
def reject_instructor(application_id: str, payload: InstructorDecision, request: Request,
                      context: AuthContext = Depends(get_auth_context), db: DbSession = Depends(get_db)):
    require_origin(request)
    return decide_request(application_id, "rejected", payload, context, db)
