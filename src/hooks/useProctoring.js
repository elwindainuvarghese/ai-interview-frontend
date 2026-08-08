import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';

export function useProctoring({ onTerminate, isEnabled = true }) {
  const [cameraActive, setCameraActive] = useState(false);
  const [micActive, setMicActive] = useState(false);
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const [lookingAwayCount, setLookingAwayCount] = useState(0);
  const [phoneDetectedCount, setPhoneDetectedCount] = useState(0);
  const [attentionScore, setAttentionScore] = useState(100);
  const [isTerminated, setIsTerminated] = useState(false);
  const [terminationReason, setTerminationReason] = useState('');
  const [activeWarning, setActiveWarning] = useState(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [proctorLogs, setProctorLogs] = useState([]);
  
  // Real-time AI Vision Tracking State
  const [facePosition, setFacePosition] = useState({
    x: 0.5,
    y: 0.5,
    width: 0.4,
    height: 0.5,
    isCentered: true,
    poseLabel: 'CENTERED',
    isPhoneDetected: false,
    faceCount: 1,
    debugInfo: 'X: 50% | Y: 50%'
  });

  const videoRef = useRef(null);
  const overlayCanvasRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const lookingAwayTimerRef = useRef(null);
  const noFaceTimerRef = useRef(null);
  const phoneTimerRef = useRef(null);
  const socketRef = useRef(null);
  const lastEmitTimeRef = useRef(0);

  const isLookingAwayRef = useRef(false);
  const isNoFaceRef = useRef(false);
  const isPhoneDetectedRef = useRef(false);
  // Stable ref for onTerminate callback to avoid stale closures in effects
  const onTerminateRef = useRef(onTerminate);
  useEffect(() => { onTerminateRef.current = onTerminate; }, [onTerminate]);

  const addLog = useCallback((message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setProctorLogs((prev) => [...prev, { time: timestamp, message, type }]);
  }, []);

  // 1. Setup Camera & Web Audio API Stream
  useEffect(() => {
    if (!isEnabled || isTerminated) return;

    let isMounted = true;

    async function setupMedia() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, frameRate: 30 },
          audio: true
        });

        if (!isMounted) return;

        mediaStreamRef.current = stream;
        setCameraActive(true);
        setMicActive(true);
        addLog("Biometric Precision AI Vision Engine active.", "success");

        // Connect Admin Socket (once, on camera setup)
        if (!socketRef.current) {
          socketRef.current = io('https://ai-interview-admin-node.onrender.com');
          socketRef.current.on('kill_interview', (data) => {
             setIsTerminated(true);
             setTerminationReason(data.reason || "Terminated by Proctor.");
             addLog("INTERVIEW TERMINATED REMOTELY BY ADMIN", "critical");
             if (onTerminateRef.current) onTerminateRef.current({ reason: data.reason });
          });
        }

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch((e) => console.warn("Video play notice:", e));
        }

        // Web Audio API speech analyzer
        try {
          const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
          audioContextRef.current = audioCtx;
          const source = audioCtx.createMediaStreamSource(stream);
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 128;
          source.connect(analyser);
          analyserRef.current = analyser;

          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          const checkAudio = () => {
            if (!isMounted || isTerminated) return;
            analyser.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
              sum += dataArray[i];
            }
            const average = sum / dataArray.length;
            const normalizedLevel = Math.min(100, Math.round((average / 128) * 100));
            setAudioLevel(normalizedLevel);

            requestAnimationFrame(checkAudio);
          };
          checkAudio();
        } catch (audioErr) {
          console.warn("Audio Context init notice:", audioErr);
        }
      } catch (err) {
        console.error("Camera access error:", err);
        setCameraActive(false);
        addLog("Camera access error: " + err.message, "danger");
      }
    }

    setupMedia();

    return () => {
      isMounted = false;
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
      }
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  // Only run on mount/unmount (isEnabled change). isTerminated and addLog
  // are intentionally excluded to prevent re-running the camera setup.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEnabled]);

  // 2. REAL-TIME GAZE & DYNAMIC ATTENTION SCORE CALCULATOR
  useEffect(() => {
    if (!isEnabled || isTerminated || !cameraActive) return;

    let animFrameId;
    const sampleCanvas = document.createElement("canvas");
    const sampleCtx = sampleCanvas.getContext("2d", { willReadFrequently: true });
    sampleCanvas.width = 160;
    sampleCanvas.height = 120;

    let rotationAngle = 0;

    const runPrecisionBiometricTracking = () => {
      if (isTerminated) return;
      rotationAngle += 0.08;

      const video = videoRef.current;
      const overlayCanvas = overlayCanvasRef.current;

      if (video && video.readyState >= 2 && overlayCanvas) {
        const overlayCtx = overlayCanvas.getContext("2d");
        const width = video.videoWidth || 320;
        const height = video.videoHeight || 240;

        if (overlayCanvas.width !== width || overlayCanvas.height !== height) {
          overlayCanvas.width = width;
          overlayCanvas.height = height;
        }

        sampleCtx.drawImage(video, 0, 0, 160, 120);
        const imgData = sampleCtx.getImageData(0, 0, 160, 120);
        const pixels = imgData.data;

        let weightedX = 0;
        let weightedY = 0;
        let skinPixels = 0;

        let handHeldDarkDevicePixels = 0;

        for (let i = 0; i < pixels.length; i += 16) {
          const r = pixels[i];
          const g = pixels[i + 1];
          const b = pixels[i + 2];
          const luma = 0.299 * r + 0.587 * g + 0.114 * b;

          const pixelIdx = i / 4;
          const x = pixelIdx % 160;
          const y = Math.floor(pixelIdx / 160);

          // Human skin tone biometric filter
          // ONLY count skin pixels in the TOP 55% of frame (y < 66)
          // to avoid neck/chest/hands pulling centroid down
          const isSkin = (
            y < 66 &&  // face zone only — excludes neck, chest, desk, hands
            r > 60 && g > 35 && b > 20 &&
            r > g && r > b &&
            (r - Math.min(g, b)) > 12
          );
          if (isSkin) {
            weightedX += x;
            weightedY += y;
            skinPixels++;
          }

          // PHONE DETECTOR: Triggers when dark device pixels touch hand/skin pixels
          if (y > 20 && y < 110) {
            // Increased luma threshold to 50 to better detect phones in normal lighting
            const isDarkDevice = (luma < 50 || (r < 50 && g < 50 && b < 50));
            if (isDarkDevice) {
              const nextR = pixels[i + 16] || 0;
              const nextG = pixels[i + 17] || 0;
              const nextB = pixels[i + 18] || 0;
              const isSkinAdjacent = (nextR > 50 && nextG > 30 && nextB > 15 && nextR > nextG);

              if (isSkinAdjacent) {
                handHeldDarkDevicePixels++;
              }
            }
          }
        }

        let faceCenterX = 0.5;
        let faceCenterY = 0.45;

        if (skinPixels > 12) {
          faceCenterX = (weightedX / skinPixels) / 160;
          faceCenterY = (weightedY / skinPixels) / 120;
        }

        // ACCURATE GAZE THRESHOLDS FOR CANDIDATE FACING CAMERA
        // Tightened sideways thresholds from 0.35/0.65 to 0.42/0.58 so even slight head turns are caught
        const isSidewaysLeft = faceCenterX < 0.42;
        const isSidewaysRight = faceCenterX > 0.58;
        // Only flag looking-down if centroid is extremely low in frame (near 80%)
        const isLookingDown = faceCenterY > 0.80;
        
        // If the skin pixel count is very low, the face is likely blocked by a phone or looking completely away
        const isFaceObscured = skinPixels < 15;

        // Lowered threshold to 20 to catch more phones
        const isPhoneInFrame = handHeldDarkDevicePixels > 20 || isFaceObscured;
        // Only sideways gaze causes termination strikes; looking-down is now a soft warning only
        const isLookingAway = isSidewaysLeft || isSidewaysRight;

        let poseLabel = 'CENTERED';
        if (isPhoneInFrame) {
          poseLabel = 'PHONE / DEVICE DETECTED';
        } else if (isSidewaysLeft) {
          poseLabel = 'LOOKING LEFT';
        } else if (isSidewaysRight) {
          poseLabel = 'LOOKING RIGHT';
        } else if (isLookingDown) {
          poseLabel = 'LOOKING DOWN';
        }

        const debugInfo = `X: ${Math.round(faceCenterX * 100)}% | Y: ${Math.round(faceCenterY * 100)}%`;

        setFacePosition({
          x: faceCenterX,
          y: faceCenterY,
          width: 0.44,
          height: 0.54,
          isCentered: !isLookingAway && !isPhoneInFrame,
          poseLabel,
          isPhoneDetected: isPhoneInFrame,
          faceCount: 1,
          debugInfo
        });

        // -------------------------------------------------------------
        // DYNAMIC ATTENTION SCORE (100% Facing Forward, Deducts Only When Away)
        // -------------------------------------------------------------
        let currentAttention = 100;
        if (isPhoneInFrame) {
          currentAttention = 25;
        } else if (isSidewaysLeft || isSidewaysRight) {
          currentAttention = 55;
        } else if (isLookingDown) {
          currentAttention = 70;
        } else {
          // Candidate facing forward: 100% score (minor 5% deduction per tab switch)
          currentAttention = Math.max(80, 100 - (tabSwitchCount * 5));
        }

        setAttentionScore(currentAttention);

        // -------------------------------------------------------------
        // AUTOMATIC RULE 1: HANDHELD PHONE WARNING (0.4s)
        // -------------------------------------------------------------
        if (isPhoneInFrame) {
          if (!isPhoneDetectedRef.current) {
            isPhoneDetectedRef.current = true;
            phoneTimerRef.current = setTimeout(() => {
              setPhoneDetectedCount((p) => p + 1);
              addLog("CRITICAL SECURITY BREACH: Handheld Mobile Smartphone detected!", "critical");

              setActiveWarning({
                title: "CRITICAL: MOBILE PHONE DETECTED!",
                message: "AI Vision detected a mobile phone held in hand. Please put away all secondary devices.",
                type: 'phone'
              });
            }, 400);
          }
        } else {
          if (isPhoneDetectedRef.current) {
            isPhoneDetectedRef.current = false;
            if (phoneTimerRef.current) clearTimeout(phoneTimerRef.current);
          }
        }

        // -------------------------------------------------------------
        // AUTOMATIC RULE 2: SIDEWAYS GAZE STRIKE (0.6s RESPONSE)
        // -------------------------------------------------------------
        if (isLookingAway && !isPhoneInFrame) {
          if (!isLookingAwayRef.current) {
            isLookingAwayRef.current = true;
            lookingAwayTimerRef.current = setTimeout(() => {
              setLookingAwayCount((prev) => {
                const newGazeCount = prev + 1;
                addLog(`Vision Alert ${newGazeCount}/3: Candidate ${poseLabel}`, "danger");

                if (newGazeCount >= 3) {
                  setIsTerminated(true);
                  const msg = `Integrity Breach: Exceeded 3 gaze deviation strikes (${poseLabel}).`;
                  setTerminationReason(msg);
                  if (onTerminate) onTerminate({ reason: msg, lookingAwayCount: newGazeCount });
                } else {
                  setActiveWarning({
                    title: `VISION INTEGRITY ALERT: Strike ${newGazeCount}/3`,
                    message: `AI Vision detected ${poseLabel}. Please maintain direct eye contact with the camera.`,
                    type: 'gaze'
                  });
                }
                return newGazeCount;
              });
            }, 600);
          }
        } else {
          if (isLookingAwayRef.current) {
            isLookingAwayRef.current = false;
            if (lookingAwayTimerRef.current) clearTimeout(lookingAwayTimerRef.current);
          }
        }

        // RENDER CYBERPUNK HUD OVERLAY ON CANVAS
        overlayCtx.clearRect(0, 0, width, height);

        const boxX = (faceCenterX - 0.22) * width;
        const boxY = (faceCenterY - 0.28) * height;
        const boxW = 0.44 * width;
        const boxH = 0.56 * height;

        const hudColor = isPhoneInFrame ? '#f43f5e' : isLookingAway ? '#f59e0b' : '#00f3ff';
        const shadowGlow = isPhoneInFrame ? 'rgba(244, 63, 94, 0.9)' : isLookingAway ? 'rgba(245, 158, 11, 0.8)' : 'rgba(0, 243, 255, 0.8)';

        // Bounding Reticle Corners
        overlayCtx.lineWidth = 3.5;
        overlayCtx.strokeStyle = hudColor;
        overlayCtx.shadowBlur = 18;
        overlayCtx.shadowColor = shadowGlow;

        const cLen = 24;
        // Top-Left
        overlayCtx.beginPath();
        overlayCtx.moveTo(boxX, boxY + cLen);
        overlayCtx.lineTo(boxX, boxY);
        overlayCtx.lineTo(boxX + cLen, boxY);
        overlayCtx.stroke();

        // Top-Right
        overlayCtx.beginPath();
        overlayCtx.moveTo(boxX + boxW - cLen, boxY);
        overlayCtx.lineTo(boxX + boxW, boxY);
        overlayCtx.lineTo(boxX + boxW, boxY + cLen);
        overlayCtx.stroke();

        // Bottom-Left
        overlayCtx.beginPath();
        overlayCtx.moveTo(boxX, boxY + boxH - cLen);
        overlayCtx.lineTo(boxX, boxY + boxH);
        overlayCtx.lineTo(boxX + cLen, boxY + boxH);
        overlayCtx.stroke();

        // Bottom-Right
        overlayCtx.beginPath();
        overlayCtx.moveTo(boxX + boxW - cLen, boxY + boxH);
        overlayCtx.lineTo(boxX + boxW, boxY + boxH);
        overlayCtx.lineTo(boxX + boxW, boxY + boxH - cLen);
        overlayCtx.stroke();

        // Animated Rotating Target Center Crosshair
        const targetX = faceCenterX * width;
        const targetY = faceCenterY * height;

        overlayCtx.save();
        overlayCtx.translate(targetX, targetY);
        overlayCtx.rotate(rotationAngle);

        overlayCtx.beginPath();
        overlayCtx.arc(0, 0, 12, 0, Math.PI * 2);
        overlayCtx.lineWidth = 2;
        overlayCtx.strokeStyle = hudColor;
        overlayCtx.stroke();

        overlayCtx.restore();

        overlayCtx.beginPath();
        overlayCtx.arc(targetX, targetY, 4, 0, Math.PI * 2);
        overlayCtx.fillStyle = hudColor;
        overlayCtx.fill();

        // Overlaid Position Telemetry Text
        overlayCtx.fillStyle = '#ffffff';
        overlayCtx.font = 'bold 10px monospace';
        overlayCtx.fillText(`${poseLabel} (${debugInfo})`, boxX, Math.max(15, boxY - 8));

        // PHONE DETECTED OVERLAY BOX
        if (isPhoneInFrame) {
          overlayCtx.lineWidth = 2.5;
          overlayCtx.strokeStyle = '#f43f5e';
          overlayCtx.setLineDash([4, 4]);
          overlayCtx.strokeRect(width * 0.15, height * 0.25, width * 0.7, height * 0.65);
          overlayCtx.setLineDash([]);
          overlayCtx.fillStyle = '#f43f5e';
          overlayCtx.font = 'bold 12px monospace';
          overlayCtx.textAlign = 'center';
          overlayCtx.fillText('🚨 PHONE / SECONDARY DEVICE DETECTED', width / 2, height * 0.35);
        }

        // --- EMIT ADMIN TELEMETRY ---
        const now = Date.now();
        if (now - lastEmitTimeRef.current > 500 && socketRef.current) {
          lastEmitTimeRef.current = now;
          const frameBase64 = overlayCanvas.toDataURL('image/jpeg', 0.5);
          socketRef.current.emit('telemetry_update', {
            frameBase64,
            attentionScore: currentAttention,
            phoneDetected: isPhoneInFrame,
            gazeLabel: poseLabel
          });
        }
      }

      animFrameId = requestAnimationFrame(runPrecisionBiometricTracking);
    };

    runPrecisionBiometricTracking();

    return () => {
      if (animFrameId) cancelAnimationFrame(animFrameId);
      if (lookingAwayTimerRef.current) clearTimeout(lookingAwayTimerRef.current);
      if (noFaceTimerRef.current) clearTimeout(noFaceTimerRef.current);
      if (phoneTimerRef.current) clearTimeout(phoneTimerRef.current);
    };
  // tabSwitchCount triggers restart of gaze tracking to pick up new value
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEnabled, isTerminated, cameraActive, tabSwitchCount]);

  // 3. Tab Switch & Blur Listener
  useEffect(() => {
    if (!isEnabled || isTerminated) return;

    const handleViolation = (reasonText) => {
      setTabSwitchCount((prevCount) => {
        const newCount = prevCount + 1;
        addLog(`Security Violation Strike ${newCount}/3: ${reasonText}`, "danger");

        if (newCount >= 3) {
          setIsTerminated(true);
          const termMsg = "Multiple Integrity Violations: Exceeded 3 tab switches/window blurs.";
          setTerminationReason(termMsg);
          addLog("INTERVIEW TERMINATED: Exceeded 3 Strike Limit", "critical");

          if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach((track) => track.stop());
          }

          if (onTerminate) onTerminate({ reason: termMsg, tabSwitchCount: newCount });
        } else {
          setActiveWarning({
            title: `SECURITY WARNING: Strike ${newCount}/3`,
            message: `Tab switching or navigating away is strictly forbidden during this interview! (Strike ${newCount} of 3)`,
            type: 'strike'
          });
        }
        return newCount;
      });
    };

    const handleVisibility = () => {
      if (document.hidden) handleViolation("Tab switch or browser minimization detected.");
    };

    const handleBlur = () => {
      setTimeout(() => {
        if (!document.hasFocus()) handleViolation("Window blur/focus loss detected.");
      }, 500);
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("blur", handleBlur);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("blur", handleBlur);
    };
  }, [isEnabled, isTerminated, onTerminate, addLog]);

  const dismissWarning = () => setActiveWarning(null);

  return {
    videoRef,
    overlayCanvasRef,
    cameraActive,
    micActive,
    tabSwitchCount,
    lookingAwayCount,
    phoneDetectedCount,
    attentionScore,
    isTerminated,
    terminationReason,
    activeWarning,
    audioLevel,
    proctorLogs,
    facePosition,
    dismissWarning,
  };
}
