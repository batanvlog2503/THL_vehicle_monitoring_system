function buildStats(logs) {
  return {
    tongSoVideo: logs.length,

    danhSachVideo: logs.map((l, i) => ({
      stt: i + 1,

      videoName: l.videoName,

      createdAt: l.createdAt,

      soLanPhatHien: l.detections?.length || 0,

      cacNhan: [...new Set(l.detections?.map((d) => d.label) || [])],
    })),
  }
}

module.exports = { buildStats }
