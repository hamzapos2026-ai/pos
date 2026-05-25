// File: src/hooks/useCameraCapture.js
// Purpose: Camera capture for barcode scanning / item photos
// Features: Open camera, capture image, close camera, base64 output
// Offline: Yes — uses browser MediaDevices API
// Dependencies: react

import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * useCameraCapture
 *
 * Provides camera access for barcode image capture.
 * Uses rear camera by default (environment facing).
 *
 * @returns {{
 *   isOpen:        boolean,
 *   isSupported:   boolean,
 *   videoRef:      React.RefObject,
 *   capturedImage: string|null,   // base64 data URL
 *   openCamera:    function,
 *   closeCamera:   function,
 *   captureFrame:  function,      // returns base64 string
 *   clearCapture:  function,
 *   error:         string|null,
 * }}
 */
export const useCameraCapture = () => {
  const [isOpen,        setIsOpen]        = useState(false);
  const [capturedImage, setCapturedImage]  = useState(null);
  const [error,         setError]         = useState(null);

  const videoRef   = useRef(null);
  const streamRef  = useRef(null);
  const canvasRef  = useRef(null);

  // Lazily create canvas
  const getCanvas = useCallback(() => {
    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas');
    }
    return canvasRef.current;
  }, []);

  // Stop stream helper
  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }, []);

  // Open camera
  const openCamera = useCallback(async ({ facingMode = 'environment' } = {}) => {
    setError(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Camera not supported in this browser');
      return false;
    }

    try {
      const constraints = {
        video: {
          facingMode,
          width:  { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }

      setIsOpen(true);
      return true;
    } catch (err) {
      const msg = err.name === 'NotAllowedError'
        ? 'Camera permission denied'
        : err.name === 'NotFoundError'
          ? 'No camera found'
          : `Camera error: ${err.message}`;
      setError(msg);
      console.error('[useCameraCapture] openCamera error:', err);
      return false;
    }
  }, []);

  // Close camera
  const closeCamera = useCallback(() => {
    stopStream();
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsOpen(false);
  }, [stopStream]);

  // Capture current frame as base64
  const captureFrame = useCallback((quality = 0.85) => {
    const video  = videoRef.current;
    const canvas = getCanvas();

    if (!video || !video.videoWidth) {
      setError('Video not ready');
      return null;
    }

    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    setCapturedImage(dataUrl);
    return dataUrl;
  }, [getCanvas]);

  // Clear captured image
  const clearCapture = useCallback(() => {
    setCapturedImage(null);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => stopStream();
  }, [stopStream]);

  return {
    isOpen,
    isSupported: !!(navigator.mediaDevices?.getUserMedia),
    videoRef,
    capturedImage,
    openCamera,
    closeCamera,
    captureFrame,
    clearCapture,
    error,
  };
};

export default useCameraCapture;
