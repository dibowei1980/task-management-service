import importlib


def main():
    importlib.import_module("bridge_removal_task")
    importlib.import_module("bridge_removal.pipeline")
    importlib.import_module("bridge_removal.vector_reader")
    importlib.import_module("bridge_removal.dom_mosaic")
    print("smoke_test_bridge_removal: ok")


if __name__ == "__main__":
    main()

