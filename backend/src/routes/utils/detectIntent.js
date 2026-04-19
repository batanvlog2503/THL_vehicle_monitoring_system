function detectIntent(message) {
  const msg = message.toLowerCase()

  let targetDate = null
  const dateMatch = msg.match(/(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{4}))?/)
  if (dateMatch) {
    const year = dateMatch[3] || new Date().getFullYear()
    const month = dateMatch[2].padStart(2, "0")
    const day = dateMatch[1].padStart(2, "0")
    targetDate = `${year}-${month}-${day}`
  }
  if (/hôm nay|today/.test(msg))
    targetDate = new Date().toISOString().slice(0, 10)
  if (/hôm qua|yesterday/.test(msg)) {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    targetDate = d.toISOString().slice(0, 10)
  }

  return {
    targetDate,
    wantsVideoCount:
      /bao nhiêu video|số video|tổng.*video|how many video/i.test(msg),
    wantsViolation: /vi phạm|violation|xe vi phạm/i.test(msg),
    wantsList: /danh sách|liệt kê|list/i.test(msg),
    wantsLabel: /nhãn|label|loại|đối tượng|object/i.test(msg),
  }
}

module.exports = { detectIntent }
