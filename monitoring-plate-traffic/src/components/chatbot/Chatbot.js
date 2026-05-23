// chatbot logic
function matchQuery(input) {
  const lower = input.toLowerCase()

  for (const pattern of QUERY_PATTERNS) {
    const hit = pattern.keywords.some((k) => lower.includes(k))
    if (hit) return pattern.type
  }
  return "unknown"
}

function extractTime(input) {
  if (input.includes("hôm nay")) return "today"
  if (input.includes("hôm qua")) return "yesterday"
  if (input.includes("tuần này")) return "this_week"
  if (input.includes("tháng này")) return "this_month"

  // extract giờ cụ thể: "lúc 8 giờ", "từ 7h đến 9h"
  const hourMatch = input.match(/(\d{1,2})[h giờ]/)
  if (hourMatch) return { hour: parseInt(hourMatch[1]) }

  return "today" // default
}

function extractPlate(input) {
  // Match biển số VN: 51A-123.45 hoặc 30A-9999
  const match = input.match(/\d{2}[A-Z]-\d{3,4}\.?\d{0,2}/)
  return match ? match[0] : null
}

async function handleQuery(input) {
  const type = matchQuery(input)
  const time = extractTime(input)
  const plate = extractPlate(input)

  switch (type) {
    case "violations":
      return await api.get(`/stats/violations?period=${time}`)

    case "plate_lookup":
      if (plate) return await api.get(`/stats/plate/${plate}`)
      return { ask: "Bạn muốn tìm biển số nào?" }

    case "summary":
      return await api.get(`/stats/summary?period=${time}`)

    case "time_query":
      return await api.get(`/stats/by-hour?period=${time}`)

    case "vehicle_type":
      return await api.get(`/stats/by-type?period=${time}`)

    default:
      return { suggest: true } // hiện câu hỏi gợi ý
  }
}
