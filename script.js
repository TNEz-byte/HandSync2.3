const videoElement = document.getElementById('webcam');
const canvasElement = document.getElementById('output_canvas');
const canvasCtx = canvasElement.getContext('2d');
const bandDisplay = document.getElementById('band-display');
const songDisplay = document.getElementById('song-display');

let currentBand = "";
let currentSongIndex = 0;

// ==========================================
// ตัวนับเฟรม (Hold Counter) สำหรับแต่ละท่าทาง
// 50 เฟรม ≈ 3-4 วินาที (ขึ้นอยู่กับความเร็วกล้อง)
// ==========================================
const HOLD_TARGET = 50; 

let counters = {
  CARABAO: 0,
  THREEMANDOWN: 0,
  SLOTMACHINE: 0,
  Z9: 0,
  SILLYFOOLS: 0,
  FIST: 0,
  CROSS_RESET: 0
};

let isCooldown = false;
const currentAudio = new Audio();

// รายชื่อวงและไฟล์เพลงทั้งหมด
const bandPlaylist = {
  CARABAO: {
    bandName: "คาราบาว (Carabao)",
    songs: [
      { songName: "วณิพก", audioUrl: "songs/carabao1-full.mp3" },
      { songName: "ราชาเงินผ่อน", audioUrl: "songs/carabao2-full.mp3" },
      { songName: "เมดอินไทยแลนด์", audioUrl: "songs/carabao3-full.mp3" }
    ]
  },
  THREEMANDOWN: {
    bandName: "Three Man Down",
    songs: [
      { songName: "ฝนตกไหม", audioUrl: "songs/tmd3-full1.mp3" },
      { songName: "ถ้าเธอรักใครจริง", audioUrl: "songs/tmd-full2.mp3" },
      { songName: "ข้างกัน", audioUrl: "songs/tmd3-full3.mp3" }
    ]
  },
  SLOTMACHINE: {
    bandName: "Slot Machine",
    songs: [
      { songName: "ผ่าน", audioUrl: "songs/sm1-full.mp3" },
      { songName: "จันทร์เจ้า", audioUrl: "songs/sm2-full.mp3" },
      { songName: "เคลิ้ม", audioUrl: "songs/sm3-full.mp3" }
    ]
  },
  Z9: {
    bandName: "Z9",
    songs: [
      { songName: "ทำใจไม่ได้", audioUrl: "songs/z9-full1.mp3" },
      { songName: "รักใครไม่เป็น", audioUrl: "songs/z9-full2.mp3" },
      { songName: "บทสรุปสุดท้าย", audioUrl: "songs/z9-full3.mp3" }
    ]
  },
  SILLYFOOLS: {
    bandName: "Silly Fools",
    songs: [
      { songName: "เพียงรัก", audioUrl: "songs/sf-full1.mp3" },
      { songName: "อย่าบอกว่ารัก", audioUrl: "songs/sf-full2.mp3" },
      { songName: "ไหนว่าไม่หลอกกัน", audioUrl: "songs/sf-full3.mp3" }
    ]
  }
};

function getDistance(p1, p2) {
  return Math.hypot(p1.x - p2.x, p1.y - p2.y);
}

// 1. ตรวจจับสัญลักษณ์มือเดี่ยว
function detectSingleHandGesture(landmarks) {
  const thumbTip = landmarks[4];
  const indexTip = landmarks[8];
  const middleTip = landmarks[12];
  const ringTip = landmarks[16];
  const pinkyTip = landmarks[20];

  const indexPip = landmarks[6];
  const middlePip = landmarks[10];
  const ringPip = landmarks[14];
  const pinkyPip = landmarks[18];

  const isIndexUp = indexTip.y < indexPip.y;
  const isMiddleUp = middleTip.y < middlePip.y;
  const isRingUp = ringTip.y < ringPip.y;
  const isPinkyUp = pinkyTip.y < pinkyPip.y;

  const isIndexDown = indexTip.y > indexPip.y;
  const isMiddleDown = middleTip.y > middlePip.y;
  const isRingDown = ringTip.y > ringPip.y;
  const isPinkyDown = pinkyTip.y > pinkyPip.y;

  // 🤞 ไขว้นิ้ว -> รีเซ็ต
  const isFingersCrossed = isIndexUp && isMiddleUp && (Math.abs(indexTip.x - middleTip.x) < 0.03);
  if (isFingersCrossed && isRingDown && isPinkyDown) return "CROSS_RESET";

  // ✊ กำมือ -> เปลี่ยนเพลง
  if (isIndexDown && isMiddleDown && isRingDown && isPinkyDown) return "FIST";

  // 🤘 Silly Fools (Rock Sign)
  if (isIndexUp && isPinkyUp && isMiddleDown && isRingDown) return "SILLYFOOLS";

  // 👌 Z9
  const thumbIndexDist = getDistance(thumbTip, indexTip);
  if (thumbIndexDist < 0.045 && isMiddleUp && isRingUp && isPinkyUp) return "Z9";

  // 🤟 Three Man Down
  if (isIndexUp && isMiddleUp && isRingUp && isPinkyDown) return "THREEMANDOWN";

  // 🤙 Carabao
  const isThumbOut = Math.abs(thumbTip.x - indexPip.x) > 0.12;
  if (isThumbOut && isPinkyUp && isIndexDown && isMiddleDown) return "CARABAO";

  return "UNKNOWN";
}

// 2. ตรวจจับสัญลักษณ์ Slot Machine (🔺)
function detectTriangleGesture(hand1, hand2) {
  const h1IndexTip = hand1[8];
  const h1ThumbTip = hand1[4];
  const h1IndexPip = hand1[6];

  const h2IndexTip = hand2[8];
  const h2ThumbTip = hand2[4];
  const h2IndexPip = hand2[6];

  const indexDistance = getDistance(h1IndexTip, h2IndexTip);
  const thumbDistance = getDistance(h1ThumbTip, h2ThumbTip);

  const isH1IndexUp = h1IndexTip.y < h1IndexPip.y;
  const isH2IndexUp = h2IndexTip.y < h2IndexPip.y;

  if (indexDistance < 0.08 && thumbDistance < 0.08 && isH1IndexUp && isH2IndexUp) {
    return "SLOTMACHINE";
  }

  return "UNKNOWN";
}

// 3. ประมวลผลเฟรม
function onResults(results) {
  canvasCtx.save();
  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

  let detectedGesture = "UNKNOWN";

  if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
    for (const landmarks of results.multiHandLandmarks) {
      drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, { color: '#00FFCC', lineWidth: 3 });
      drawLandmarks(canvasCtx, landmarks, { color: '#FF0055', lineWidth: 1, radius: 4 });
    }

    if (results.multiHandLandmarks.length === 2) {
      detectedGesture = detectTriangleGesture(
        results.multiHandLandmarks[0],
        results.multiHandLandmarks[1]
      );
    }

    if (detectedGesture === "UNKNOWN") {
      detectedGesture = detectSingleHandGesture(results.multiHandLandmarks[0]);
    }
  }

  handleGestureWithDelay(detectedGesture);
  canvasCtx.restore();
}

// 4. จัดการระบบหน่วงเวลาค้างมือ 3-4 วินาที
function handleGestureWithDelay(gesture) {
  // เพิ่มค่านับให้ท่าที่กำลังทำอยู่ และ รีเซ็ตค่านับของท่าอื่นๆ ทั้งหมด
  for (const key in counters) {
    if (key === gesture) {
      counters[key]++;
    } else {
      counters[key] = 0; // ถ้าเลิกทำท่า ให้รีเซ็ตค่านับกลับเป็น 0
    }
  }

  // // แสดงผลสถานะค้างมือแบบ Real-time บนหน้าจอ
  // if (gesture !== "UNKNOWN" && counters[gesture] > 0 && counters[gesture] < HOLD_TARGET) {
  //   const progressPercent = Math.round((counters[gesture] / HOLD_TARGET) * 100);
  //   songDisplay.innerText = `⏳ กำลังค้างท่าทาง... (${progressPercent}%)`;
  // }

  // เมื่อค้างท่าทางจนครบ 50 เฟรม (3-4 วินาที)
  if (counters[gesture] >= HOLD_TARGET) {
    counters[gesture] = 0; // รีเซ็ตตัวนับเมื่อทำงานสำเร็จ

    // --- 4.1 กรณีไขว้นิ้ว (CROSS_RESET 🤞) ---
    if (gesture === "CROSS_RESET") {
      if (currentBand !== "") {
        currentBand = "";
        currentSongIndex = 0;
        currentAudio.pause();
        currentAudio.currentTime = 0;
        bandDisplay.innerText = "กำลังรอสัญลักษณ์มือ...";
        songDisplay.innerText = "(หยุดเพลงและรีเซ็ตเรียบร้อย)";
      }
      return;
    }

    // --- 4.2 กรรณีกำมือข้ามเพลง (FIST ✊) ---
    if (gesture === "FIST") {
      if (!isCooldown && currentBand && bandPlaylist[currentBand]) {
        isCooldown = true;
        const songsList = bandPlaylist[currentBand].songs;
        currentSongIndex = (currentSongIndex + 1) % songsList.length;
        playCurrentSong();

        setTimeout(() => { isCooldown = false; }, 1500);
      }
      return;
    }

    // --- 4.3 กรณีสลับวงดนตรี ---
    if (gesture !== "UNKNOWN" && gesture !== currentBand) {
      currentBand = gesture;
      currentSongIndex = 0;
      playCurrentSong();
    }
  }
}

// 5. สั่งเล่น Audio
function playCurrentSong() {
  if (!currentBand || !bandPlaylist[currentBand]) return;

  const bandData = bandPlaylist[currentBand];
  const songData = bandData.songs[currentSongIndex];

  bandDisplay.innerText = bandData.bandName;
  songDisplay.innerText = `กำลังเล่น (${currentSongIndex + 1}/${bandData.songs.length}): ${songData.songName}`;

  currentAudio.src = songData.audioUrl;
  currentAudio.play().catch(err => console.log("Audio Playback Error:", err));
}

// 6. ตั้งค่า MediaPipe Hands
const hands = new Hands({
  locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
});

hands.setOptions({
  maxNumHands: 2,
  modelComplexity: 1,
  minDetectionConfidence: 0.6,
  minTrackingConfidence: 0.6
});

hands.onResults(onResults);

const camera = new Camera(videoElement, {
  onFrame: async () => {
    await hands.send({ image: videoElement });
  },
  width: 640,
  height: 480
});

camera.start().catch(err => console.error("เปิดกล้องไม่ได้:", err));