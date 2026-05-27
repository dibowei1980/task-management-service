import json
import os
import pytest
import tempfile

from bridge_removal.runninghub_config import (
    validate_config,
    fill_params,
    get_upload_node_ids,
    get_queue_config,
    build_node_mapping,
    list_webapps,
    load_config,
    get_webapp_config,
    add_webapp,
    update_webapp,
    delete_webapp,
)


_VALID_CONFIG = {
    "version": "1.0",
    "webapps": {
        "bridge_removal": {
            "webapp_id": "2029163935819108353",
            "description": "桥梁移除修复",
            "nodes": {
                "15": {
                    "label": "original_image",
                    "description": "原始影像",
                    "type": "file",
                    "required": True,
                    "upload": True,
                },
                "37": {
                    "label": "removal_mask",
                    "description": "移除掩膜",
                    "type": "file",
                    "required": True,
                    "upload": True,
                },
                "45": {
                    "label": "crop_mask",
                    "description": "裁剪掩膜",
                    "type": "file",
                    "required": True,
                    "upload": True,
                },
                "70": {
                    "label": "seed",
                    "description": "随机种子",
                    "type": "string",
                    "required": False,
                    "default": "",
                },
                "73": {
                    "label": "blur_radius",
                    "description": "模糊像素",
                    "type": "integer",
                    "required": False,
                    "default": "2",
                },
                "74": {
                    "label": "expand",
                    "description": "外扩像素",
                    "type": "integer",
                    "required": False,
                    "default": "3",
                },
            },
            "defaults": {
                "seed": "",
                "blur_radius": "2",
                "expand": "3",
            },
            "queue_retry": 60,
            "queue_retry_interval": 5.0,
        }
    },
}


class TestValidateConfig:
    def test_valid_config(self):
        errors = validate_config(_VALID_CONFIG)
        assert errors == []

    def test_missing_version(self):
        config = {"webapps": {}}
        errors = validate_config(config)
        assert any("version" in e for e in errors)

    def test_missing_webapps(self):
        config = {"version": "1.0"}
        errors = validate_config(config)
        assert any("webapps" in e for e in errors)

    def test_webapps_not_dict(self):
        config = {"version": "1.0", "webapps": []}
        errors = validate_config(config)
        assert any("webapps" in e for e in errors)

    def test_webapp_missing_webapp_id(self):
        config = {"version": "1.0", "webapps": {"test": {"nodes": {}}}}
        errors = validate_config(config)
        assert any("webapp_id" in e for e in errors)

    def test_duplicate_webapp_id(self):
        config = {
            "version": "1.0",
            "webapps": {
                "app1": {"webapp_id": "123", "nodes": {}},
                "app2": {"webapp_id": "123", "nodes": {}},
            },
        }
        errors = validate_config(config)
        assert any("重复" in e for e in errors)

    def test_missing_nodes(self):
        config = {"version": "1.0", "webapps": {"test": {"webapp_id": "123"}}}
        errors = validate_config(config)
        assert any("nodes" in e for e in errors)

    def test_node_missing_type(self):
        config = {
            "version": "1.0",
            "webapps": {
                "test": {
                    "webapp_id": "123",
                    "nodes": {"1": {"label": "x", "required": True}},
                }
            },
        }
        errors = validate_config(config)
        assert any("type" in e for e in errors)

    def test_node_missing_required(self):
        config = {
            "version": "1.0",
            "webapps": {
                "test": {
                    "webapp_id": "123",
                    "nodes": {"1": {"label": "x", "type": "string"}},
                }
            },
        }
        errors = validate_config(config)
        assert any("required" in e for e in errors)


class TestFillParams:
    def test_defaults_applied_when_missing(self):
        result = fill_params("bridge_removal", {})
        assert result.get("seed") == ""
        assert result.get("blur_radius") == "2"
        assert result.get("expand") == "3"

    def test_request_overrides_default(self):
        result = fill_params("bridge_removal", {"seed": "42"})
        assert result["seed"] == "42"

    def test_request_overrides_node_default(self):
        result = fill_params("bridge_removal", {"blur_radius": "3", "expand": "5"})
        assert result["blur_radius"] == "3"
        assert result["expand"] == "5"

    def test_extra_params_preserved(self):
        result = fill_params("bridge_removal", {"extra_key": "value"})
        assert result["extra_key"] == "value"

    def test_none_values_use_default(self):
        result = fill_params("bridge_removal", {"seed": None})
        assert result["seed"] == ""

    def test_empty_string_uses_default(self):
        result = fill_params("bridge_removal", {"seed": ""})
        assert result["seed"] == ""

    def test_unknown_webapp_returns_unchanged(self):
        params = {"key": "value"}
        result = fill_params("nonexistent", params)
        assert result == params


class TestUploadNodeIds:
    def test_returns_upload_nodes(self):
        ids = get_upload_node_ids("bridge_removal")
        assert "15" in ids
        assert "37" in ids
        assert "45" in ids
        assert "70" not in ids

    def test_unknown_webapp_returns_empty(self):
        ids = get_upload_node_ids("nonexistent")
        assert ids == []


class TestQueueConfig:
    def test_default_queue_config(self):
        cfg = get_queue_config("bridge_removal")
        assert cfg["queue_retry"] == 60
        assert cfg["queue_retry_interval"] == 5.0

    def test_unknown_webapp_returns_defaults(self):
        cfg = get_queue_config("nonexistent")
        assert cfg["queue_retry"] == 60
        assert cfg["queue_retry_interval"] == 5.0


class TestBuildNodeMapping:
    def test_mapping_structure(self):
        mapping = build_node_mapping("bridge_removal")
        assert "original_image" in mapping
        assert mapping["original_image"]["node_id"] == "15"
        assert mapping["original_image"]["type"] == "file"
        assert mapping["original_image"]["required"] is True
        assert mapping["original_image"]["upload"] is True

    def test_seed_node(self):
        mapping = build_node_mapping("bridge_removal")
        assert "seed" in mapping
        assert mapping["seed"]["node_id"] == "70"
        assert mapping["seed"]["type"] == "string"
        assert mapping["seed"]["required"] is False

    def test_unknown_webapp_returns_empty(self):
        mapping = build_node_mapping("nonexistent")
        assert mapping == {}


class TestConfigFileOperations:
    def test_load_and_list(self):
        webapps = list_webapps()
        assert len(webapps) >= 1
        names = [w["name"] for w in webapps]
        assert "bridge_removal" in names

    def test_get_webapp_config(self):
        config = get_webapp_config("bridge_removal")
        assert config is not None
        assert config["webapp_id"] == "2029163935819108353"

    def test_get_nonexistent_webapp(self):
        config = get_webapp_config("nonexistent")
        assert config is None

    def test_add_update_delete_webapp(self, tmp_path):
        config_path = str(tmp_path / "test_webapps.json")
        with open(config_path, "w", encoding="utf-8") as f:
            json.dump(_VALID_CONFIG, f, ensure_ascii=False)

        original_path = os.environ.get("RUNNINGHUB_CONFIG_PATH")
        os.environ["RUNNINGHUB_CONFIG_PATH"] = config_path
        try:
            import bridge_removal.runninghub_config as rc
            rc._CONFIG_CACHE = None
            rc._CONFIG_CACHE_MTIME = None

            new_config = {
                "webapp_id": "999999",
                "description": "测试应用",
                "nodes": {
                    "1": {
                        "label": "input_image",
                        "type": "file",
                        "required": True,
                        "upload": True,
                    }
                },
                "defaults": {},
            }
            rc.add_webapp("test_app", new_config)
            rc._CONFIG_CACHE = None
            rc._CONFIG_CACHE_MTIME = None
            fetched = rc.get_webapp_config("test_app")
            assert fetched is not None
            assert fetched["webapp_id"] == "999999"

            rc.update_webapp("test_app", {"description": "更新后的描述"})
            rc._CONFIG_CACHE = None
            rc._CONFIG_CACHE_MTIME = None
            fetched = rc.get_webapp_config("test_app")
            assert fetched["description"] == "更新后的描述"

            rc.delete_webapp("test_app")
            rc._CONFIG_CACHE = None
            rc._CONFIG_CACHE_MTIME = None
            fetched = rc.get_webapp_config("test_app")
            assert fetched is None
        finally:
            if original_path is not None:
                os.environ["RUNNINGHUB_CONFIG_PATH"] = original_path
            else:
                os.environ.pop("RUNNINGHUB_CONFIG_PATH", None)
            rc._CONFIG_CACHE = None
            rc._CONFIG_CACHE_MTIME = None

    def test_add_duplicate_webapp_raises(self, tmp_path):
        config_path = str(tmp_path / "test_webapps.json")
        with open(config_path, "w", encoding="utf-8") as f:
            json.dump(_VALID_CONFIG, f, ensure_ascii=False)

        original_path = os.environ.get("RUNNINGHUB_CONFIG_PATH")
        os.environ["RUNNINGHUB_CONFIG_PATH"] = config_path
        try:
            import bridge_removal.runninghub_config as rc
            rc._CONFIG_CACHE = None
            rc._CONFIG_CACHE_MTIME = None

            with pytest.raises(ValueError, match="已存在"):
                rc.add_webapp("bridge_removal", {"webapp_id": "dup", "nodes": {}})
        finally:
            if original_path is not None:
                os.environ["RUNNINGHUB_CONFIG_PATH"] = original_path
            else:
                os.environ.pop("RUNNINGHUB_CONFIG_PATH", None)
            rc._CONFIG_CACHE = None
            rc._CONFIG_CACHE_MTIME = None

    def test_delete_nonexistent_raises(self, tmp_path):
        config_path = str(tmp_path / "test_webapps.json")
        with open(config_path, "w", encoding="utf-8") as f:
            json.dump(_VALID_CONFIG, f, ensure_ascii=False)

        original_path = os.environ.get("RUNNINGHUB_CONFIG_PATH")
        os.environ["RUNNINGHUB_CONFIG_PATH"] = config_path
        try:
            import bridge_removal.runninghub_config as rc
            rc._CONFIG_CACHE = None
            rc._CONFIG_CACHE_MTIME = None

            with pytest.raises(ValueError, match="不存在"):
                rc.delete_webapp("nonexistent")
        finally:
            if original_path is not None:
                os.environ["RUNNINGHUB_CONFIG_PATH"] = original_path
            else:
                os.environ.pop("RUNNINGHUB_CONFIG_PATH", None)
            rc._CONFIG_CACHE = None
            rc._CONFIG_CACHE_MTIME = None

    def test_missing_config_file_raises(self, tmp_path):
        config_path = str(tmp_path / "nonexistent.json")
        original_path = os.environ.get("RUNNINGHUB_CONFIG_PATH")
        os.environ["RUNNINGHUB_CONFIG_PATH"] = config_path
        try:
            import bridge_removal.runninghub_config as rc
            rc._CONFIG_CACHE = None
            rc._CONFIG_CACHE_MTIME = None

            with pytest.raises(FileNotFoundError):
                rc.load_config()
        finally:
            if original_path is not None:
                os.environ["RUNNINGHUB_CONFIG_PATH"] = original_path
            else:
                os.environ.pop("RUNNINGHUB_CONFIG_PATH", None)
            rc._CONFIG_CACHE = None
            rc._CONFIG_CACHE_MTIME = None

    def test_invalid_json_raises(self, tmp_path):
        config_path = str(tmp_path / "bad.json")
        with open(config_path, "w") as f:
            f.write("{invalid json")
        original_path = os.environ.get("RUNNINGHUB_CONFIG_PATH")
        os.environ["RUNNINGHUB_CONFIG_PATH"] = config_path
        try:
            import bridge_removal.runninghub_config as rc
            rc._CONFIG_CACHE = None
            rc._CONFIG_CACHE_MTIME = None

            with pytest.raises(Exception):
                rc.load_config()
        finally:
            if original_path is not None:
                os.environ["RUNNINGHUB_CONFIG_PATH"] = original_path
            else:
                os.environ.pop("RUNNINGHUB_CONFIG_PATH", None)
            rc._CONFIG_CACHE = None
            rc._CONFIG_CACHE_MTIME = None
