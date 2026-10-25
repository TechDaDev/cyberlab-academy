"""Self-service identity, session, recovery, and MFA endpoints."""
import os
import secrets
from datetime import timedelta

import pyotp
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DbSession

from .auth_state import AuthContext, get_auth_context, revoke_user_sessions, rotate_session, set_session_cookie
from .database import get_db
from .mail import send_link
from .models import AuditEvent, InstructorRequest, MFAEnrollment, MFARecoveryCode, OneTimeToken, Role, Session, User, UserRole
from .schemas import (ChangeEmailRequest, ChangePasswordRequest, EmailRequest, LoginRequest,
                      MFAConfirmRequest, MFAEnrollRequest, MFAEnrollResponse, MFARecoveryCodes,
                      Message, ProfileUpdate, ReauthenticateRequest, RegisterRequest,
                      ResetPasswordRequest, SessionPublic, SwitchRoleRequest,
                      TokenRequest, UserPublic)
from .security import (SESSION_COOKIE, aware, check_rate_limit, consume_mfa, decrypt_secret,
                       digest_token, encrypt_secret, expires_at, hash_password,
                       hash_password_guarded, make_session_token, normalize_email, now,
                       recovery_digest, require_origin, require_strong_password, verify_password,
                       verify_password_guarded, verify_totp)

router = APIRouter(prefix="/api/v1", tags=["accounts"])
DUMMY_HASH = hash_password("Dummy-only-password-2026!")


def as_public(user: User, session: Session | None = None) -> UserPublic:
    return UserPublic(
        id=user.id, full_name=user.full_name, email=user.email,
        roles=sorted((item.role for item in user.roles), key=lambda role: role.value),
        active_role=session.active_role if session else Role.student,
        email_verified=user.email_verified, created_at=user.created_at,
    )


def issue_token(db: DbSession, user: User, kind: str, minutes: int, target_email: str | None = None) -> str:
    issued = now()
    for prior in db.scalars(select(OneTimeToken).where(
        OneTimeToken.user_id == user.id, OneTimeToken.kind == kind,
        OneTimeToken.consumed_at.is_(None))):
        prior.consumed_at = issued
    raw = secrets.token_urlsafe(32)
    db.add(OneTimeToken(user_id=user.id, kind=kind, token_digest=digest_token(raw),
                        target_email=target_email, expires_at=issued + timedelta(minutes=minutes)))
    return raw


def valid_token(db: DbSession, raw: str, kinds: tuple[str, ...]) -> OneTimeToken:
    record = db.scalar(select(OneTimeToken).where(
        OneTimeToken.token_digest == digest_token(raw), OneTimeToken.kind.in_(kinds)))
    if record is None or record.consumed_at is not None or aware(record.expires_at) <= now():
        raise HTTPException(status_code=400, detail="Invalid or expired token")
    # Claim the token atomically so concurrent submissions cannot both succeed.
    claimed = db.execute(update(OneTimeToken).where(
        OneTimeToken.id == record.id, OneTimeToken.consumed_at.is_(None),
        OneTimeToken.expires_at > now()).values(consumed_at=now())
        .execution_options(synchronize_session=False))
    if claimed.rowcount != 1:
        raise HTTPException(status_code=400, detail="Invalid or expired token")
    return record


@router.post("/auth/register", response_model=Message, status_code=202)
def register(payload: RegisterRequest, request: Request, background_tasks: BackgroundTasks,
             db: DbSession = Depends(get_db)):
    require_origin(request)
    email = normalize_email(str(payload.email))
    check_rate_limit(db, request, "register_ip", limit=20, seconds=3600, trusted_client_only=True)
    check_rate_limit(db, request, "register", email, limit=5, seconds=3600)
    check_rate_limit(db, request, "register_account", email, limit=5, seconds=3600, client_scoped=False)
    full_name = payload.full_name.strip()
    if len(full_name) < 2:
        raise HTTPException(status_code=422, detail="Full name must contain at least 2 characters")
    require_strong_password(payload.password, email=email, full_name=full_name)
    if db.scalar(select(User.id).where(User.email == email)) is None:
        user = User(full_name=full_name, email=email, password_hash=hash_password_guarded(payload.password))
        user.roles.append(UserRole(role=Role.student))
        db.add(user)
        try:
            db.flush()
        except IntegrityError:
            db.rollback()  # Concurrent duplicate signup gets the same public response.
            return Message(message="If eligible, check your email for verification")
        if payload.instructor_application:
            db.add(InstructorRequest(user_id=user.id))
        token = issue_token(db, user, "verify_email", 60)
        db.add(AuditEvent(subject_id=user.id, action="account.registered"))
        db.commit()
        # Delivery runs after the response so callers cannot measure account existence.
        background_tasks.add_task(send_link, email, "verify_email", token)
    else:
        # Keep response shape and hashing cost similar for an existing account.
        hash_password_guarded(payload.password)
    return Message(message="If eligible, check your email for verification")


@router.post("/auth/verification/resend", response_model=Message)
def resend_verification(payload: EmailRequest, request: Request, background_tasks: BackgroundTasks,
                        db: DbSession = Depends(get_db)):
    require_origin(request)
    email = normalize_email(str(payload.email))
    check_rate_limit(db, request, "verify_resend", email, limit=3, seconds=3600)
    check_rate_limit(db, request, "verify_resend_account", email, limit=5, seconds=3600, client_scoped=False)
    user = db.scalar(select(User).where(User.email == email))
    if user and not user.email_verified:
        token = issue_token(db, user, "verify_email", 60)
        db.add(AuditEvent(subject_id=user.id, action="email.verification_requested"))
        db.commit()
        background_tasks.add_task(send_link, email, "verify_email", token)
    return Message(message="If eligible, a verification email has been sent")


@router.post("/auth/verify-email", response_model=Message)
def verify_email(payload: TokenRequest, request: Request, db: DbSession = Depends(get_db)):
    require_origin(request)
    check_rate_limit(db, request, "verify_token", digest_token(payload.token),
                     limit=10, seconds=300, client_scoped=False)
    record = valid_token(db, payload.token, ("verify_email", "change_email"))
    user = db.get(User, record.user_id)
    if user is None:
        raise HTTPException(status_code=400, detail="Invalid or expired token")
    if record.kind == "change_email":
        if db.scalar(select(User.id).where(User.email == record.target_email, User.id != user.id)):
            raise HTTPException(status_code=409, detail="Email unavailable")
        user.email = record.target_email
        revoke_user_sessions(db, user.id)
        action = "email.changed"
    else:
        action = "email.verified"
    user.email_verified = True
    db.add(AuditEvent(subject_id=user.id, action=action))
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Email unavailable") from exc
    return Message(message="Email verified")


@router.post("/auth/login", response_model=UserPublic)
def login(payload: LoginRequest, request: Request, response: Response, db: DbSession = Depends(get_db)):
    require_origin(request)
    email = normalize_email(str(payload.email))
    # No pre-authentication bucket gates this endpoint: every identity it could key on is
    # either shared with unrelated users (an unverified proxy address) or client-invented.
    # Credential-abuse throttles are charged on failures below, and hashing cost is
    # bounded by concurrency admission control instead of a counted lockout window.
    user = db.scalar(select(User).where(User.email == email))
    valid = verify_password_guarded(payload.password, user.password_hash if user else DUMMY_HASH)
    if user is None or not valid or not user.is_active:
        # Only failed attempts consume the credential throttles, so a caller who cannot
        # authenticate can never lock unrelated accounts out of the login endpoint.
        check_rate_limit(db, request, "login", email, limit=8, seconds=300)
        check_rate_limit(db, request, "login_account", email, limit=20, seconds=900, client_scoped=False)
        check_rate_limit(db, request, "login_ip_failures", "", limit=20, seconds=300,
                         trusted_client_only=True)
        check_rate_limit(db, request, "login_global", "", limit=5000, seconds=300, client_scoped=False)
        db.add(AuditEvent(subject_id=user.id if user else None, action="auth.login_failed"))
        db.commit()
        raise HTTPException(status_code=401, detail="Invalid credentials")
    assigned = {entry.role for entry in user.roles}
    if not assigned:
        db.add(AuditEvent(subject_id=user.id, action="auth.login_failed"))
        db.commit()
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = make_session_token()
    session = Session(user_id=user.id, token_digest=digest_token(token),
                      active_role=Role.student if Role.student in assigned else sorted(assigned, key=lambda item: item.value)[0],
                      expires_at=expires_at())
    db.add(session)
    db.add(AuditEvent(actor_id=user.id, action="auth.login"))
    db.commit()
    set_session_cookie(response, token)
    return as_public(user, session)


@router.post("/auth/reauthenticate", response_model=UserPublic)
def reauthenticate(payload: ReauthenticateRequest, request: Request, response: Response,
                   context: AuthContext = Depends(get_auth_context), db: DbSession = Depends(get_db)):
    require_origin(request)
    check_rate_limit(db, request, "reauth", context.user.email, limit=5, seconds=300)
    if not verify_password(payload.password, context.user.password_hash):
        db.add(AuditEvent(actor_id=context.user.id, action="auth.reauthentication_failed"))
        db.commit()
        raise HTTPException(status_code=401, detail="Invalid credentials")
    enrollment = db.scalar(select(MFAEnrollment).where(MFAEnrollment.user_id == context.user.id).with_for_update())
    if payload.mfa_code:
        if enrollment is None or not enrollment.enabled or not consume_mfa(db, enrollment, payload.mfa_code):
            db.add(AuditEvent(actor_id=context.user.id, action="auth.mfa_failed"))
            db.commit()
            raise HTTPException(status_code=401, detail="Invalid MFA code")
        context.session.mfa_verified_at = now()
    else:
        context.session.mfa_verified_at = None
        if context.session.active_role == Role.administrator:
            context.session.active_role = Role.student
    context.session.authenticated_at = now()
    rotate_session(context, response)
    db.add(AuditEvent(actor_id=context.user.id, action="auth.reauthenticated"))
    db.commit()
    return as_public(context.user, context.session)


@router.post("/auth/logout", status_code=204)
def logout(request: Request, response: Response, db: DbSession = Depends(get_db)):
    require_origin(request)
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        record = db.scalar(select(Session).where(Session.token_digest == digest_token(token)))
        if record:
            record.revoked = True
            db.add(AuditEvent(actor_id=record.user_id, action="auth.logout"))
            db.commit()
    response.delete_cookie(SESSION_COOKIE, path="/")
    response.status_code = 204
    return response


@router.post("/auth/logout-all", status_code=204)
def logout_all(request: Request, response: Response, context: AuthContext = Depends(get_auth_context), db: DbSession = Depends(get_db)):
    require_origin(request)
    revoke_user_sessions(db, context.user.id)
    db.add(AuditEvent(actor_id=context.user.id, action="auth.logout_all"))
    db.commit()
    response.delete_cookie(SESSION_COOKIE, path="/")
    response.status_code = 204
    return response


@router.get("/users/me", response_model=UserPublic)
def me(context: AuthContext = Depends(get_auth_context)):
    return as_public(context.user, context.session)


@router.patch("/users/me", response_model=UserPublic)
def update_profile(payload: ProfileUpdate, request: Request, context: AuthContext = Depends(get_auth_context),
                   db: DbSession = Depends(get_db)):
    require_origin(request)
    full_name = payload.full_name.strip()
    if len(full_name) < 2:
        raise HTTPException(status_code=422, detail="Full name must contain at least 2 characters")
    context.user.full_name = full_name
    db.add(AuditEvent(actor_id=context.user.id, subject_id=context.user.id, action="profile.updated"))
    db.commit()
    return as_public(context.user, context.session)


@router.get("/users/me/roles", response_model=list[Role])
def assigned_roles(context: AuthContext = Depends(get_auth_context)):
    return sorted((entry.role for entry in context.user.roles), key=lambda role: role.value)


@router.post("/auth/active-role", response_model=UserPublic)
def switch_role(payload: SwitchRoleRequest, request: Request, response: Response,
                context: AuthContext = Depends(get_auth_context), db: DbSession = Depends(get_db)):
    require_origin(request)
    if payload.role not in {entry.role for entry in context.user.roles}:
        raise HTTPException(status_code=403, detail="Role not assigned")
    if payload.role in {Role.manager, Role.administrator}:
        if aware(context.session.authenticated_at) < now() - timedelta(minutes=5):
            raise HTTPException(status_code=403, detail="Recent authentication required")
    if payload.role == Role.administrator or (payload.role == Role.manager and
        os.getenv("MANAGER_MFA_REQUIRED", "false").lower() == "true"):
        enrollment = db.get(MFAEnrollment, context.user.id)
        if enrollment is None or not enrollment.enabled or context.session.mfa_verified_at is None or \
           aware(context.session.mfa_verified_at) < now() - timedelta(minutes=5):
            raise HTTPException(status_code=403, detail="Recent MFA required")
    context.session.active_role = payload.role
    rotate_session(context, response)
    db.add(AuditEvent(actor_id=context.user.id, subject_id=context.user.id,
                      action="role.switched", detail=payload.role.value))
    db.commit()
    return as_public(context.user, context.session)


@router.get("/users/me/sessions", response_model=list[SessionPublic])
def list_sessions(context: AuthContext = Depends(get_auth_context), db: DbSession = Depends(get_db)):
    records = db.scalars(select(Session).where(Session.user_id == context.user.id,
        Session.revoked.is_(False), Session.expires_at > now()).order_by(Session.created_at.desc())).all()
    return [SessionPublic(id=record.id, active_role=record.active_role,
            created_at=record.created_at, expires_at=record.expires_at,
            current=record.id == context.session.id,
            mfa_verified=record.mfa_verified_at is not None) for record in records]


@router.delete("/users/me/sessions/{session_id}", status_code=204)
def revoke_session(session_id: str, request: Request, response: Response,
                   context: AuthContext = Depends(get_auth_context), db: DbSession = Depends(get_db)):
    require_origin(request)
    record = db.scalar(select(Session).where(Session.id == session_id, Session.user_id == context.user.id).with_for_update())
    if record is None:
        raise HTTPException(status_code=404, detail="Session not found")
    record.revoked = True
    db.add(AuditEvent(actor_id=context.user.id, action="auth.session_revoked", detail=session_id))
    db.commit()
    if record.id == context.session.id:
        response.delete_cookie(SESSION_COOKIE, path="/")
    response.status_code = 204
    return response


@router.post("/users/me/password", status_code=204)
def change_password(payload: ChangePasswordRequest, request: Request, response: Response,
                    context: AuthContext = Depends(get_auth_context), db: DbSession = Depends(get_db)):
    require_origin(request)
    check_rate_limit(db, request, "change_password", context.user.email, limit=5, seconds=3600)
    if not verify_password(payload.current_password, context.user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    require_strong_password(payload.new_password, email=context.user.email, full_name=context.user.full_name)
    context.user.password_hash = hash_password(payload.new_password)
    revoke_user_sessions(db, context.user.id)
    db.add(AuditEvent(actor_id=context.user.id, subject_id=context.user.id, action="password.changed"))
    db.commit()
    response.delete_cookie(SESSION_COOKIE, path="/")
    response.status_code = 204
    return response


@router.post("/users/me/email", response_model=Message)
def change_email(payload: ChangeEmailRequest, request: Request, background_tasks: BackgroundTasks,
                 context: AuthContext = Depends(get_auth_context), db: DbSession = Depends(get_db)):
    require_origin(request)
    check_rate_limit(db, request, "change_email", context.user.email, limit=3, seconds=3600)
    if not verify_password(payload.password, context.user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    new_email = normalize_email(str(payload.new_email))
    if db.scalar(select(User.id).where(User.email == new_email)) is None:
        token = issue_token(db, context.user, "change_email", 60, new_email)
        db.add(AuditEvent(actor_id=context.user.id, subject_id=context.user.id, action="email.change_requested"))
        db.commit()
        background_tasks.add_task(send_link, new_email, "verify_email", token)
    return Message(message="If eligible, check the new email address")


@router.post("/auth/forgot-password", response_model=Message)
def forgot_password(payload: EmailRequest, request: Request, background_tasks: BackgroundTasks,
                    db: DbSession = Depends(get_db)):
    require_origin(request)
    email = normalize_email(str(payload.email))
    check_rate_limit(db, request, "forgot_ip", limit=20, seconds=3600, trusted_client_only=True)
    check_rate_limit(db, request, "forgot_password", email, limit=3, seconds=3600)
    check_rate_limit(db, request, "forgot_account", email, limit=5, seconds=3600, client_scoped=False)
    user = db.scalar(select(User).where(User.email == email))
    if user and user.is_active:
        token = issue_token(db, user, "reset_password", 30)
        db.add(AuditEvent(subject_id=user.id, action="password.reset_requested"))
        db.commit()
        background_tasks.add_task(send_link, email, "reset_password", token)
    return Message(message="If the account exists, a reset email has been sent")


@router.post("/auth/reset-password", response_model=Message)
def reset_password(payload: ResetPasswordRequest, request: Request, db: DbSession = Depends(get_db)):
    require_origin(request)
    check_rate_limit(db, request, "reset_password", digest_token(payload.token),
                     limit=8, seconds=300, client_scoped=False)
    record = valid_token(db, payload.token, ("reset_password",))
    user = db.get(User, record.user_id)
    if user is None or not user.is_active:
        raise HTTPException(status_code=400, detail="Invalid or expired token")
    require_strong_password(payload.password, email=user.email, full_name=user.full_name)
    user.password_hash = hash_password_guarded(payload.password)
    revoke_user_sessions(db, user.id)
    db.add(AuditEvent(subject_id=user.id, action="password.reset"))
    db.commit()
    return Message(message="Password reset complete. Sign in again")


@router.post("/auth/mfa/enroll", response_model=MFAEnrollResponse)
def enroll_mfa(payload: MFAEnrollRequest, request: Request,
               context: AuthContext = Depends(get_auth_context), db: DbSession = Depends(get_db)):
    require_origin(request)
    if aware(context.session.authenticated_at) < now() - timedelta(minutes=5):
        raise HTTPException(status_code=403, detail="Recent authentication required")
    check_rate_limit(db, request, "mfa_enroll", context.user.email, limit=5, seconds=300)
    if not verify_password(payload.password, context.user.password_hash):
        db.add(AuditEvent(actor_id=context.user.id, action="auth.mfa_enrollment_failed"))
        db.commit()
        raise HTTPException(status_code=401, detail="Invalid credentials")
    existing = db.get(MFAEnrollment, context.user.id)
    if existing and existing.enabled:
        raise HTTPException(status_code=409, detail="MFA already enabled")
    secret = pyotp.random_base32()
    if existing:
        existing.secret_encrypted = encrypt_secret(secret)
        existing.last_counter = -1
    else:
        db.add(MFAEnrollment(user_id=context.user.id, secret_encrypted=encrypt_secret(secret)))
    db.add(AuditEvent(actor_id=context.user.id, action="mfa.enrollment_started"))
    db.commit()
    return MFAEnrollResponse(secret=secret,
        otpauth_uri=pyotp.TOTP(secret).provisioning_uri(name=context.user.email, issuer_name="CyberLab Academy"))


@router.post("/auth/mfa/confirm", response_model=MFARecoveryCodes)
def confirm_mfa(payload: MFAConfirmRequest, request: Request, response: Response,
                context: AuthContext = Depends(get_auth_context), db: DbSession = Depends(get_db)):
    require_origin(request)
    enrollment = db.scalar(select(MFAEnrollment).where(MFAEnrollment.user_id == context.user.id).with_for_update())
    if enrollment is None or enrollment.enabled or not verify_totp(enrollment, payload.code):
        raise HTTPException(status_code=400, detail="Invalid MFA enrollment code")
    enrollment.enabled = True
    codes = [secrets.token_urlsafe(18) for _ in range(8)]
    for code in codes:
        db.add(MFARecoveryCode(user_id=context.user.id, code_digest=recovery_digest(code)))
    context.session.mfa_verified_at = now()
    context.session.authenticated_at = now()
    rotate_session(context, response)
    # A new second factor must not leave older password-only sessions usable.
    revoke_user_sessions(db, context.user.id, except_id=context.session.id)
    db.add(AuditEvent(actor_id=context.user.id, action="mfa.enabled"))
    db.commit()
    return MFARecoveryCodes(recovery_codes=codes)
