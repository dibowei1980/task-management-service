from functools import wraps
from typing import Any, Dict, List, Optional, Union

from flask import request
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from api.utils import api_error


class ProjectCreateBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    project_id: Optional[str] = Field(alias="projectId", default=None, max_length=64)
    task_type: str = Field(alias="type", default="BRIDGE_REMOVAL_BATCH", pattern=r"^BRIDGE_REMOVAL_(BATCH|UNIT)$")
    task_name: str = Field(alias="taskName", default="", max_length=256)
    name: Optional[str] = Field(default=None, max_length=256)
    category: str = Field(default="PROJECT", pattern=r"^(PROJECT|UNIT|SYSTEM_TASK)$")
    priority: int = Field(default=1, ge=1, le=10)
    status: str = Field(default="PENDING", pattern=r"^PENDING|RECEIVED|IN_PROGRESS|COMPLETED|FAILED$")
    input_params: Optional[Union[Dict[str, Any], str]] = Field(alias="inputParams", default=None)
    department_id: Optional[str] = Field(alias="departmentId", default=None, max_length=64)
    department_name: Optional[str] = Field(alias="departmentName", default=None, max_length=128)
    project_leader_id: Optional[str] = Field(alias="projectLeaderId", default=None, max_length=64)
    assignee_id: Optional[str] = Field(alias="assigneeId", default=None, max_length=64)
    created_by_name: Optional[str] = Field(alias="createdByName", default=None, max_length=128)
    created_department_id: Optional[str] = Field(alias="createdDepartmentId", default=None, max_length=64)
    created_department_name: Optional[str] = Field(alias="createdDepartmentName", default=None, max_length=128)
    external_system: Optional[str] = Field(alias="externalSystem", default=None, max_length=64)
    external_task_id: Optional[str] = Field(alias="externalTaskId", default=None, max_length=64)
    external_url: Optional[str] = Field(alias="externalUrl", default=None, max_length=512)
    operator_ids: Optional[List[str]] = Field(alias="operatorIds", default=None)
    inspector_ids: Optional[List[str]] = Field(alias="inspectorIds", default=None)
    parent_task_id: Optional[str] = Field(alias="parentTaskId", default=None, max_length=64)

    @model_validator(mode="after")
    def resolve_name(self):
        if not self.task_name and self.name:
            self.task_name = self.name
        if not self.name and self.task_name:
            self.name = self.task_name
        return self


class ProjectUpdateBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: Optional[str] = Field(default=None, max_length=256)
    task_name: Optional[str] = Field(alias="taskName", default=None, max_length=256)
    status: Optional[str] = Field(default=None, pattern=r"^PENDING|RECEIVED|IN_PROGRESS|COMPLETED|FAILED|CANCELLED$")
    priority: Optional[int] = Field(default=None, ge=1, le=10)
    assignee_id: Optional[str] = Field(alias="assigneeId", default=None, max_length=64)
    project_leader_id: Optional[str] = Field(alias="projectLeaderId", default=None, max_length=64)
    department_id: Optional[str] = Field(alias="departmentId", default=None, max_length=64)
    department_name: Optional[str] = Field(alias="departmentName", default=None, max_length=128)
    operator_ids: Optional[List[str]] = Field(alias="operatorIds", default=None)
    inspector_ids: Optional[List[str]] = Field(alias="inspectorIds", default=None)
    progress: Optional[int] = Field(default=None, ge=0, le=100)
    output_results: Optional[str] = Field(alias="outputResults", default=None)
    created_by_name: Optional[str] = Field(alias="createdByName", default=None, max_length=128)
    created_department_id: Optional[str] = Field(alias="createdDepartmentId", default=None, max_length=64)
    created_department_name: Optional[str] = Field(alias="createdDepartmentName", default=None, max_length=128)
    external_system: Optional[str] = Field(alias="externalSystem", default=None, max_length=64)
    external_task_id: Optional[str] = Field(alias="externalTaskId", default=None, max_length=64)
    external_url: Optional[str] = Field(alias="externalUrl", default=None, max_length=512)
    input_params: Optional[Union[Dict[str, Any], str]] = Field(alias="inputParams", default=None)


class ProjectExecuteBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    task_type: str = Field(alias="type", default="BRIDGE_REMOVAL_BATCH", pattern=r"^BRIDGE_REMOVAL_(BATCH|UNIT)$")
    task_name: str = Field(alias="taskName", default="", max_length=256)
    input_params: Optional[Union[Dict[str, Any], str]] = Field(alias="inputParams", default=None)
    callback_url: Optional[str] = Field(alias="callbackUrl", default="", max_length=512)


class WorkflowStatusBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    workflow_status: str = Field(alias="workflowStatus", min_length=1, max_length=64)
    comment_stage: Optional[str] = Field(alias="commentStage", default=None, max_length=64)
    comment_result: Optional[str] = Field(alias="commentResult", default=None, max_length=64)
    comment_message: Optional[str] = Field(alias="commentMessage", default=None, max_length=512)
    intermediate_path: Optional[str] = Field(alias="intermediatePath", default=None, max_length=512)
    progress: Optional[int] = Field(default=None, ge=0, le=100)


class TaskExecuteBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    task_type: Optional[str] = Field(alias="type", default=None, pattern=r"^BRIDGE_REMOVAL_(BATCH|UNIT)$")
    input_params: Optional[Union[Dict[str, Any], str]] = Field(alias="inputParams", default=None)


class PreprocessGenerateBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    input_params: Optional[Dict[str, Any]] = Field(alias="inputParams", default=None)
    overwrite: bool = Field(default=False)
    max_side_px: int = Field(alias="maxSidePx", default=1024, ge=64, le=8192)


class MaskGenerateBatchItem(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    segment_json_path: str = Field(alias="segment_json_path", default="", max_length=512)
    segment_name: str = Field(alias="segment_name", default="", max_length=128)


class MaskGenerateBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    input_params: Optional[Dict[str, Any]] = Field(alias="inputParams", default=None)
    segment_name: str = Field(alias="segment_name", default="", max_length=128)
    segment_json_path: str = Field(alias="segment_json_path", default="", max_length=512)
    batch: Optional[List[MaskGenerateBatchItem]] = Field(default=None)


class MaskSaveBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    segment_json_path: str = Field(alias="segment_json_path", default="", max_length=512)
    mask_png_base64: str = Field(alias="mask_png_base64", default="")
    mask_cut_png_base64: str = Field(alias="mask_cut_png_base64", default="")

    @field_validator("mask_png_base64")
    @classmethod
    def validate_mask_png_base64(cls, v):
        if not v:
            raise ValueError("mask_png_base64 is required")
        return v


class InpaintStartBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    input_params: Optional[Dict[str, Any]] = Field(alias="inputParams", default=None)
    segment_json_path: str = Field(alias="segment_json_path", default="", max_length=512)
    image_path: str = Field(alias="image_path", default="", max_length=512)
    removal_mask_path: str = Field(alias="removal_mask_path", default="", max_length=512)
    crop_mask_path: str = Field(alias="crop_mask_path", default="", max_length=512)
    count: int = Field(default=1, ge=1, le=8)
    blur_radius: int = Field(alias="blur_radius", default=2, ge=0, le=20)
    expand: int = Field(alias="expand", default=3, ge=0, le=50)
    previous_result_path: str = Field(alias="previous_result_path", default="", max_length=1024)
    previous_world_file_path: str = Field(alias="previous_world_file_path", default="", max_length=1024)
    current_world_file_path: str = Field(alias="current_world_file_path", default="", max_length=1024)


class InpaintResultBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    selected_index: int = Field(alias="selectedIndex", default=0, ge=0)


class MergeResultsBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    input_params: Optional[Dict[str, Any]] = Field(alias="inputParams", default=None)
    overwrite: Optional[bool] = Field(default=False)


class SimulateBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    shp_file_path: Optional[str] = Field(alias="shpFilePath", default=None, max_length=512)
    dom_dir: Optional[str] = Field(default=None, max_length=512)
    intermediate_root: Optional[str] = Field(alias="intermediateRoot", default=None, max_length=512)
    task_id: Optional[str] = Field(alias="taskId", default=None, max_length=64)


class LocalEditStartBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    image_path: str = Field(alias="image_path", default="", max_length=1024)
    mask_data: str = Field(alias="mask_data", default="", max_length=5242880)
    prompt: str = Field(default="", max_length=2048)
    num_candidates: int = Field(alias="num_candidates", default=1, ge=1, le=8)
    crop_bounds: str = Field(alias="crop_bounds", default="", max_length=256)
    input_params: Optional[Dict[str, Any]] = Field(alias="inputParams", default=None)


class LocalEditApplyBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    job_id: str = Field(alias="job_id", default="", max_length=64)
    result_index: int = Field(alias="result_index", default=0, ge=0)
    crop_bounds: str = Field(alias="crop_bounds", default="", max_length=256)
    original_image_path: str = Field(alias="original_image_path", default="", max_length=1024)


def validate_body(schema_cls):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            body = request.get_json(force=True, silent=True) or {}
            try:
                validated = schema_cls.model_validate(body)
                request._validated_body = validated.model_dump(exclude_none=True)
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