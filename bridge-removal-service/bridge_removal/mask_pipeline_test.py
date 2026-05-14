import json

from mask_pipeline import run_mask_generation


def main() -> None:
    payload = {
        "id": "0646db6a-b74b-4a05-a346-7ea34824fc31",
        "inputJson": {
            "processing_info": {
                "module": "BridgeImageMosaic",
                "version": "1.0",
                "timestamp": 1.7720696304015923e9,
            },
            "geometry": {
                "polygon": {
                    "type": "Polygon",
                    "coordinates": [
                        [
                            [576810.286048579, 3087465.4198188474],
                            [576824.375, 3087522.25],
                            [576837.5625, 3087658.0],
                            [576853.9375, 3087854.5],
                            [576880.0, 3087852.5],
                            [576864.0, 3087655.25],
                            [576849.4375, 3087518.5],
                            [576834.5320670216, 3087459.3583142366],
                            [576810.286048579, 3087465.4198188474],
                        ]
                    ],
                },
                "bridge_polygon": {
                    "type": "Polygon",
                    "coordinates": [
                        [
                            [576479.9375, 3086550.5],
                            [576503.125, 3086658.250000001],
                            [576541.0, 3086772.0],
                            [576636.25, 3086999.75],
                            [576667.4375, 3087073.5],
                            [576718.4375, 3087194.0],
                            [576722.625, 3087204.0],
                            [576787.25, 3087372.5],
                            [576824.375, 3087522.25],
                            [576837.5625, 3087658.0],
                            [576853.9375, 3087854.5],
                            [576880.0, 3087852.5],
                            [576864.0, 3087655.25],
                            [576849.4375, 3087518.5],
                            [576810.625, 3087364.5],
                            [576743.625, 3087194.0],
                            [576741.5, 3087188.5],
                            [576693.8125, 3087073.5],
                            [576658.7499999999, 3086988.75],
                            [576561.3125, 3086760.5],
                            [576526.375, 3086649.75],
                            [576505.5, 3086544.75],
                            [576494.5625, 3086433.75],
                            [576496.3125000001, 3086341.0],
                            [576471.1250000001, 3086339.25],
                            [576469.375, 3086430.75],
                            [576479.9375, 3086550.5],
                        ]
                    ],
                },
                "centerline": {
                    "type": "LineString",
                    "coordinates": [
                        [576866.96875, 3087853.5],
                        [576851.775, 3087669.1],
                        [576837.975, 3087531.1],
                        [576834.775, 3087511.9],
                        [576822.3979602334, 3087462.391840934],
                    ],
                },
                "center_point": {
                    "type": "Point",
                    "coordinates": [576850.5729913112, 3087657.0799131123],
                },
                "bounds_geo": [
                    576626.5729913112,
                    3087433.0799131123,
                    577074.5729913112,
                    3087881.0799131123,
                ],
            },
            "image_info": {
                "filename": "bridge_3_1.png",
                "width": 896,
                "height": 896,
                "format": "PNG",
                "created_at": "2026-02-26 09:33:50",
            },
            "properties": {
                "FID_": "0",
                "Entity": "3DPolyline",
                "Layer": "0",
                "Color": "196",
                "Linetype": "Continuous",
                "Elevation": "1.97274505615e+02",
                "LineWt": "25",
                "RefName": "",
                "bridge_id": "bridge_3",
                "type": "centerline",
                "segment_id": 1,
                "is_start_segment": True,
                "is_end_segment": False,
                "resolution": 0.5,
            },
            "segment_json_path": "D:/data/intermediate\\0646db6a-b74b-4a05-a346-7ea34824fc31\\bridge_3\\0646db6a-b74b-4a05-a346-7ea34824fc31\\segments\\bridge_3_1.json",
        },
    }
    result = run_mask_generation(payload["id"], json.dumps(payload["inputJson"], ensure_ascii=False))
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
