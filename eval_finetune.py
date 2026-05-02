from ultralytics import YOLO

def main():
    # load pretrained model
    model = YOLO(r"C:\Users\Admin\THL_vehicle_monitoring_system\backup\vehicle_model_v23\weights\best.pt")

    # đánh giá
    metrics = model.val(
        data=r"C:\Users\Admin\THL_vehicle_monitoring_system\trains\dataset_1\data.yaml"
    )

    print("mAP50:", metrics.box.map50)
    print("mAP50-95:", metrics.box.map)

if __name__ == "__main__":
    main()