from flask import Blueprint, jsonify

from api.auth import require_local_auth
from services.job_service import get_job

jobs_bp = Blueprint("jobs", __name__)


@jobs_bp.route("/jobs/<job_id>", methods=["GET"])
@require_local_auth
def get_job_status(job_id: str):
    job = get_job(job_id)
    if not job:
        return jsonify({"error": "Job not found"}), 404
    return jsonify(job)