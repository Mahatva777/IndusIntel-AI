# PPE Detection — Video Inference

Runs a trained YOLO26 model (e.g. `best.pt` from Kaggle training run) on video files
and produces:

- `*_annotated.mp4` — the input video with bounding boxes + labels drawn
- `*_detections.json` — per-frame detection log (class, confidence, bbox, timestamp)
- `*_detections.csv` — same log in spreadsheet-friendly format

## Setup

```bash
pip install -r requirements.txt
```

## Folder layout

```
cv_engine/
├── inference.py
├── models/
│   └── best.pt
└── videos/
    ├── Z1_CAM_01.mp4
    └── Z2_CAM_01.mp4
    ├── Z3_CAM_01.mp4
    └── Z4_CAM_01.mp4
```

## Usage

Single video:

```bash
python cv_engine/inference.py --model cv_engine/models/best.pt --source cv_engine/videos/Zx_CAM_01.mp4 --output cv_engine/outputs/ --device mps
```

Whole folder of videos:

```bash
python cv_engine/inference.py --model cv_engine/models/best.pt --source cv_engine/videos/ --output cv_engine/outputs/ --device mps

```

