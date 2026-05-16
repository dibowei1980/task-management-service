from functools import wraps
from typing import Any, Dict, List, Optional, Union

from flask import request
from pydantic import BaseModel, Field, field_validator, model_validator

from api.utils import api_error


class ProjectCreateBody(BaseModel):
    project_id: Optional[str] = Field(default=None, max_length=64)
    task_type: str = Field(default="BRIDGE_REMOVAL_BATCH", pattern=r"^BRIDGE_REMOVAL_(BATCH|UNIT)$")
    task_name: str = Field(default="", max_length=256)
    name: Optional[str] = Field(default=None, max_length=256)
    category: str = Field(default="PROJECT", pattern=r"^(PROJECT|UNIT|SYSTEM_TASK)$")
    priority: int = Field(default=1, ge=1, le=10)
    status: str = Field(default="PENDING", pattern=r"^PENDING|RECEIVED|IN_PROGRESS|COMPLETED|FAILED$")
    input_params: Optional[Union[Dict[str, Any], str]] = Field(default=None)
    department_id: Optional[str] = Field(default=None, max_length=64)
    department_name: Optional[str] = Field(default=None, max_length=128)
    project_leader_id: Optional[str] = Field(default=None, max_length=64)
    assignee_id: Optional[str] = Field(default=None, max_length=64)
    created_by_name: Optional[str] = Field(default=None, max_length=128)
    created_department_id: Optional[str] = Field(default=None, max_length=64)
    created_department_name: Optional[str] = Field(default=None, max_length=128)
    external_system: Optional[str] = Field(default=None, max_length=64)
    external_task_id: Optional[str] = Field(default=None, max_length=64)
    external_url: Optional[str] = Field(default=None, max_length=512)
    operator_ids: Optional[List[str]] = Field(default=None)
    inspector_ids: Optional[List[str]] = Field(default=None)
    parent_task_id: Optional[str] = Field(default=None, max_length=64)

    @model_validator(mode="after")
    def resolve_name(self):
        if not self.task_name and self.name:
            self.task_name = self.name
        if not self.name and self.task_name:
            self.name = self.task_name
        return self


class ProjectUpdateBody(BaseModel):
    name: Optional[str] = Field(default=None, max_length=256)
    task_name: Optional[str] = Field(default=None, max_length=256)
    status: Optional[str] = Field(default=None, pattern=r"^PENDING|RECEIVED|IN_PROGRESS|COMPLETED|FAILED|CANCELLED$")
    priority: Optional[int] = Field(default=None, ge=1, le=10)
    assignee_id: Optional[str] = Field(default=None, max_length=64)
    project_leader_id: Optional[str] = Field(default=None, max_length=64)
    department_id: Optional[str] = Field(default=None, max_length=64)
    department_name: Optional[str] = Field(default=None, max_length=128)
    operator_ids: Optional[List[str]] = Field(default=None)
    inspector_ids: Optional[List[str]] = Field(default=None)
    progress: Optional[int] = Field(default=None, ge=0, le=100)
    output_results: Optional[str] = Field(default=None)
    created_by_name: Optional[str] = Field(default=None, max_length=128)
    created_department_id: Optional[str] = Field(default=None, max_length=64)
    created_department_name: Optional[str] = Field(default=None, max_length=128)
    external_system: Optional[str] = Field(default=None, max_length=64)
    external_task_id: Optional[str] = Field(default=None, max_length=64)
    external_url: Optional[str] = Field(default=None, max_length=512)
    input_params: Optional[Union[Dict[str, Any], str]] = Field(default=None)


class ProjectExecuteBody(BaseModel):
    task_type: str = Field(default="BRIDGE_REMOVAL_BATCH", pattern=r"^BRIDGE_REMOVAL_(BATCH|UNIT)$")
    task_name: str = Field(default="", max_length=256)
    input_params: Optional[Union[Dict[str, Any], str]] = Field(default=None)
    callback_url: Optional[str] = Field(default="", max_length=512)


class WorkflowStatusBody(BaseModel):
    workflow_status: str = Field(min_length=1, max_length=64)
    comment_stage: Optional[str] = Field(default=None, max_length=64)
    comment_result: Optional[str] = Field(default=None, max_length=64)
    comment_message: Optional[str] = Field(default=None, max_length=512)
    intermediate_path: Optional[str] = Field(default=None, max_length=512)
    progress: Optional[int] = Field(default=None, ge=0, le=100)


class TaskExecuteBody(BaseModel):
    task_type: Optional[str] = Field(default=None, pattern=r"^BRIDGE_REMOVAL_(BATCH|UNIT)$")
    input_params: Optional[Union[Dict[str, Any], str]] = Field(default=None)


class PreprocessGenerateBody(BaseModel):
    input_params: Optional[Dict[str, Any]] = Field(default=None)
    overwrite: bool = Field(default=False)
    max_side_px: int = Field(default=1024, ge=64, le=8192)


class MaskGenerateBody(BaseModel):
    input_params: Optional[Dict[str, Any]] = Field(default=None)
    segment_name: str = Field(default="", max_length=128)


class MaskSaveBody(BaseModel):
    mask_data: Optional[Union[List[Any], str]] = Field(default=None)
    segment_name: str = Field(default="", max_length=128)

    @field_validator("mask_data")
    @classmethod
    def validate_mask_data(cls, v):
        if v is None:
            raise ValueError("mask_data is required")
        if isinstance(v, list) and len(v) == 0:
            raise ValueError("mask_data array must not be empty")
        if isinstance(v, str) and len(v) == 0:
            raise ValueError("mask_data string must not be empty")
        return v


class InpaintStartBody(BaseModel):
    input_params: Optional[Dict[str, Any]] = Field(default=None)


class InpaintResultBody(BaseModel):
    selected_index: int = Field(default=0, ge=0)


class MergeResultsBody(BaseModel):
    input_params: Optional[Dict[str, Any]] = Field(default=None)


class SimulateBody(BaseModel):
    shp_file_path: Optional[str] = Field(default=None, max_length=512)
    dom_dir: Optional[str] = Field(default=None, max_length=512)
    intermediate_root: Optional[str] = Field(default=None, max_length=512)
    task_id: Optional[str] = Field(default=None, max_length=64)


def validate_body(schema_cls):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            body = request.get_json(force=True, silent=True) or {}
            try:
                validated = schema_cls.model_validate(body)
                request._validated_body = validated.model_dump()
            except Exception as e:
                errors = []
                if hasattr(e, "errors"):
                    for err in e.errors():
                        loc = ".".join(str(l) for l in err.get("loc", []))
                        msg = err.get("msg", str(err))
                        errors.append(f"{loc}: {msg}" if loc else msg)
                detail = "; ".join(errors) if errors else str(e)
                return api_error("validation_error", detail, 400)
            return func(*args, **kwargs)
        return wrapper
    return decorator


def get_validated_body() -> Dict[str, Any]:
    return getattr(request, "_validated_body", {})