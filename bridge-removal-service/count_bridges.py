import sys
import json
import os
import importlib

def _require(module_name):
    try:
        return importlib.import_module(module_name)
    except ImportError as e:
        raise RuntimeError(f"Missing dependency: {module_name}") from e

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Missing shp file path"}))
        sys.exit(1)

    shp_path = sys.argv[1]
    # Remove possible wrapping quotes
    if (shp_path.startswith('"') and shp_path.endswith('"')) or (shp_path.startswith("'") and shp_path.endswith("'")):
        shp_path = shp_path[1:-1]

    if not os.path.exists(shp_path):
        print(json.dumps({"error": f"File not found: {shp_path}"}))
        sys.exit(1)

    try:
        shapefile = _require("shapefile")
        sf = shapefile.Reader(shp_path)
        count = len(sf)
        print(json.dumps({"bridge_count": count}))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    main()
