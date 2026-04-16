import cv2

cap = cv2.VideoCapture("test/testvd.mp4")

while True:
    ret, frame = cap.read()

    if not ret:
        break
    frame=cv2.resize(frame,(640,640))
    cv2.imshow("Video", frame)

    if cv2.waitKey(25) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows() 