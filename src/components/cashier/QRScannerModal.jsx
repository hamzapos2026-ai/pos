// src/components/cashier/QRScannerModal.jsx
// ✨ NEW: Camera + USB scanner with hash verification + Framer Motion
// ✅ Dual mode: Camera OR Manual entry tab
// ✅ Green glow on success, red shake on failure
// ✅ jsQR for camera decoding (CDN-free fallback)

import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Camera, Keyboard, ScanLine, CheckCircle, AlertTriangle,
  Loader2, Hash, Zap, CameraOff, RotateCcw, Shield,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { parseQRCode, verifyHash } from "../../services/qrHashService";

const QRScannerModal = ({ isDark, orders = [], onResult, onClose }) => {
  const [tab, setTab] = useState("camera"); // "camera" or "manual"
  const [manualCode, setManualCode] = useState("");
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [lastScan, setLastScan] = useState(null); // {valid, code, glow}
  const [scanning, setScanning] = useState(false);
  const [mismatchData, setMismatchData] = useState(null);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const scanIntervalRef = useRef(null);
  const lastDetectedRef = useRef({ code: "", time: 0 });

  const cardBg = isDark ? "bg-[#1a1208]" : "bg-white";
  const border = isDark ? "border-[#2a1f0f]" : "border-gray-200";
  const text = isDark ? "text-gray-100" : "text-gray-900";
  const subText = isDark ? "text-gray-400" : "text-gray-500";
  const inputBg = isDark
    ? "bg-[#120d06] border-[#2a1f0f] text-gray-100 placeholder:text-gray-600"
    : "bg-gray-50 border-gray-200 text-gray-900 placeholder:text-gray-400";

  // ESC close
  useEffect(() => {
    const h = (e) => {
      if (e.key === "Escape" && !scanning) {
        e.preventDefault();
        onClose();
      }
      if (e.key === "Tab" && !scanning) {
        e.preventDefault();
        setTab((t) => (t === "camera" ? "manual" : "camera"));
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose, scanning]);

  // Dynamically load jsQR
  const ensureJsQR = useCallback(async () => {
    if (window.jsQR) return window.jsQR;
    return new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-jsqr]');
      if (existing) {
        existing.addEventListener("load", () => resolve(window.jsQR));
        return;
      }
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js";
      script.setAttribute("data-jsqr", "true");
      script.onload = () => resolve(window.jsQR);
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }, []);

  // Process scanned code
  const processCode = useCallback(
    (rawCode) => {
      if (!rawCode || scanning) return;

      const now = Date.now();
      if (
        rawCode === lastDetectedRef.current.code &&
        now - lastDetectedRef.current.time < 2000
      ) {
        return; // Debounce same code
      }
      lastDetectedRef.current = { code: rawCode, time: now };
      setScanning(true);

      const parsed = parseQRCode(rawCode);
      if (!parsed) {
        setLastScan({ valid: false, code: rawCode });
        setTimeout(() => {
          setLastScan(null);
          setScanning(false);
        }, 1500);
        return;
      }

      const found = orders.find(
        (o) =>
          (o.billSerial || "").toUpperCase() === parsed.id ||
          (o.serialNo || "").toUpperCase() === parsed.id ||
          o.id === parsed.id
      );

      if (!found) {
        setLastScan({ valid: false, code: parsed.id });
        toast.error(`Bill "${parsed.id}" not found`, {
          icon: <AlertTriangle className="w-4 h-4 text-red-500" />,
        });
        setTimeout(() => {
          setLastScan(null);
          setScanning(false);
        }, 1500);
        return;
      }

      // Verify hash
      const verification = verifyHash(parsed, found);
      if (!verification.valid && verification.mismatch) {
        setLastScan({ valid: false, code: parsed.id });
        setMismatchData({ ...verification.mismatch, code: rawCode, bill: found });
        setScanning(false);
        return;
      }

      // ✅ Success
      setLastScan({ valid: true, code: parsed.id, glow: true });
      setTimeout(() => {
        onResult(rawCode);
      }, 600);
    },
    [orders, onResult, scanning]
  );

  // Start camera
  const startCamera = useCallback(async () => {
    setCameraError("");
    setCameraReady(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCameraReady(true);
      }
      const jsQR = await ensureJsQR();
      if (!jsQR) throw new Error("QR library load failed");

      // Start scanning loop
      scanIntervalRef.current = setInterval(() => {
        if (!videoRef.current || !canvasRef.current || scanning) return;
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (video.readyState !== 4) return;

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, canvas.width, canvas.height, {
          inversionAttempts: "dontInvert",
        });

        if (code && code.data) {
          processCode(code.data);
        }
      }, 200);
    } catch (err) {
      console.error("Camera error:", err);
      setCameraError(err.message || "Camera access denied");
      setCameraReady(false);
    }
  }, [ensureJsQR, processCode, scanning]);

  const stopCamera = useCallback(() => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraReady(false);
  }, []);

  // Camera lifecycle
  useEffect(() => {
    if (tab === "camera" && !mismatchData) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [tab, mismatchData, startCamera, stopCamera]);

  // Manual submit
  const handleManualSubmit = () => {
    if (!manualCode.trim()) {
      toast.error("Enter a code");
      return;
    }
    processCode(manualCode.trim());
  };

  // Mismatch handlers
  const handleMismatchContinue = () => {
    if (mismatchData?.code) {
      onResult(mismatchData.code);
    }
    setMismatchData(null);
  };

  const handleMismatchManual = () => {
    setMismatchData(null);
    setTab("manual");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4" data-modal-open="true">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/70 backdrop-blur-md"
        onClick={() => !scanning && onClose()}
      />

      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 20 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className={`relative w-full max-w-md ${cardBg} rounded-3xl border ${border} shadow-2xl flex flex-col overflow-hidden`}
        style={{ maxHeight: "95vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`flex items-center justify-between px-5 py-4 border-b ${border} flex-shrink-0`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl flex items-center justify-center shadow-lg shadow-amber-500/25">
              <ScanLine className="text-white w-5 h-5" />
            </div>
            <div>
              <h2 className={`font-bold text-base ${text}`}>QR Scanner</h2>
              <p className={`text-xs ${subText}`}>TAB to switch · ESC to close</p>
            </div>
          </div>
          <motion.button
            whileHover={{ scale: 1.1, rotate: 90 }}
            whileTap={{ scale: 0.9 }}
            onClick={onClose}
            disabled={scanning}
            className={`p-2 rounded-xl ${subText} hover:text-red-500 ${
              isDark ? "hover:bg-red-500/15" : "hover:bg-red-50"
            } disabled:opacity-50`}
          >
            <X className="w-5 h-5" />
          </motion.button>
        </div>

        {/* Tabs */}
        <div className={`flex gap-1 p-1 mx-4 mt-4 rounded-xl ${
          isDark ? "bg-[#120d06]" : "bg-gray-100"
        }`}>
          <button
            onClick={() => setTab("camera")}
            disabled={scanning}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${
              tab === "camera"
                ? "bg-amber-500 text-white shadow-md shadow-amber-500/25"
                : `${subText} hover:bg-amber-500/10`
            }`}
          >
            <Camera className="w-4 h-4" /> Camera
          </button>
          <button
            onClick={() => setTab("manual")}
            disabled={scanning}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${
              tab === "manual"
                ? "bg-amber-500 text-white shadow-md shadow-amber-500/25"
                : `${subText} hover:bg-amber-500/10`
            }`}
          >
            <Keyboard className="w-4 h-4" /> Manual
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          <AnimatePresence mode="wait">
            {/* MISMATCH OVERLAY */}
            {mismatchData ? (
              <motion.div
                key="mismatch"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className={`rounded-2xl border p-5 ${
                  isDark
                    ? "bg-red-900/20 border-red-700/50"
                    : "bg-red-50 border-red-200"
                }`}
              >
                <div className="flex items-center gap-3 mb-4">
                  <motion.div
                    animate={{ x: [0, -10, 10, -10, 10, 0] }}
                    transition={{ duration: 0.5 }}
                    className="w-12 h-12 bg-red-500/20 rounded-2xl flex items-center justify-center"
                  >
                    <AlertTriangle className="text-red-500 w-6 h-6" />
                  </motion.div>
                  <div>
                    <h3 className="text-base font-bold text-red-500">Data Mismatch Detected</h3>
                    <p className={`text-xs ${subText} mt-0.5`}>
                      QR data does not match bill record
                    </p>
                  </div>
                </div>

                <div className="space-y-2 mb-4">
                  <div className={`flex justify-between p-3 rounded-xl ${
                    isDark ? "bg-[#120d06]" : "bg-white"
                  }`}>
                    <span className={`text-sm ${subText}`}>QR Amount:</span>
                    <span className={`text-sm font-bold ${text} tabular-nums`}>
                      Rs.{(mismatchData.qrAmount || 0).toLocaleString()}
                    </span>
                  </div>
                  <div className={`flex justify-between p-3 rounded-xl ${
                    isDark ? "bg-[#120d06]" : "bg-white"
                  }`}>
                    <span className={`text-sm ${subText}`}>Bill Amount:</span>
                    <span className="text-sm font-bold text-amber-500 tabular-nums">
                      Rs.{(mismatchData.billAmount || 0).toLocaleString()}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={() => setMismatchData(null)}
                    className={`py-2 rounded-xl border ${border} text-xs font-bold ${subText} hover:bg-gray-500/5`}
                  >
                    Cancel
                  </motion.button>
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={handleMismatchManual}
                    className="py-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-500 text-xs font-bold hover:bg-amber-500/25"
                  >
                    Manual
                  </motion.button>
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={handleMismatchContinue}
                    className="py-2 rounded-xl bg-red-500 text-white text-xs font-bold hover:bg-red-600"
                  >
                    Continue
                  </motion.button>
                </div>
              </motion.div>
            ) : tab === "camera" ? (
              /* CAMERA TAB */
              <motion.div
                key="camera"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-3"
              >
                <div className={`relative aspect-square rounded-2xl overflow-hidden border-2 ${
                  lastScan?.valid
                    ? "border-emerald-500 shadow-lg shadow-emerald-500/50"
                    : lastScan && !lastScan.valid
                    ? "border-red-500 shadow-lg shadow-red-500/50"
                    : isDark
                    ? "border-[#2a1f0f]"
                    : "border-gray-200"
                } ${isDark ? "bg-[#120d06]" : "bg-gray-900"}`}>
                  {cameraError ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center">
                      <CameraOff className="w-12 h-12 text-red-500 mb-3" />
                      <p className="text-sm font-bold text-red-500 mb-1">Camera Unavailable</p>
                      <p className={`text-xs ${subText} mb-3`}>{cameraError}</p>
                      <button
                        onClick={startCamera}
                        className="px-3 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-bold flex items-center gap-1.5"
                      >
                        <RotateCcw className="w-3 h-3" /> Retry
                      </button>
                    </div>
                  ) : (
                    <>
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-cover"
                      />
                      <canvas ref={canvasRef} className="hidden" />

                      {/* Scan frame overlay */}
                      {cameraReady && !lastScan && (
                        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                          <div className="relative w-3/5 h-3/5">
                            {/* Corners */}
                            <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-amber-500 rounded-tl-lg" />
                            <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-amber-500 rounded-tr-lg" />
                            <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-amber-500 rounded-bl-lg" />
                            <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-amber-500 rounded-br-lg" />
                            {/* Scanning line */}
                            <motion.div
                              animate={{ y: ["0%", "100%", "0%"] }}
                              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                              className="absolute left-0 right-0 h-0.5 bg-amber-500 shadow-lg shadow-amber-500/50"
                            />
                          </div>
                        </div>
                      )}

                      {/* Success overlay */}
                      <AnimatePresence>
                        {lastScan?.valid && (
                          <motion.div
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0, opacity: 0 }}
                            className="absolute inset-0 bg-emerald-500/30 flex items-center justify-center"
                          >
                            <div className="w-20 h-20 bg-emerald-500 rounded-full flex items-center justify-center shadow-2xl">
                              <CheckCircle className="w-12 h-12 text-white" />
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* Failure overlay */}
                      <AnimatePresence>
                        {lastScan && !lastScan.valid && (
                          <motion.div
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{
                              scale: 1,
                              opacity: 1,
                              x: [0, -10, 10, -10, 10, 0],
                            }}
                            exit={{ scale: 0, opacity: 0 }}
                            className="absolute inset-0 bg-red-500/30 flex items-center justify-center"
                          >
                            <div className="w-20 h-20 bg-red-500 rounded-full flex items-center justify-center shadow-2xl">
                              <X className="w-12 h-12 text-white" />
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* Loading */}
                      {!cameraReady && !cameraError && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <Loader2 className="w-10 h-10 text-amber-500 animate-spin mb-3" />
                          <p className={`text-sm font-bold text-white`}>Starting camera...</p>
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div className={`flex items-center gap-2 text-xs ${subText} justify-center`}>
                  <div className={`w-2 h-2 rounded-full ${
                    cameraReady ? "bg-emerald-500 animate-pulse" : "bg-gray-500"
                  }`} />
                  <span>
                    {cameraReady ? "Point camera at QR code" : "Initializing..."}
                  </span>
                </div>
              </motion.div>
            ) : (
              /* MANUAL TAB */
              <motion.div
                key="manual"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-4"
              >
                <div className={`p-4 rounded-2xl border ${
                  isDark ? "bg-[#120d06] border-[#2a1f0f]" : "bg-gray-50 border-gray-200"
                }`}>
                  <div className="flex items-center gap-2 mb-3">
                    <Keyboard className="w-4 h-4 text-amber-500" />
                    <span className={`text-sm font-bold ${text}`}>Enter Bill Serial</span>
                  </div>
                  <div className="relative">
                    <Hash className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${subText}`} />
                    <input
                      type="text"
                      value={manualCode}
                      onChange={(e) => setManualCode(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleManualSubmit();
                        }
                      }}
                      autoFocus
                      placeholder="AON-BIL-XXXXXX-000001"
                      className={`w-full pl-10 pr-3 py-3 rounded-xl border text-sm font-mono font-bold uppercase focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition-all ${inputBg}`}
                    />
                  </div>
                  <p className={`text-[10px] ${subText} mt-2`}>
                    Enter the full bill serial number or short code
                  </p>
                </div>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleManualSubmit}
                  disabled={!manualCode.trim() || scanning}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold flex items-center justify-center gap-2 shadow-lg shadow-amber-500/25 disabled:opacity-50 transition-all"
                >
                  {scanning ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Zap className="w-5 h-5" />
                  )}
                  {scanning ? "Verifying..." : "Verify & Process"}
                </motion.button>

                <div className={`p-3 rounded-xl border ${
                  isDark ? "bg-amber-900/10 border-amber-700/30" : "bg-amber-50 border-amber-200"
                }`}>
                  <div className="flex items-start gap-2">
                    <Shield className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                    <p className={`text-[11px] ${subText}`}>
                      Manual entry will be verified against the bill record.
                      Mismatches will be logged for audit.
                    </p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Last scan info */}
        {lastScan && (
          <div className={`px-5 py-2 border-t ${border} flex-shrink-0 ${
            lastScan.valid
              ? isDark ? "bg-emerald-900/20" : "bg-emerald-50"
              : isDark ? "bg-red-900/20" : "bg-red-50"
          }`}>
            <p className={`text-xs font-bold text-center ${
              lastScan.valid ? "text-emerald-500" : "text-red-500"
            }`}>
              {lastScan.valid ? "✓ Verified" : "✗ Failed"}: {lastScan.code}
            </p>
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default QRScannerModal;