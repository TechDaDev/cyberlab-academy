"""Versioned request and response shapes for account APIs."""
from datetime import datetime
from pydantic import BaseModel, EmailStr, Field, model_validator

from .models import Role


class RegisterRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=160)
    email: EmailStr
    password: str = Field(min_length=12, max_length=128)
    password_confirmation: str
    instructor_application: bool = False

    @model_validator(mode="after")
    def passwords_match(self):
        if self.password != self.password_confirmation:
            raise ValueError("Passwords do not match")
        return self


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class EmailRequest(BaseModel):
    email: EmailStr


class TokenRequest(BaseModel):
    token: str = Field(min_length=20, max_length=200)


class ResetPasswordRequest(TokenRequest):
    password: str = Field(min_length=12, max_length=128)
    password_confirmation: str

    @model_validator(mode="after")
    def passwords_match(self):
        if self.password != self.password_confirmation:
            raise ValueError("Passwords do not match")
        return self


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=12, max_length=128)
    new_password_confirmation: str

    @model_validator(mode="after")
    def passwords_match(self):
        if self.new_password != self.new_password_confirmation:
            raise ValueError("Passwords do not match")
        return self


class ChangeEmailRequest(BaseModel):
    new_email: EmailStr
    password: str


class ReauthenticateRequest(BaseModel):
    password: str
    mfa_code: str | None = None


class MFAConfirmRequest(BaseModel):
    code: str


class MFAEnrollResponse(BaseModel):
    secret: str
    otpauth_uri: str


class MFARecoveryCodes(BaseModel):
    recovery_codes: list[str]


class SwitchRoleRequest(BaseModel):
    role: Role


class UserPublic(BaseModel):
    id: str
    full_name: str
    email: EmailStr
    roles: list[Role]
    active_role: Role
    email_verified: bool
    created_at: datetime


class AdminUserPublic(BaseModel):
    id: str
    full_name: str
    email: EmailStr
    roles: list[Role]
    email_verified: bool
    created_at: datetime
    is_active: bool


class ProfileUpdate(BaseModel):
    full_name: str = Field(min_length=2, max_length=160)


class SessionPublic(BaseModel):
    id: str
    active_role: Role
    created_at: datetime
    expires_at: datetime
    current: bool
    mfa_verified: bool


class InstructorRequestPublic(BaseModel):
    id: str
    user_id: str
    status: str
    created_at: datetime
    decided_at: datetime | None
    decided_by: str | None
    reason: str


class InstructorDecision(BaseModel):
    reason: str = Field(min_length=3, max_length=500)


class RoleChangeRequest(BaseModel):
    role: Role
    reason: str = Field(min_length=3, max_length=500)


class AccountStatusRequest(BaseModel):
    reason: str = Field(min_length=3, max_length=500)


class Message(BaseModel):
    message: str
