"""
PPE Detection — Video Inference Script

Runs a trained YOLO26 model on video(s) and saves:
  - annotated output video(s) with bounding boxes drawn
  - a per-frame detection log (JSON + CSV) for each video

Usage:
    # Single video
    python inference.py --model best.pt --source path/to/video.mp4 --output outputs/

    # Folder of videos
    python inference.py --model best.pt --source path/to/videos_folder/ --output outputs/

    # Tune thresholds / run on CPU
    python inference.py --model best.pt --source video.mp4 --conf 0.5 --iou 0.45 --device cpu
"""

import argparse
import csv
import json
from datetime import datetime
from pathlib import Path

import cv2
from ultralytics import YOLO

VIDEO_EXTENSIONS = {".mp4", ".avi", ".mov", ".mkv", ".webm"}


def parse_args():
    parser = argparse.ArgumentParser(description="Run PPE detection inference on video(s)")
    parser.add_argument("--model", type=str, required=True, help="Path to trained weights (e.g. best.pt)")
    parser.add_argument("--source", type=str, required=True, help="Path to a video file or a folder of videos")
    parser.add_argument("--output", type=str, default="outputs", help="Directory to save annotated videos + logs")
    parser.add_argument("--conf", type=float, default=0.4, help="Confidence threshold")
    parser.add_argument("--iou", type=float, default=0.5, help="IoU threshold for NMS")
    parser.add_argument("--imgsz", type=int, default=640, help="Inference image size")
    parser.add_argument("--device", type=str, default="0", help="'0' for GPU 0, 'cpu' for CPU")
    parser.add_argument("--no-log", action="store_true", help="Skip saving JSON/CSV detection logs")
    return parser.parse_args()


def get_video_files(source: Path):
    if source.is_file():
        return [source]
    if source.is_dir():
        return sorted(p for p in source.iterdir() if p.suffix.lower() in VIDEO_EXTENSIONS)
    raise FileNotFoundError(f"Source not found: {source}")


def run_inference_on_video(model, video_path: Path, output_dir: Path, args):
    print(f"\n Processing: {video_path.name}")

    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        print(f"  Could not open video: {video_path}")
        return None

    fps = cap.get(cv2.CAP_PROP_FPS) or 25
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    cap.release()

    out_video_path = output_dir / f"{video_path.stem}.mp4"
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(str(out_video_path), fourcc, fps, (width, height))

    detections_log = []
    frame_idx = 0

    results_stream = model.predict(
        source=str(video_path),
        conf=args.conf,
        iou=args.iou,
        imgsz=args.imgsz,
        device=args.device,
        stream=True,
        verbose=False,
    )

    for result in results_stream:
        frame_idx += 1
        writer.write(result.plot())  # frame with boxes/labels drawn

        if not args.no_log:
            for box in result.boxes:
                cls_id = int(box.cls[0])
                detections_log.append({
                    "frame": frame_idx,
                    "timestamp_sec": round(frame_idx / fps, 3),
                    "class": model.names[cls_id],
                    "confidence": round(float(box.conf[0]), 4),
                    "bbox_xyxy": [round(v, 2) for v in box.xyxy[0].tolist()],
                })

        if frame_idx % 50 == 0:
            print(f"  ...frame {frame_idx}/{total_frames}")

    writer.release()
    print(f"  Saved annotated video -> {out_video_path}")

    if not args.no_log:
        json_path = output_dir / f"{video_path.stem}_detections.json"
        with open(json_path, "w") as f:
            json.dump(detections_log, f, indent=2)

        csv_path = output_dir / f"{video_path.stem}_detections.csv"
        with open(csv_path, "w", newline="") as f:
            csv_writer = csv.writer(f)
            csv_writer.writerow(["frame", "timestamp_sec", "class", "confidence", "x1", "y1", "x2", "y2"])
            for d in detections_log:
                csv_writer.writerow([d["frame"], d["timestamp_sec"], d["class"], d["confidence"], *d["bbox_xyxy"]])

        print(f"  Saved detection log -> {json_path.name}, {csv_path.name}")

    return {
        "video": video_path.name,
        "total_frames": frame_idx,
        "total_detections": len(detections_log),
    }


def main():
    args = parse_args()

    model_path = Path(args.model)
    source_path = Path(args.source)
    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)

    if not model_path.exists():
        raise FileNotFoundError(f"Model weights not found: {model_path}")

    print(f"Loading model: {model_path}")
    model = YOLO(str(model_path))

    videos = get_video_files(source_path)
    if not videos:
        print("No video files found at source path.")
        return

    print(f"Found {len(videos)} video(s) to process.")

    summary = []
    start_time = datetime.now()

    for video_path in videos:
        result = run_inference_on_video(model, video_path, output_dir, args)
        if result:
            summary.append(result)

    elapsed = (datetime.now() - start_time).total_seconds()

    print("\n" + "=" * 50)
    print(f"Done. Processed {len(summary)} video(s) in {elapsed:.1f}s")
    for s in summary:
        print(f"  - {s['video']}: {s['total_frames']} frames, {s['total_detections']} detections")
    print(f"Outputs saved in: {output_dir.resolve()}")


if __name__ == "__main__":
    main()
