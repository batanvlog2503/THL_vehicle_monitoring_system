import React, { useRef, useEffect, useState, useCallback } from "react"

import "./Webcam.css"

const CAMERA_COLORS = [
  "#00d4ff",
  "#ff6b35",
  "#7fff00",
  "#ff3cac",
  "#f5c518",
  "#a855f7",
  "#22d3ee",
  "#fb923c",
]

const generateId = () => Math.random().toString(36).substr(2, 9)

const CameraZone = ({ zone, onRemove, onLabel }) => {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const [stream, setStream] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [labelInput, setLabelInput] = useState(zone.label)
  const [camOn, setCamOn] = useState(true)

  const startCamera = useCallback(() => {
    setLoading(true)
    setError(null)
    navigator.mediaDevices
      .getUserMedia({
        video: {
          deviceId: zone.deviceId ? { exact: zone.deviceId } : undefined,
        },
      })
      .then((s) => {
        streamRef.current = s
        setStream(s)
        if (videoRef.current) videoRef.current.srcObject = s
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message || "Cannot access camera")
        setLoading(false)
      })
  }, [zone.deviceId])

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) videoRef.current.srcObject = null
    setStream(null)
  }, [])

  useEffect(() => {
    startCamera()
    return () => stopCamera()
  }, [zone.deviceId])

  const toggleCam = () => {
    if (camOn) {
      stopCamera()
      setCamOn(false)
    } else {
      setCamOn(true)
      startCamera()
    }
  }

  const handleLabelSave = () => {
    onLabel(zone.id, labelInput)
    setEditing(false)
  }

  return (
    <div
      className="camera-zone"
      style={{ "--zone-color": zone.color }}
    >
      <div className="zone-header">
        <span className="zone-dot" />
        {editing ? (
          <div className="zone-label-edit">
            <input
              autoFocus
              value={labelInput}
              onChange={(e) => setLabelInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLabelSave()}
              className="zone-label-input"
            />
            <button
              className="zone-btn save"
              onClick={handleLabelSave}
            >
              ✓
            </button>
          </div>
        ) : (
          <span
            className="zone-label"
            onDoubleClick={() => setEditing(true)}
            title="Double-click to rename"
          >
            {zone.label}
          </span>
        )}
        <div className="zone-actions">
          <button
            className="zone-btn edit"
            onClick={() => setEditing((e) => !e)}
            title="Rename"
          >
            <i className="fa-solid fa-pen" />
          </button>
          <button
            className={`zone-btn toggle ${camOn ? "cam-on" : "cam-off"}`}
            onClick={toggleCam}
            title={camOn ? "Tắt camera" : "Bật camera"}
          >
            <i
              className={`fa-solid ${camOn ? "fa-video" : "fa-video-slash"}`}
            />
          </button>
          <button
            className="zone-btn remove"
            onClick={() => onRemove(zone.id)}
            title="Remove"
          >
            <i className="fa-solid fa-xmark" />
          </button>
        </div>
      </div>

      <div className="zone-video-wrapper">
        {!camOn && (
          <div className="zone-overlay zone-off">
            <i className="fa-solid fa-video-slash" />
            <span>Camera Off</span>
            <button
              className="zone-btn-reopen"
              onClick={toggleCam}
            >
              <i className="fa-solid fa-video" /> Bật lại
            </button>
          </div>
        )}
        {camOn && loading && (
          <div className="zone-overlay">
            <div className="zone-spinner" />
            <span>Connecting…</span>
          </div>
        )}
        {camOn && error && (
          <div className="zone-overlay zone-error">
            <i className="fa-solid fa-triangle-exclamation" />
            <span>{error}</span>
          </div>
        )}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`zone-video ${!camOn || loading || error ? "hidden" : ""}`}
        />
        {camOn && !loading && !error && (
          <div className="zone-live-badge">
            <span className="live-dot" /> LIVE
          </div>
        )}
      </div>
    </div>
  )
}

const Webcam = () => {
  const [zones, setZones] = useState([])
  const [devices, setDevices] = useState([])
  const [selectedDevice, setSelectedDevice] = useState("")
  const [colorIndex, setColorIndex] = useState(0)
  const [zoneCount, setZoneCount] = useState(0)

  useEffect(() => {
    navigator.mediaDevices.enumerateDevices().then((devs) => {
      const cams = devs.filter((d) => d.kind === "videoinput")
      setDevices(cams)
      if (cams.length > 0) setSelectedDevice(cams[0].deviceId)
    })
  }, [])

  const addZone = () => {
    const count = zoneCount + 1
    setZoneCount(count)
    setZones((prev) => [
      ...prev,
      {
        id: generateId(),
        deviceId: selectedDevice || undefined,
        label: `Camera Zone ${count}`,
        color: CAMERA_COLORS[colorIndex % CAMERA_COLORS.length],
      },
    ])
    setColorIndex((i) => i + 1)
  }

  const removeZone = useCallback((id) => {
    setZones((prev) => prev.filter((z) => z.id !== id))
  }, [])

  const labelZone = useCallback((id, label) => {
    setZones((prev) => prev.map((z) => (z.id === id ? { ...z, label } : z)))
  }, [])

  return (
    <div className="webcam-page">
      <div className="webcam-topbar">
        <div className="webcam-title">
          <i className="fa-solid fa-camera-cctv" />
          <span>Camera Monitor</span>
          {zones.length > 0 && (
            <span className="zone-count-badge">{zones.length} active</span>
          )}
        </div>
        <div className="webcam-controls">
          {devices.length > 1 && (
            <select
              className="device-select"
              value={selectedDevice}
              onChange={(e) => setSelectedDevice(e.target.value)}
            >
              {devices.map((d) => (
                <option
                  key={d.deviceId}
                  value={d.deviceId}
                >
                  {d.label || `Camera ${d.deviceId.slice(0, 6)}`}
                </option>
              ))}
            </select>
          )}
          <button
            className="add-zone-btn"
            onClick={addZone}
          >
            <i className="fa-solid fa-plus" />
            Add Camera Zone
          </button>
        </div>
      </div>

      {zones.length === 0 ? (
        <div className="webcam-empty">
          <div className="empty-icon">
            <i className="fa-solid fa-video-slash" />
          </div>
          <h2>No Camera Zones</h2>
          <p>
            Click <strong>Add Camera Zone</strong> to start monitoring
          </p>
          <button
            className="add-zone-btn large"
            onClick={addZone}
          >
            <i className="fa-solid fa-plus" />
            Add Your First Zone
          </button>
        </div>
      ) : (
        <div className={`zones-grid zones-${Math.min(zones.length, 4)}`}>
          {zones.map((zone) => (
            <CameraZone
              key={zone.id}
              zone={zone}
              onRemove={removeZone}
              onLabel={labelZone}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default Webcam
