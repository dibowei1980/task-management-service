import math
import re
from flask import jsonify


_SNAKE_RE = re.compile(r'_([a-z])')


def to_camel_case(name: str) -> str:
    if '_' not in name:
        return name
    return _SNAKE_RE.sub(lambda m: m.group(1).upper(), name)


_CAMEL_RE = re.compile(r'([A-Z])')


def to_snake_case(name: str) -> str:
    if '_' in name:
        return name
    return _CAMEL_RE.sub(lambda m: '_' + m.group(1).lower(), name).lstrip('_')


def _convert_value(value, converter, depth=0):
    if depth > 10:
        return value
    if isinstance(value, dict):
        return {converter(k): _convert_value(v, converter, depth + 1) for k, v in value.items()}
    if isinstance(value, list):
        return [_convert_value(item, converter, depth + 1) for item in value]
    return value


def to_camel(data):
    return _convert_value(data, to_camel_case)


def to_snake(data):
    return _convert_value(data, to_snake_case)


def api_ok(data, status=200, headers=None):
    resp = jsonify({"data": to_camel(data)})
    return resp, status, headers or {}


def api_created(data, location="", status=201):
    headers = {}
    if location:
        headers["Location"] = location
    return api_ok(data, status=status, headers=headers)


def api_accepted(data, location=""):
    headers = {}
    if location:
        headers["Location"] = location
    return api_ok(data, status=202, headers=headers)


def api_no_content():
    return "", 204


def api_error(code, message, status=400, details=None):
    body = {"error": {"code": code, "message": message}}
    if details:
        body["error"]["details"] = details
    return jsonify(body), status


def api_collection(items, total=None, page=1, per_page=20, base_url=""):
    total = total if total is not None else len(items)
    total_pages = max(1, math.ceil(total / per_page)) if per_page > 0 else 1
    meta = {
        "total": total,
        "page": page,
        "perPage": per_page,
        "totalPages": total_pages,
    }
    links = {
        "self": f"{base_url}?page={page}&per_page={per_page}",
    }
    if page < total_pages:
        links["next"] = f"{base_url}?page={page + 1}&per_page={per_page}"
    if page > 1:
        links["prev"] = f"{base_url}?page={page - 1}&per_page={per_page}"
    links["last"] = f"{base_url}?page={total_pages}&per_page={per_page}"
    return jsonify({"data": to_camel(items), "meta": meta, "links": links})
