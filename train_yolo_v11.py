from ultralytics import YOLO
import multiprocessing

def main():
    multiprocessing.freeze_support()

    model = YOLO("yolo11n.pt")

    model.train(
        data="coco8.yaml",
        epochs=60,
        imgsz=768,
        batch=4,
        lr0=0.0001,
        optimizer="AdamW",
        pretrained=True,
        device=0,
        name="License_Plate_Model-v11",

        mosaic=0.0,
        mixup=0.0,
        translate=0.01,
        scale=0.03,
        degrees=0.5,
        shear=0.0,
        hsv_h=0.01,
        hsv_s=0.2,
        hsv_v=0.2,

        project="E:/LPR_ttcs/runs",

        patience=20,
        deterministic=True,
        workers=1,
        amp=True,
        dropout=0.05,
        close_mosaic=0,

        freeze=0,
    )

if __name__ == "__main__":
    main()
