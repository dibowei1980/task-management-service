import json

from extract_masks_pipeline import ExtractMasksPipeline


def main() -> None:
    payload = {
        "processing_info": {
            "module": "BridgeImageMosaic",
            "version": "1.0",
            "timestamp": 1.772163083697769e9,
        },
        "geometry": {
            "polygon": {
                "type": "Polygon",
                "coordinates": [
                    [
                        [576763.625, 3085716.0],
                        [576825.0625, 3085656.0],
                        [576870.0, 3085617.5],
                        [576924.0625000001, 3085571.0],
                        [576986.0, 3085522.75],
                        [577006.5, 3085506.75],
                        [576989.375, 3085486.0],
                        [576986.0, 3085488.75],
                        [576907.25, 3085551.75],
                        [576870.0, 3085584.5],
                        [576808.5, 3085638.5],
                        [576744.375, 3085697.5],
                        [576763.625, 3085716.0],
                    ]
                ],
            },
            "centerline": {
                "type": "LineString",
                "coordinates": [
                    [576754.0, 3085706.75],
                    [576817.375, 3085646.6],
                    [576913.175, 3085563.4],
                    [576997.9375, 3085496.375],
                ],
            },
            "center_point": {"type": "Point", "coordinates": [576873.0837885643, 3085598.218254608]},
            "bounds_geo": [576715.0837885643, 3085440.218254608, 577031.0837885643, 3085756.218254608],
        },
        "image_info": {
            "filename": "bridge_2_1.png",
            "width": 632,
            "height": 632,
            "format": "PNG",
            "created_at": "2026-02-27 11:31:23",
        },
        "properties": {
            "FID_": "0",
            "Entity": "3DPolyline",
            "Layer": "0",
            "Color": "236",
            "Linetype": "Continuous",
            "Elevation": "2.09665206909e+02",
            "LineWt": "25",
            "RefName": "",
            "bridge_id": "bridge_2",
            "type": "centerline",
            "segment_id": 1,
            "is_start_segment": True,
            "is_end_segment": True,
            "resolution": 0.5,
        },
        "segment_json_path": "D:/data/intermediate\\a4bae1b1-8755-41e5-8103-dee6b499cf89\\bridge_2\\a4bae1b1-8755-41e5-8103-dee6b499cf89\\segments\\bridge_2_1.json",
    }
    pipeline = ExtractMasksPipeline()
    pipeline.run(json.dumps(payload, ensure_ascii=False))


if __name__ == "__main__":
    main()
