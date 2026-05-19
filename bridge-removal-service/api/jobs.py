from flask import Blueprint

from api.auth import require_local_auth
from api.utils import api_ok, api_error
from services.job_service import get_job

jobs_bp = Blueprint("jobs", __name__, url_prefix="/api/v1/jobs")


@jobs_bp.route("/<job_id>", methods=["GET"])
@require_local_auth
def get_job_status(job_id: str):
    job = get_job(job_id)
    if not job:
        return api_error("not_found", "Job not found", 404)
    return api_ok(job)
