import os
import uuid

from flask import Blueprint, jsonify, request

from api.auth import require_local_auth, require_permission

shapefiles_bp = Blueprint("shapefiles", __name__, url_prefix="/api/shapefiles")


@shapefiles_bp.route("/upload", methods=["POST"])
@require_local_auth
@require_permission("task:execute")
def shapefile_upload():
    upload_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "uploads", "shapefiles")
    os.makedirs(upload_dir, exist_ok=True)

    uploaded = {}
    for field_name in ("shp", "shx", "dbf", "prj", "file"):
        if field_name in request.files:
            f = request.files[field_name]
            if f.filename:
                filename = f"{uuid.uuid4().hex}_{f.filename}"
                save_path = os.path.join(upload_dir, filename)
                f.save(save_path)
                uploaded[field_name] = save_path

    if not uploaded:
        return jsonify({"error": "No file provided"}), 400

    return jsonify({"path": uploaded.get("shp") or list(uploaded.values())[0], "files": uploaded}), 201
