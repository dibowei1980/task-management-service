import json
import os
import copy
import logging
from typing import Any, Optional

logger = logging.getLogger(__name__)

_DEFAULT_CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "runninghub_webapps.json")

_CONFIG_CACHE: Optional[dict] = None
_CONFIG_CACHE_MTIME: Optional[float] = None


def _get_config_path() -> str:
    env_path = os.getenv("RUNNINGHUB_CONFIG_PATH", "").strip()
    return env_path if env_path else _DEFAULT_CONFIG_PATH


def _read_raw_config(path: str) -> dict:
    if not os.path.isfile(path):
        raise FileNotFoundError(f"RunningHub 配置文件不存在: {path}")
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, dict):
        raise ValueError(f"RunningHub 配置文件格式错误: 根元素必须是对象")
    return data


def validate_config(config: dict) -> list[str]:
    errors: list[str] = []
    if "version" not in config:
        errors.append("缺少 version 字段")
    if "webapps" not in config:
        errors.append("缺少 webapps 字段")
        return errors
    if not isinstance(config["webapps"], dict):
        errors.append("webapps 字段必须是对象")
        return errors

    seen_ids: dict[str, str] = {}
    for name, webapp in config["webapps"].items():
        if not isinstance(webapp, dict):
            errors.append(f"webapp '{name}' 必须是对象")
            continue
        if "webapp_id" not in webapp:
            errors.append(f"webapp '{name}' 缺少 webapp_id")
        else:
            wid = str(webapp["webapp_id"])
            if wid in seen_ids:
                errors.append(f"webapp_id '{wid}' 重复: '{seen_ids[wid]}' 和 '{name}'")
            seen_ids[wid] = name
        if "nodes" not in webapp:
            errors.append(f"webapp '{name}' 缺少 nodes 字段")
        elif not isinstance(webapp["nodes"], dict):
            errors.append(f"webapp '{name}' 的 nodes 必须是对象")
        else:
            for node_id, node_def in webapp["nodes"].items():
                if not isinstance(node_def, dict):
                    errors.append(f"webapp '{name}' 节点 '{node_id}' 必须是对象")
                    continue
                if "type" not in node_def:
                    errors.append(f"webapp '{name}' 节点 '{node_id}' 缺少 type 字段")
                if "required" not in node_def:
                    errors.append(f"webapp '{name}' 节点 '{node_id}' 缺少 required 字段")
    return errors


def load_config(force_reload: bool = False) -> dict:
    global _CONFIG_CACHE, _CONFIG_CACHE_MTIME
    path = _get_config_path()
    try:
        mtime = os.path.getmtime(path)
    except OSError:
        mtime = None

    if not force_reload and _CONFIG_CACHE is not None and _CONFIG_CACHE_MTIME == mtime:
        return _CONFIG_CACHE

    config = _read_raw_config(path)
    errors = validate_config(config)
    if errors:
        msg = "; ".join(errors)
        raise ValueError(f"RunningHub 配置验证失败: {msg}")

    _CONFIG_CACHE = config
    _CONFIG_CACHE_MTIME = mtime
    logger.info("RunningHub 配置加载成功: %d 个 webapp, 路径=%s", len(config.get("webapps", {})), path)
    return _CONFIG_CACHE


def get_webapp_config(name: str) -> Optional[dict]:
    config = load_config()
    webapp = config.get("webapps", {}).get(name)
    if webapp is None:
        available = list(config.get("webapps", {}).keys())
        logger.warning("未找到 webapp 配置 '%s', 可用: %s", name, available)
    return copy.deepcopy(webapp) if webapp else None


def get_webapp_id(name: str) -> Optional[str]:
    webapp = get_webapp_config(name)
    if webapp is None:
        return None
    env_id = os.getenv("RUNNINGHUB_WEBAPP_ID", "").strip()
    if env_id and name == "bridge_removal":
        return env_id
    return str(webapp.get("webapp_id", ""))


def resolve_webapp_id(fallback_id: Optional[str] = None) -> tuple[str, Optional[str]]:
    env_id = os.getenv("RUNNINGHUB_WEBAPP_ID", "").strip()
    if env_id:
        config = load_config()
        for name, webapp in config.get("webapps", {}).items():
            if str(webapp.get("webapp_id")) == env_id:
                return env_id, name
        return env_id, None
    if fallback_id:
        config = load_config()
        for name, webapp in config.get("webapps", {}).items():
            if str(webapp.get("webapp_id")) == str(fallback_id):
                return str(fallback_id), name
        return str(fallback_id), None
    bridge_config = get_webapp_config("bridge_removal")
    if bridge_config:
        return str(bridge_config["webapp_id"]), "bridge_removal"
    return "", None


def fill_params(webapp_name: str, request_params: dict[str, Any]) -> dict[str, Any]:
    webapp = get_webapp_config(webapp_name)
    if webapp is None:
        return dict(request_params)
    result = {}
    defaults = webapp.get("defaults", {})
    for key, default_value in defaults.items():
        result[key] = default_value
    for nid, ndef in webapp.get("nodes", {}).items():
        label = ndef.get("label")
        if label and label not in result and "default" in ndef:
            result[label] = ndef["default"]
    for key, value in request_params.items():
        if value is not None and value != "":
            result[key] = value
    return result


def build_node_mapping(webapp_name: str) -> dict[str, dict]:
    webapp = get_webapp_config(webapp_name)
    if webapp is None:
        return {}
    mapping: dict[str, dict] = {}
    for node_id, node_def in webapp.get("nodes", {}).items():
        label = node_def.get("label", node_id)
        mapping[label] = {
            "node_id": node_id,
            "type": node_def.get("type", "string"),
            "required": node_def.get("required", False),
            "upload": node_def.get("upload", False),
            "default": node_def.get("default"),
        }
    return mapping


def get_upload_node_ids(webapp_name: str) -> list[str]:
    webapp = get_webapp_config(webapp_name)
    if webapp is None:
        return []
    return [
        nid for nid, ndef in webapp.get("nodes", {}).items()
        if ndef.get("upload", False)
    ]


def get_queue_config(webapp_name: str) -> dict[str, Any]:
    webapp = get_webapp_config(webapp_name)
    if webapp is None:
        return {"queue_retry": 60, "queue_retry_interval": 5.0}
    return {
        "queue_retry": int(os.getenv("RUNNINGHUB_QUEUE_RETRY", "") or webapp.get("queue_retry", 60)),
        "queue_retry_interval": float(os.getenv("RUNNINGHUB_QUEUE_RETRY_INTERVAL", "") or webapp.get("queue_retry_interval", 5.0)),
    }


def list_webapps() -> list[dict[str, Any]]:
    config = load_config()
    result = []
    for name, webapp in config.get("webapps", {}).items():
        result.append({
            "name": name,
            "webapp_id": str(webapp.get("webapp_id", "")),
            "description": webapp.get("description", ""),
            "node_count": len(webapp.get("nodes", {})),
            "required_nodes": [
                nid for nid, ndef in webapp.get("nodes", {}).items()
                if ndef.get("required", False)
            ],
        })
    return result


def save_config(config: dict, path: Optional[str] = None) -> None:
    errors = validate_config(config)
    if errors:
        raise ValueError(f"配置验证失败: {'; '.join(errors)}")
    target = path or _get_config_path()
    tmp_path = f"{target}.tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(config, f, indent=2, ensure_ascii=False)
    os.replace(tmp_path, target)
    global _CONFIG_CACHE, _CONFIG_CACHE_MTIME
    _CONFIG_CACHE = None
    _CONFIG_CACHE_MTIME = None
    logger.info("RunningHub 配置已保存: %s", target)


def add_webapp(name: str, webapp_config: dict) -> None:
    config = load_config()
    if name in config.get("webapps", {}):
        raise ValueError(f"webapp '{name}' 已存在")
    config.setdefault("webapps", {})[name] = webapp_config
    save_config(config)


def update_webapp(name: str, updates: dict) -> None:
    config = load_config()
    if name not in config.get("webapps", {}):
        raise ValueError(f"webapp '{name}' 不存在")
    config["webapps"][name].update(updates)
    save_config(config)


def delete_webapp(name: str) -> None:
    config = load_config()
    if name not in config.get("webapps", {}):
        raise ValueError(f"webapp '{name}' 不存在")
    del config["webapps"][name]
    save_config(config)
