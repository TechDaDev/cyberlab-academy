"""One-time local administrator creation. Run: python -m app.bootstrap_admin --email ... --full-name ..."""
import argparse
import getpass

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session as DbSession

from .database import SessionLocal
from .models import AuditEvent, Role, User, UserRole
from .security import fernet, hash_password, normalize_email, require_strong_password


def bootstrap_admin(db: DbSession, *, email: str, full_name: str, password: str) -> User:
    # Configuration must support MFA before any administrator is created.
    fernet()
    address = normalize_email(email)
    require_strong_password(password, email=address, full_name=full_name)
    if db.get_bind().dialect.name == "postgresql":
        db.execute(text("SELECT pg_advisory_xact_lock(4170101)"))
    existing = db.scalar(select(func.count()).select_from(UserRole).where(UserRole.role == Role.administrator)) or 0
    if existing or db.scalar(select(User.id).where(User.email == address)):
        raise ValueError("Administrator bootstrap already completed or email exists")
    user = User(full_name=full_name.strip(), email=address, password_hash=hash_password(password), email_verified=True)
    user.roles.extend((UserRole(role=Role.student), UserRole(role=Role.administrator)))
    db.add(user)
    db.flush()
    db.add(AuditEvent(subject_id=user.id, action="administrator.bootstrapped"))
    db.commit()
    return user


def main() -> None:
    parser = argparse.ArgumentParser(description="One-time local Administrator bootstrap")
    parser.add_argument("--email", required=True)
    parser.add_argument("--full-name", required=True)
    args = parser.parse_args()
    password = getpass.getpass("New administrator password: ")
    confirmation = getpass.getpass("Confirm password: ")
    if password != confirmation:
        raise SystemExit("Passwords do not match")
    with SessionLocal() as db:
        try:
            user = bootstrap_admin(db, email=args.email, full_name=args.full_name, password=password)
        except ValueError as exc:
            raise SystemExit(str(exc)) from exc
    print(f"Administrator created: {user.email}. Enroll MFA before activating Administrator role.")


if __name__ == "__main__":
    main()
