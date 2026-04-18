from ultralytics import YOLO
import cv2

def main():
    # load model (pretrained hoặc model m train)
    model = YOLO("yolo11n.pt")
    # model = YOLO("models/best.pt")  # nếu dùng model m train

    # đọc ảnh
    img = cv2.imread("test/test5.jpg")

    # detect (lọc chỉ phương tiện)
    results = model.predict(
        img,
        conf=0.4,
        classes=[2, 3, 5, 7]  # car, motorcycle, bus, truck
    )

    # vẽ kết quả
    annotated = results[0].plot()

    # hiển thị bằng OpenCV
    cv2.imshow("Result", annotated)
    cv2.waitKey(0)
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()