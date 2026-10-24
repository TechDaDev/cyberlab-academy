from datetime import datetime
from pydantic import BaseModel, EmailStr, Field
from .models import Role

class RegisterRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=160)
    email: EmailStr
    password: str = Field(min_length=12, max_length=128)
    instructor_application: bool = False

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

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

class ProfileUpdate(BaseModel):
    full_name: str = Field(min_length=2, max_length=160)
