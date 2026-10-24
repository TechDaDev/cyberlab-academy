"""Authenticated session state and reusable authorization checks."""
import os
from dataclasses import dataclass
from datetime import timedelta

from fastapi import Depends, HTTPException, Request, Response, Security
from fastapi.security import APIKeyCookie
from sqlalchemy import select, update
from sqlalchemy.orm import Session as DbSession

from .database import get_db
from .models import MFAEnrollment, Role, Session, User
from .security import SESSION_COOKIE, aware, digest_token, make_session_token, now

cookie_scheme = APIKeyCookie(name=SESSION_COOKIE, auto_error=False,
                             description="Opaque server-side session cookie; set by login")


@dataclass
class AuthContext:
    user: User
    session: Session


def get_auth_context(request: Request, token: str | None = Security(cookie_scheme),
                     db: DbSession = Depends(get_db)) -> AuthContext:
    if not token:
        raise HTTPException(status_code=401, detail="Authentication required")
    session = db.scalar(select(Session).where(
        Session.token_digest == digest_token(token), Session.revoked.is_(False)))
    if session is None or aware(session.expires_at) <= now():
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    user = db.get(User, session.user_id)
    if user is None or not user.is_active:
        raise HTTPException(status_code=403, detail="Account disabled")
    if session.active_role not in {entry.role for entry in user.roles}:
        session.revoked = True
        db.commit()
        raise HTTPException(status_code=403, detail="Active role revoked")
    if session.active_role == Role.administrator:
        enrollment = db.get(MFAEnrollment, user.id)
        if enrollment is None or not enrollment.enabled or session.mfa_verified_at is None:
            raise HTTPException(status_code=403, detail="Administrator MFA required")
    if session.active_role == Role.manager and os.getenv("MANAGER_MFA_REQUIRED", "false").lower() == "true":
        enrollment = db.get(MFAEnrollment, user.id)
        if enrollment is None or not enrollment.enabled or session.mfa_verified_at is None:
            raise HTTPException(status_code=403, detail="Manager MFA required")
    return AuthContext(user=user, session=session)


def authorize(context: AuthContext, allowed: set[Role], *, sensitive: bool = False) -> None:
    if context.session.active_role not in allowed:
        raise HTTPException(status_code=403, detail="Insufficient role")
    if sensitive and aware(context.session.authenticated_at) < now() - timedelta(minutes=5):
        raise HTTPException(status_code=403, detail="Recent authentication required")
    if sensitive and context.session.active_role == Role.administrator:
        if context.session.mfa_verified_at is None or aware(context.session.mfa_verified_at) < now() - timedelta(minutes=5):
            raise HTTPException(status_code=403, detail="Recent MFA required")


def require_verified_email(context: AuthContext) -> None:
    """Use on future formally assessed mission endpoints."""
    if not context.user.email_verified:
        raise HTTPException(status_code=403, detail="Verified email required")


def set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        SESSION_COOKIE, token, httponly=True,
        secure=os.getenv("COOKIE_SECURE", "true").lower() == "true",
        samesite="lax", max_age=12 * 3600, path="/",
    )


def rotate_session(context: AuthContext, response: Response) -> None:
    token = make_session_token()
    context.session.token_digest = digest_token(token)
    set_session_cookie(response, token)


def revoke_user_sessions(db: DbSession, user_id: str, *, except_id: str | None = None) -> None:
    query = update(Session).where(Session.user_id == user_id, Session.revoked.is_(False))
    if except_id:
        query = query.where(Session.id != except_id)
    db.execute(query.values(revoked=True))
