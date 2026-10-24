import os
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from .database import get_db
from .models import AuditEvent, InstructorRequest, Role, Session, User, UserRole
from .schemas import LoginRequest, ProfileUpdate, RegisterRequest, SwitchRoleRequest, UserPublic
from .security import SESSION_COOKIE, digest_token, expires_at, hash_password, make_session_token, verify_password

router = APIRouter(prefix="/api/v1", tags=["accounts"])

def as_public(user: User) -> UserPublic:
    return UserPublic(
        id=user.id, full_name=user.full_name, email=user.email,
        roles=[item.role for item in user.roles], active_role=user.active_role,
        email_verified=user.email_verified, created_at=user.created_at,
    )

def require_origin(request: Request) -> None:
    # Applies to cookie-authenticated state-changing endpoints.
    origin = request.headers.get("origin")
    allowed = {x.strip() for x in os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",")}
    if origin and origin not in allowed:
        raise HTTPException(status_code=403, detail="Origin not allowed")
    # Browsers set Sec-Fetch-Site; deny cross-site requests regardless of Origin.
    if request.headers.get("sec-fetch-site") == "cross-site":
        raise HTTPException(status_code=403, detail="Cross-site request denied")

def get_current_user(request: Request, db: DbSession = Depends(get_db)) -> User:
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        raise HTTPException(status_code=401, detail="Authentication required")
    session = db.scalar(select(Session).where(Session.token_digest == digest_token(token), Session.revoked.is_(False)))
    if session is None:
        raise HTTPException(status_code=401, detail="Invalid session")
    expiry = session.expires_at.replace(tzinfo=timezone.utc) if session.expires_at.tzinfo is None else session.expires_at
    if expiry <= datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Session expired")
    user = db.get(User, session.user_id)
    if user is None or not user.is_active:
        raise HTTPException(status_code=403, detail="Account disabled")
    return user

@router.post("/auth/register", response_model=UserPublic, status_code=201)
def register(payload: RegisterRequest, db: DbSession = Depends(get_db)):
    email = str(payload.email).strip().lower()
    if db.scalar(select(User.id).where(User.email == email)) is not None:
        raise HTTPException(status_code=409, detail="Email already registered")
    user = User(full_name=payload.full_name.strip(), email=email, password_hash=hash_password(payload.password))
    user.roles.append(UserRole(role=Role.student))
    db.add(user)
    db.flush()
    if payload.instructor_application:
        db.add(InstructorRequest(user_id=user.id))
    db.add(AuditEvent(subject_id=user.id, action="account.registered"))
    db.commit()
    db.refresh(user)
    return as_public(user)

@router.post("/auth/login", response_model=UserPublic)
def login(payload: LoginRequest, response: Response, db: DbSession = Depends(get_db)):
    email = str(payload.email).strip().lower()
    user = db.scalar(select(User).where(User.email == email))
    # Deliberately use a generic failure for invalid credentials.
    if user is None or not verify_password(payload.password, user.password_hash) or not user.is_active:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = make_session_token()
    db.add(Session(user_id=user.id, token_digest=digest_token(token), expires_at=expires_at()))
    db.add(AuditEvent(actor_id=user.id, action="auth.login"))
    db.commit()
    response.set_cookie(SESSION_COOKIE, token, httponly=True, secure=os.getenv("COOKIE_SECURE", "true").lower() == "true", samesite="lax", max_age=12 * 3600, path="/")
    return as_public(user)

@router.post("/auth/logout", status_code=204)
def logout(request: Request, response: Response, db: DbSession = Depends(get_db)):
    require_origin(request)
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        record = db.scalar(select(Session).where(Session.token_digest == digest_token(token)))
        if record:
            record.revoked = True
            db.commit()
    response.delete_cookie(SESSION_COOKIE, path="/")
    return Response(status_code=204, headers={"set-cookie": f"{SESSION_COOKIE}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax"})

@router.get("/users/me", response_model=UserPublic)
def me(user: User = Depends(get_current_user)):
    return as_public(user)

@router.patch("/users/me", response_model=UserPublic)
def update_profile(payload: ProfileUpdate, request: Request, user: User = Depends(get_current_user), db: DbSession = Depends(get_db)):
    require_origin(request)
    user.full_name = payload.full_name.strip()
    db.add(AuditEvent(actor_id=user.id, subject_id=user.id, action="profile.updated"))
    db.commit()
    db.refresh(user)
    return as_public(user)

@router.post("/auth/active-role", response_model=UserPublic)
def switch_role(payload: SwitchRoleRequest, request: Request, user: User = Depends(get_current_user), db: DbSession = Depends(get_db)):
    require_origin(request)
    if payload.role not in [item.role for item in user.roles]:
        raise HTTPException(status_code=403, detail="Role not assigned")
    if payload.role == Role.administrator:
        raise HTTPException(status_code=403, detail="Administrator step-up authentication not implemented yet")
    user.active_role = payload.role
    db.add(AuditEvent(actor_id=user.id, subject_id=user.id, action="role.switched", detail=payload.role.value))
    db.commit()
    db.refresh(user)
    return as_public(user)
