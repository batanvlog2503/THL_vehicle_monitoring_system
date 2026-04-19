from ultralytics import YOLO
import multiprocessing
import os

def main():
    multiprocessing.freeze_support()

    os.makedirs(r"E:/LPR_ttcs/runs", exist_ok=True)

    model = YOLO("yolo11n.pt")

    model.train(
        data=r"E:/LPR_ttcs/data.yaml",
        epochs=80,
        imgsz=640,
        batch=16,
        device=0,
        workers=0,
        amp=False,
        cache=False,

        optimizer="AdamW",
        lr0=0.001,
        pretrained=True,

        mosaic=0.2,
        mixup=0.0,
        copy_paste=0.0,
        degrees=2.0,
        translate=0.05,
        scale=0.15,
        shear=0.0,
        perspective=0.0,
        fliplr=0.5,
        flipud=0.0,
        hsv_h=0.01,
        hsv_s=0.3,
        hsv_v=0.2,

        patience=20,
        close_mosaic=10,

        project=r"E:/LPR_ttcs/runs",
        name="plate_only_train",
        exist_ok=True
    )

if __name__ == "__main__":
    main()
