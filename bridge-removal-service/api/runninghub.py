import logging

from flask import Blueprint, request, jsonify

from bridge_removal.runninghub_config import (
    load_config,
    get_webapp_config,
    list_webapps,
    add_webapp,
    update_webapp,
    delete_webapp,
    validate_config,
)

logger = logging.getLogger(__name__)

runninghub_bp = Blueprint("runninghub", __name__, url_prefix="/api/runninghub")


@runninghub_bp.route("/webapps", methods=["GET"])
def api_list_webapps():
    try:
        webapps = list_webapps()
        return jsonify({"ok": True, "data": webapps}), 200
    except Exception as e:
        logger.exception("Failed to list webapps")
        return jsonify({"ok": False, "error": str(e)}), 500


@runninghub_bp.route("/webapps/<name>", methods=["GET"])
def api_get_webapp(name):
    try:
        webapp = get_webapp_config(name)
        if webapp is None:
            return jsonify({"ok": False, "error": f"webapp '{name}' 不存在"}), 404
        return jsonify({"ok": True, "data": webapp}), 200
    except Exception as e:
        logger.exception("Failed to get webapp '%s'", name)
        return jsonify({"ok": False, "error": str(e)}), 500


@runninghub_bp.route("/webapps", methods=["POST"])
def api_add_webapp():
    try:
        body = request.get_json(force=True, silent=True)
        if not body or not isinstance(body, dict):
            return jsonify({"ok": False, "error": "请求体必须是 JSON 对象"}), 400
        name = body.get("name")
        if not name:
            return jsonify({"ok": False, "error": "缺少 name 字段"}), 400
        webapp_config = body.get("config")
        if not webapp_config or not isinstance(webapp_config, dict):
            return jsonify({"ok": False, "error": "缺少 config 字段或格式错误"}), 400
        errors = validate_config({"version": "1.0", "webapps": {name: webapp_config}})
        if errors:
            return jsonify({"ok": False, "error": f"配置验证失败: {'; '.join(errors)}"}), 400
        add_webapp(name, webapp_config)
        return jsonify({"ok": True, "data": {"name": name}}), 201
    except ValueError as e:
        return jsonify({"ok": False, "error": str(e)}), 409
    except Exception as e:
        logger.exception("Failed to add webapp")
        return jsonify({"ok": False, "error": str(e)}), 500


@runninghub_bp.route("/webapps/<name>", methods=["PATCH"])
def api_update_webapp(name):
    try:
        body = request.get_json(force=True, silent=True)
        if not body or not isinstance(body, dict):
            return jsonify({"ok": False, "error": "请求体必须是 JSON 对象"}), 400
        update_webapp(name, body)
        return jsonify({"ok": True, "data": {"name": name}}), 200
    except ValueError as e:
        return jsonify({"ok": False, "error": str(e)}), 404
    except Exception as e:
        logger.exception("Failed to update webapp '%s'", name)
        return jsonify({"ok": False, "error": str(e)}), 500


@runninghub_bp.route("/webapps/<name>", methods=["DELETE"])
def api_delete_webapp(name):
    try:
        delete_webapp(name)
        return jsonify({"ok": True, "data": {"name": name}}), 200
    except ValueError as e:
        return jsonify({"ok": False, "error": str(e)}), 404
    except Exception as e:
        logger.exception("Failed to delete webapp '%s'", name)
        return jsonify({"ok": False, "error": str(e)}), 500


@runninghub_bp.route("/config/reload", methods=["POST"])
def api_reload_config():
    try:
        config = load_config(force_reload=True)
        return jsonify({"ok": True, "data": {"webapp_count": len(config.get("webapps", {}))}}), 200
    except Exception as e:
        logger.exception("Failed to reload config")
        return jsonify({"ok": False, "error": str(e)}), 500
