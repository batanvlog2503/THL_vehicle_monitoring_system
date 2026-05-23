// utils/buildStats.js
// ====================
// Tính toán đầy đủ thống kê từ logs.
// Có DEBUG log để xác nhận dữ liệu thực tế trong DB.

function normalize(str) {
  return (str || "").toLowerCase().trim()
}

// ─── DEBUG: in ra sample detection để xem field thực tế ───────────────────────
function debugSampleDetection(logs) {
  if (!logs || logs.length === 0) return

  const firstLog = logs[0]
  const dets     = firstLog.detections || []

  console.log("═══════════════════════════════════════════")
  console.log("[DEBUG] Log đầu tiên:")
  console.log("  videoName :", firstLog.videoName)
  console.log("  createdAt :", firstLog.createdAt)
  console.log("  speedLimit:", firstLog.speedLimit)
  console.log("  detections.length:", dets.length)

  if (dets.length > 0) {
    const sample = dets[0]
    console.log("[DEBUG] Detection đầu tiên (raw):", JSON.stringify(sample, null, 2))
    console.log("[DEBUG] Các field có giá trị:")
    console.log("  frame  :", sample.frame)
    console.log("  id     :", sample.id)
    console.log("  label  :", sample.label)
    console.log("  conf   :", sample.conf)
    console.log("  speed  :", sample.speed,   "← null/undefined = chưa lưu")
    console.log("  status :", sample.status,  "← null/undefined = chưa lưu")
    console.log("  plate  :", sample.plate,   "← null/undefined = chưa lưu")
    console.log("  time   :", sample.time)
    console.log("  time_ms:", sample.time_ms)
  }

  // Kiểm tra nhanh toàn bộ logs
  const allDets    = logs.flatMap((l) => l.detections || [])
  const hasSpeed   = allDets.filter((d) => d.speed  != null && d.speed  !== "").length
  const hasStatus  = allDets.filter((d) => d.status != null && d.status !== "").length
  const hasPlate   = allDets.filter((d) => d.plate  != null && d.plate  !== "").length

  console.log("[DEBUG] Tổng detections:", allDets.length)
  console.log(`[DEBUG] Có speed  : ${hasSpeed}  / ${allDets.length}`)
  console.log(`[DEBUG] Có status : ${hasStatus} / ${allDets.length}`)
  console.log(`[DEBUG] Có plate  : ${hasPlate}  / ${allDets.length}`)
  console.log("═══════════════════════════════════════════")
}

// ─── Main function ─────────────────────────────────────────────────────────────
function buildStats(logs) {
  // In debug mỗi lần gọi (bỏ sau khi xác nhận OK)
  debugSampleDetection(logs)

  if (!logs || logs.length === 0) {
    return {
      tongSoVideo:           0,
      tongSoPhatHien:        0,
      tongSoViPham:          0,
      tongSoBinhThuong:      0,
      tongSoBienSoPhatHien:  0,
      coDataTocDo:           false,
      coDataViPham:          false,
      coDataBienSo:          false,
      nhanPhoThong:          [],
      topVideoNhieuPhatHien: [],
      topVideoNhieuViPham:   [],
      phatHienTheoNgay:      [],
      bay_ngay_gan_nhat:     [],
      danhSachVideo:         [],
    }
  }

  const allDetections = logs.flatMap((l) => l.detections || [])

  // ── Flag: có thực sự lưu các trường hay không ────────────────────────────────
  const coDataTocDo  = allDetections.some((d) => d.speed  != null && d.speed  !== "")
  const coDataViPham = allDetections.some((d) => d.status != null && d.status !== "")
  const coDataBienSo = allDetections.some((d) => d.plate  != null && d.plate  !== "")

  // ── Tổng quan ────────────────────────────────────────────────────────────────
  const tongSoPhatHien = allDetections.length

  const tongSoViPham = coDataViPham
    ? allDetections.filter((d) => normalize(d.status) === "violation").length
    : 0  // không có data → không bịa

  const tongSoBinhThuong = tongSoPhatHien - tongSoViPham

  const allPlates = coDataBienSo
    ? allDetections.map((d) => d.plate).filter((p) => p && p.trim() !== "")
    : []
  const bienSoDuyNhat       = [...new Set(allPlates)]
  const tongSoBienSoPhatHien = bienSoDuyNhat.length

  // ── Nhãn toàn cục ────────────────────────────────────────────────────────────
  const labelCount = {}
  allDetections.forEach((d) => {
    const lb = d.label || "unknown"
    labelCount[lb] = (labelCount[lb] || 0) + 1
  })
  const nhanPhoThong = Object.entries(labelCount)
    .map(([label, soLan]) => ({ label, soLan }))
    .sort((a, b) => b.soLan - a.soLan)

  // ── Theo từng video ──────────────────────────────────────────────────────────
  const danhSachVideo = logs.map((l, i) => {
    const detections = l.detections || []
    const speedLimit = l.speedLimit  || 60

    // --- Vi phạm ---
    const viPham = coDataViPham
      ? detections.filter((d) => normalize(d.status) === "violation")
      : []

    // Vi phạm tốc độ: status=violation HOẶC speed > speedLimit
    const viPhamTocDo = detections.filter((d) => {
      const isViolation = coDataViPham && normalize(d.status) === "violation"
      const isOverSpeed = coDataTocDo  && d.speed != null && d.speed > speedLimit
      return isViolation || isOverSpeed
    })

    // --- Tốc độ ---
    const speeds = coDataTocDo
      ? detections.map((d) => d.speed).filter((s) => s != null && s > 0)
      : []
    const tocDoTrungBinh =
      speeds.length > 0
        ? Math.round(speeds.reduce((a, b) => a + b, 0) / speeds.length)
        : null
    const tocDoCaoNhat  = speeds.length > 0 ? Math.max(...speeds) : null
    const tocDoThapNhat = speeds.length > 0 ? Math.min(...speeds) : null

    // Đối tượng vi phạm tốc độ cao nhất
    const viphamCoSpeed = viPhamTocDo.filter((d) => d.speed != null)
    const viPhamTocDoCaoNhat =
      viphamCoSpeed.length > 0
        ? viphamCoSpeed.reduce(
            (max, d) => (d.speed > (max.speed || 0) ? d : max),
            viphamCoSpeed[0],
          )
        : null

    // --- Nhãn trong video ---
    const labelInVideo = {}
    detections.forEach((d) => {
      const lb = d.label || "unknown"
      labelInVideo[lb] = (labelInVideo[lb] || 0) + 1
    })
    const cacNhanTheoSoLan = Object.entries(labelInVideo)
      .map(([label, soLan]) => ({ label, soLan }))
      .sort((a, b) => b.soLan - a.soLan)

    // --- Biển số trong video ---
    const platesInVideo = coDataBienSo
      ? [...new Set(
          detections.map((d) => d.plate).filter((p) => p && p.trim() !== ""),
        )]
      : []

    // --- Frame ---
    const frames  = detections.map((d) => d.frame).filter((f) => f != null)
    const frameDau  = frames.length > 0 ? Math.min(...frames) : null
    const frameCuoi = frames.length > 0 ? Math.max(...frames) : null

    // --- Thời điểm (ms) ---
    const times = detections.map((d) => d.time_ms).filter((t) => t != null)
    const thoiDiemDau  = times.length > 0 ? Math.min(...times) : null
    const thoiDiemCuoi = times.length > 0 ? Math.max(...times) : null

    return {
      stt:            i + 1,
      videoName:      l.videoName || "Không rõ",
      ngayPhanTich:   l.createdAt,
      gioiHanTocDo:   speedLimit,

      // Phát hiện
      tongSoPhatHien: detections.length,
      soViPham:       viPham.length,
      soBinhThuong:   detections.length - viPham.length,
      soViPhamTocDo:  viPhamTocDo.length,

      // Tốc độ (null nếu không có data)
      tocDoTrungBinh,
      tocDoCaoNhat,
      tocDoThapNhat,
      viPhamTocDoCaoNhat: viPhamTocDoCaoNhat
        ? {
            bienSo:   viPhamTocDoCaoNhat.plate || "không rõ",
            tocDo:    viPhamTocDoCaoNhat.speed,
            thoiDiem: viPhamTocDoCaoNhat.time   || null,
            nhan:     viPhamTocDoCaoNhat.label,
          }
        : null,

      // Nhãn & biển số
      cacNhanTheoSoLan,
      cacNhanDuyNhat: cacNhanTheoSoLan.map((n) => n.label),
      soLoaiNhan:     cacNhanTheoSoLan.length,
      bienSoPhatHien: platesInVideo,
      soBienSo:       platesInVideo.length,

      // Thời gian
      frameDau,
      frameCuoi,
      thoiDiemDau_ms:  thoiDiemDau,
      thoiDiemCuoi_ms: thoiDiemCuoi,
    }
  })

  // ── Top ──────────────────────────────────────────────────────────────────────
  const topVideoNhieuPhatHien = [...danhSachVideo]
    .sort((a, b) => b.tongSoPhatHien - a.tongSoPhatHien)
    .slice(0, 5)
    .map((v) => ({
      videoName:      v.videoName,
      tongSoPhatHien: v.tongSoPhatHien,
      ngayPhanTich:   v.ngayPhanTich,
    }))

  const topVideoNhieuViPham = [...danhSachVideo]
    .sort((a, b) => b.soViPham - a.soViPham)
    .slice(0, 5)
    .map((v) => ({
      videoName:    v.videoName,
      soViPham:     v.soViPham,
      ngayPhanTich: v.ngayPhanTich,
    }))

  // Xe chạy nhanh nhất toàn bộ (cross-video)
  const xeChayNhanhNhat = coDataTocDo
    ? (() => {
        let best = null
        danhSachVideo.forEach((v) => {
          if (
            v.viPhamTocDoCaoNhat &&
            (!best || v.viPhamTocDoCaoNhat.tocDo > best.tocDo)
          ) {
            best = { ...v.viPhamTocDoCaoNhat, videoName: v.videoName }
          }
        })
        return best
      })()
    : null

  // ── Theo ngày ────────────────────────────────────────────────────────────────
  const byDay = {}
  logs.forEach((l) => {
    const ngay = new Date(l.createdAt).toISOString().slice(0, 10)
    if (!byDay[ngay]) {
      byDay[ngay] = { ngay, soVideo: 0, soPhatHien: 0, soViPham: 0, soViPhamTocDo: 0 }
    }
    const dets = l.detections || []
    const sl   = l.speedLimit || 60
    byDay[ngay].soVideo      += 1
    byDay[ngay].soPhatHien   += dets.length
    byDay[ngay].soViPham     += coDataViPham
      ? dets.filter((d) => normalize(d.status) === "violation").length
      : 0
    byDay[ngay].soViPhamTocDo += dets.filter(
      (d) =>
        (coDataViPham && normalize(d.status) === "violation") ||
        (coDataTocDo  && d.speed != null && d.speed > sl),
    ).length
  })

  const phatHienTheoNgay = Object.values(byDay).sort(
    (a, b) => new Date(b.ngay) - new Date(a.ngay),
  )
  const bay_ngay_gan_nhat = phatHienTheoNgay.slice(0, 7)

  return {
    // Flags – AI dùng để biết data nào thực sự có
    coDataTocDo,
    coDataViPham,
    coDataBienSo,

    // Tổng quan
    tongSoVideo:           logs.length,
    tongSoPhatHien,
    tongSoViPham,
    tongSoBinhThuong,
    tongSoBienSoPhatHien,
    bienSoDuyNhat,

    // Nhãn toàn cục
    nhanPhoThong,

    // Đặc biệt
    xeChayNhanhNhat,       // xe vi phạm tốc độ cao nhất toàn bộ

    // Top
    topVideoNhieuPhatHien,
    topVideoNhieuViPham,

    // Theo ngày
    phatHienTheoNgay,
    bay_ngay_gan_nhat,

    // Chi tiết
    danhSachVideo,
  }
}

module.exports = { buildStats }

// function buildStats(logs) {
//   return {
//     tongSoVideo: logs.length,

//     danhSachVideo: logs.map((l, i) => ({
//       stt: i + 1,

//       videoName: l.videoName,

//       createdAt: l.createdAt,

//       soLanPhatHien: l.detections?.length || 0,

//       cacNhan: [...new Set(l.detections?.map((d) => d.label) || [])],
//     })),
//   }
// }

// module.exports = { buildStats }