// ============================================================================
// ADVANCED BIOMECHANICS METRICS ENGINE
// SmartSwing AI - Professional Tennis Analysis
// ============================================================================

/**
 * Advanced Biomechanics Calculator
 * Generates 20+ professional-grade metrics from MoveNet keypoints
 */

class BiomechanicsEngine {
  constructor() {
    this.KEYPOINT = {
      NOSE: 0,
      LEFT_EYE: 1, RIGHT_EYE: 2,
      LEFT_EAR: 3, RIGHT_EAR: 4,
      LEFT_SHOULDER: 5, RIGHT_SHOULDER: 6,
      LEFT_ELBOW: 7, RIGHT_ELBOW: 8,
      LEFT_WRIST: 9, RIGHT_WRIST: 10,
      LEFT_HIP: 11, RIGHT_HIP: 12,
      LEFT_KNEE: 13, RIGHT_KNEE: 14,
      LEFT_ANKLE: 15, RIGHT_ANKLE: 16
    };
    
    this.pixelsToMeters = 0.01; // Calibrated per video
    this.courtReference = null;
    this.history = [];
  }

  // ============================================================================
  // 1. CALIBRATION & SETUP
  // ============================================================================
  
  /**
   * Auto-calibrate using player height
   */
  calibrate(keypoints) {
    const shoulder = this.getKeypoint(keypoints, this.KEYPOINT.RIGHT_SHOULDER);
    const ankle = this.getKeypoint(keypoints, this.KEYPOINT.RIGHT_ANKLE);
    
    if (shoulder && ankle) {
      const heightPixels = Math.abs(shoulder.y - ankle.y);
      const estimatedTorsoHeight = 0.9; // meters
      this.pixelsToMeters = estimatedTorsoHeight / heightPixels;
      console.log(`📏 Calibrated: ${this.pixelsToMeters.toFixed(4)} m/pixel`);
      return true;
    }
    return false;
  }

  /**
   * Manual calibration using court lines
   */
  calibrateWithCourtLines(point1, point2, realDistance) {
    const pixelDistance = this.distance(point1, point2);
    this.pixelsToMeters = realDistance / pixelDistance;
    console.log(`📏 Manual calibration: ${this.pixelsToMeters.toFixed(4)} m/pixel`);
  }

  // ============================================================================
  // 2. CORE GEOMETRY FUNCTIONS
  // ============================================================================
  
  getKeypoint(keypoints, index, minConfidence = 0.3) {
    const kp = keypoints[index];
    if (!kp) return null;
    const conf = kp.score ?? kp.confidence ?? 0;
    return conf >= minConfidence ? kp : null;
  }

  distance(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  midpoint(a, b) {
    return { 
      x: (a.x + b.x) / 2, 
      y: (a.y + b.y) / 2 
    };
  }

  vector(from, to) {
    return { 
      x: to.x - from.x, 
      y: to.y - from.y 
    };
  }

  magnitude(v) {
    return Math.sqrt(v.x * v.x + v.y * v.y);
  }

  normalize(v) {
    const mag = this.magnitude(v);
    return mag > 0 ? { x: v.x / mag, y: v.y / mag } : { x: 0, y: 0 };
  }

  dot(u, v) {
    return u.x * v.x + u.y * v.y;
  }

  cross2D(u, v) {
    return u.x * v.y - u.y * v.x;
  }

  /**
   * Calculate angle at point B in triangle A-B-C
   */
  angle3Points(A, B, C) {
    const u = this.vector(B, A);
    const v = this.vector(B, C);
    
    const dot = this.dot(u, v);
    const magU = this.magnitude(u);
    const magV = this.magnitude(v);
    
    if (magU === 0 || magV === 0) return null;
    
    const cosAngle = Math.max(-1, Math.min(1, dot / (magU * magV)));
    return Math.acos(cosAngle) * (180 / Math.PI);
  }

  /**
   * Signed angle between vectors (for rotation)
   */
  signedAngle(u, v) {
    const cross = this.cross2D(u, v);
    const dot = this.dot(u, v);
    return Math.atan2(cross, dot) * (180 / Math.PI);
  }

  /**
   * Wrap angle to -180 to 180 range
   */
  wrapAngle(angle) {
    while (angle > 180) angle -= 360;
    while (angle < -180) angle += 360;
    return angle;
  }

  // ============================================================================
  // 3. BODY SEGMENT CALCULATIONS
  // ============================================================================
  
  /**
   * Get body midpoints
   */
  getBodyMidpoints(keypoints) {
    const leftShoulder = this.getKeypoint(keypoints, this.KEYPOINT.LEFT_SHOULDER);
    const rightShoulder = this.getKeypoint(keypoints, this.KEYPOINT.RIGHT_SHOULDER);
    const leftHip = this.getKeypoint(keypoints, this.KEYPOINT.LEFT_HIP);
    const rightHip = this.getKeypoint(keypoints, this.KEYPOINT.RIGHT_HIP);
    
    const shoulderMid = (leftShoulder && rightShoulder) ? 
      this.midpoint(leftShoulder, rightShoulder) : null;
    const hipMid = (leftHip && rightHip) ? 
      this.midpoint(leftHip, rightHip) : null;
    
    return { shoulderMid, hipMid };
  }

  /**
   * Calculate Center of Mass (COM) proxy
   */
  getCOM(keypoints) {
    const { shoulderMid, hipMid } = this.getBodyMidpoints(keypoints);
    if (!shoulderMid || !hipMid) return null;
    
    // Weighted average (hips carry more mass)
    return {
      x: 0.4 * shoulderMid.x + 0.6 * hipMid.x,
      y: 0.4 * shoulderMid.y + 0.6 * hipMid.y
    };
  }

  /**
   * Determine dominant side (right/left handed)
   */
  getDominantSide(keypoints) {
    const rightShoulder = this.getKeypoint(keypoints, this.KEYPOINT.RIGHT_SHOULDER);
    const rightElbow = this.getKeypoint(keypoints, this.KEYPOINT.RIGHT_ELBOW);
    const rightWrist = this.getKeypoint(keypoints, this.KEYPOINT.RIGHT_WRIST);
    
    const leftShoulder = this.getKeypoint(keypoints, this.KEYPOINT.LEFT_SHOULDER);
    const leftElbow = this.getKeypoint(keypoints, this.KEYPOINT.LEFT_ELBOW);
    const leftWrist = this.getKeypoint(keypoints, this.KEYPOINT.LEFT_WRIST);
    
    const rightScore = (rightShoulder?.score || 0) + (rightElbow?.score || 0) + (rightWrist?.score || 0);
    const leftScore = (leftShoulder?.score || 0) + (leftElbow?.score || 0) + (leftWrist?.score || 0);
    
    return rightScore >= leftScore ? 'right' : 'left';
  }

  // ============================================================================
  // 4. JOINT ANGLES
  // ============================================================================
  
  /**
   * Calculate all joint angles
   */
  calculateJointAngles(keypoints) {
    const side = this.getDominantSide(keypoints);
    const angles = {};
    
    // Shoulder, elbow, wrist indices based on dominant side
    const shoulderIdx = side === 'right' ? this.KEYPOINT.RIGHT_SHOULDER : this.KEYPOINT.LEFT_SHOULDER;
    const elbowIdx = side === 'right' ? this.KEYPOINT.RIGHT_ELBOW : this.KEYPOINT.LEFT_ELBOW;
    const wristIdx = side === 'right' ? this.KEYPOINT.RIGHT_WRIST : this.KEYPOINT.LEFT_WRIST;
    const hipIdx = side === 'right' ? this.KEYPOINT.RIGHT_HIP : this.KEYPOINT.LEFT_HIP;
    const kneeIdx = side === 'right' ? this.KEYPOINT.RIGHT_KNEE : this.KEYPOINT.LEFT_KNEE;
    const ankleIdx = side === 'right' ? this.KEYPOINT.RIGHT_ANKLE : this.KEYPOINT.LEFT_ANKLE;
    
    const shoulder = this.getKeypoint(keypoints, shoulderIdx);
    const elbow = this.getKeypoint(keypoints, elbowIdx);
    const wrist = this.getKeypoint(keypoints, wristIdx);
    const hip = this.getKeypoint(keypoints, hipIdx);
    const knee = this.getKeypoint(keypoints, kneeIdx);
    const ankle = this.getKeypoint(keypoints, ankleIdx);
    
    // Elbow angle: shoulder-elbow-wrist
    if (shoulder && elbow && wrist) {
      angles.elbow = this.angle3Points(shoulder, elbow, wrist);
    }
    
    // Shoulder angle: hip-shoulder-elbow
    if (hip && shoulder && elbow) {
      angles.shoulder = this.angle3Points(hip, shoulder, elbow);
    }
    
    // Knee angle: hip-knee-ankle
    if (hip && knee && ankle) {
      angles.knee = this.angle3Points(hip, knee, ankle);
    }
    
    // Hip angle: shoulder-hip-knee
    if (shoulder && hip && knee) {
      angles.hip = this.angle3Points(shoulder, hip, knee);
    }
    
    return angles;
  }

  // ============================================================================
  // 5. ROTATION & ORIENTATION
  // ============================================================================
  
  /**
   * Calculate hip rotation relative to reference
   */
  calculateHipRotation(keypoints, referenceAxis = { x: 1, y: 0 }) {
    const leftHip = this.getKeypoint(keypoints, this.KEYPOINT.LEFT_HIP);
    const rightHip = this.getKeypoint(keypoints, this.KEYPOINT.RIGHT_HIP);
    
    if (!leftHip || !rightHip) return null;
    
    const hipLine = this.vector(leftHip, rightHip);
    return this.signedAngle(referenceAxis, hipLine);
  }

  /**
   * Calculate shoulder rotation
   */
  calculateShoulderRotation(keypoints, referenceAxis = { x: 1, y: 0 }) {
    const leftShoulder = this.getKeypoint(keypoints, this.KEYPOINT.LEFT_SHOULDER);
    const rightShoulder = this.getKeypoint(keypoints, this.KEYPOINT.RIGHT_SHOULDER);
    
    if (!leftShoulder || !rightShoulder) return null;
    
    const shoulderLine = this.vector(leftShoulder, rightShoulder);
    return this.signedAngle(referenceAxis, shoulderLine);
  }

  /**
   * Calculate X-Factor (hip-shoulder separation)
   */
  calculateXFactor(keypoints, referenceAxis = { x: 1, y: 0 }) {
    const hipRotation = this.calculateHipRotation(keypoints, referenceAxis);
    const shoulderRotation = this.calculateShoulderRotation(keypoints, referenceAxis);
    
    if (hipRotation === null || shoulderRotation === null) return null;
    
    const separation = this.wrapAngle(shoulderRotation - hipRotation);
    return Math.abs(separation);
  }

  /**
   * Calculate trunk tilt/lean
   */
  calculateTrunkTilt(keypoints) {
    const { shoulderMid, hipMid } = this.getBodyMidpoints(keypoints);
    if (!shoulderMid || !hipMid) return null;
    
    const spine = this.vector(hipMid, shoulderMid);
    const vertical = { x: 0, y: -1 }; // Assuming y increases downward
    
    return this.angle3Points(
      { x: hipMid.x, y: hipMid.y - 100 },
      hipMid,
      shoulderMid
    );
  }

  // ============================================================================
  // 6. VELOCITY & SPEED
  // ============================================================================
  
  /**
   * Calculate point velocity between frames
   */
  calculateVelocity(currentPos, previousPos, timeDelta) {
    if (!currentPos || !previousPos || timeDelta === 0) return null;
    
    const dx = currentPos.x - previousPos.x;
    const dy = currentPos.y - previousPos.y;
    const distPixels = Math.sqrt(dx * dx + dy * dy);
    const distMeters = distPixels * this.pixelsToMeters;
    
    const speedMS = distMeters / timeDelta;
    const speedMPH = speedMS * 2.237;
    const speedKPH = speedMS * 3.6;
    
    return {
      ms: speedMS,
      mph: speedMPH,
      kph: speedKPH,
      direction: Math.atan2(dy, dx) * (180 / Math.PI)
    };
  }

  /**
   * Calculate angular velocity
   */
  calculateAngularVelocity(currentAngle, previousAngle, timeDelta) {
    if (currentAngle === null || previousAngle === null || timeDelta === 0) return null;
    
    let diff = currentAngle - previousAngle;
    diff = this.wrapAngle(diff);
    
    return diff / timeDelta; // degrees per second
  }

  /**
   * Calculate racquet head speed (wrist proxy)
   */
  calculateRacquetSpeed(keypoints, previousKeypoints, timeDelta) {
    const side = this.getDominantSide(keypoints);
    const wristIdx = side === 'right' ? this.KEYPOINT.RIGHT_WRIST : this.KEYPOINT.LEFT_WRIST;
    
    const wrist = this.getKeypoint(keypoints, wristIdx);
    const prevWrist = previousKeypoints ? this.getKeypoint(previousKeypoints, wristIdx) : null;
    
    if (!wrist || !prevWrist) return null;
    
    return this.calculateVelocity(wrist, prevWrist, timeDelta);
  }

  // ============================================================================
  // 7. STABILITY & BALANCE
  // ============================================================================
  
  /**
   * Calculate head stability
   */
  calculateHeadStability(keypoints, window = 10) {
    const nose = this.getKeypoint(keypoints, this.KEYPOINT.NOSE);
    if (!nose) return null;
    
    this.history.push(nose);
    if (this.history.length > window) {
      this.history.shift();
    }
    
    if (this.history.length < 3) return null;
    
    // Calculate variance
    const avgX = this.history.reduce((sum, p) => sum + p.x, 0) / this.history.length;
    const avgY = this.history.reduce((sum, p) => sum + p.y, 0) / this.history.length;
    
    const variance = this.history.reduce((sum, p) => {
      const dx = p.x - avgX;
      const dy = p.y - avgY;
      return sum + (dx * dx + dy * dy);
    }, 0) / this.history.length;
    
    return {
      variance,
      stability: Math.max(0, 100 - variance), // Higher is better
      displacement: Math.sqrt(variance) * this.pixelsToMeters * 100 // cm
    };
  }

  /**
   * Calculate COM stability
   */
  calculateCOMStability(keypoints, window = 10) {
    const com = this.getCOM(keypoints);
    if (!com) return null;
    
    // Similar to head stability but for COM
    // Implementation similar to above
    return { stable: true }; // Simplified for now
  }

  /**
   * Calculate balance score
   */
  calculateBalanceScore(keypoints) {
    const leftAnkle = this.getKeypoint(keypoints, this.KEYPOINT.LEFT_ANKLE);
    const rightAnkle = this.getKeypoint(keypoints, this.KEYPOINT.RIGHT_ANKLE);
    const com = this.getCOM(keypoints);
    
    if (!leftAnkle || !rightAnkle || !com) return null;
    
    // COM should be between ankles for good balance
    const baseWidth = Math.abs(rightAnkle.x - leftAnkle.x);
    const comOffset = Math.abs(com.x - (leftAnkle.x + rightAnkle.x) / 2);
    
    const balanceRatio = 1 - (comOffset / (baseWidth / 2));
    return Math.max(0, Math.min(100, balanceRatio * 100));
  }

  // ============================================================================
  // 8. KINEMATIC CHAIN SEQUENCING
  // ============================================================================
  
  /**
   * Detect kinematic sequence timing
   */
  analyzeKinematicChain(velocityHistory) {
    // Find peaks in velocity for: hips → shoulders → elbow → wrist
    const peaks = {
      hip: this.findPeak(velocityHistory.hip),
      shoulder: this.findPeak(velocityHistory.shoulder),
      elbow: this.findPeak(velocityHistory.elbow),
      wrist: this.findPeak(velocityHistory.wrist)
    };
    
    const delays = {
      hipToShoulder: peaks.shoulder - peaks.hip,
      shoulderToElbow: peaks.elbow - peaks.shoulder,
      elbowToWrist: peaks.wrist - peaks.elbow
    };
    
    // Ideal sequence: positive delays (proximal to distal)
    const properSequence = delays.hipToShoulder > 0 && 
                          delays.shoulderToElbow > 0 && 
                          delays.elbowToWrist > 0;
    
    return {
      peaks,
      delays,
      properSequence,
      efficiency: properSequence ? 100 : 50
    };
  }

  findPeak(values) {
    if (!values || values.length === 0) return -1;
    let maxIdx = 0;
    let maxVal = values[0];
    
    for (let i = 1; i < values.length; i++) {
      if (values[i] > maxVal) {
        maxVal = values[i];
        maxIdx = i;
      }
    }
    
    return maxIdx;
  }

  // ============================================================================
  // 9. ADVANCED METRICS
  // ============================================================================
  
  /**
   * Calculate contact point quality
   */
  calculateContactPoint(keypoints) {
    const side = this.getDominantSide(keypoints);
    const wristIdx = side === 'right' ? this.KEYPOINT.RIGHT_WRIST : this.KEYPOINT.LEFT_WRIST;
    const hipIdx = side === 'right' ? this.KEYPOINT.RIGHT_HIP : this.KEYPOINT.LEFT_HIP;
    
    const wrist = this.getKeypoint(keypoints, wristIdx);
    const hip = this.getKeypoint(keypoints, hipIdx);
    
    if (!wrist || !hip) return null;
    
    // Contact should be in front of body
    const inFront = side === 'right' ? wrist.x > hip.x : wrist.x < hip.x;
    const distance = Math.abs(wrist.x - hip.x) * this.pixelsToMeters * 100; // cm
    
    // Optimal distance: 25-45 cm in front
    const optimal = distance >= 25 && distance <= 45;
    
    return {
      inFront,
      distance,
      optimal,
      quality: optimal ? 100 : Math.max(0, 100 - Math.abs(distance - 35) * 2)
    };
  }

  /**
   * Calculate power generation score
   */
  calculatePowerGeneration(metrics) {
    let score = 0;
    let count = 0;
    
    // X-Factor contribution (30-50° is optimal)
    if (metrics.xFactor !== null) {
      const xFactorScore = metrics.xFactor >= 30 && metrics.xFactor <= 50 ? 100 :
                          Math.max(0, 100 - Math.abs(metrics.xFactor - 40) * 2);
      score += xFactorScore;
      count++;
    }
    
    // Knee drive (lower = more power)
    if (metrics.knee !== null) {
      const kneeScore = metrics.knee >= 145 && metrics.knee <= 165 ? 100 :
                       Math.max(0, 100 - Math.abs(metrics.knee - 155));
      score += kneeScore;
      count++;
    }
    
    // Racquet speed
    if (metrics.maxSpeed !== null) {
      // Assume 85 mph is good for intermediate
      const speedScore = Math.min(100, (metrics.maxSpeed / 85) * 100);
      score += speedScore;
      count++;
    }
    
    return count > 0 ? score / count : null;
  }

  /**
   * Calculate efficiency score
   */
  calculateEfficiency(metrics) {
    let score = 100;
    
    // Deduct for poor kinematic sequence
    if (metrics.kinematicChain && !metrics.kinematicChain.properSequence) {
      score -= 20;
    }
    
    // Deduct for poor balance
    if (metrics.balance !== null && metrics.balance < 70) {
      score -= (70 - metrics.balance) * 0.5;
    }
    
    // Deduct for head instability
    if (metrics.headStability && metrics.headStability.displacement > 5) {
      score -= metrics.headStability.displacement;
    }
    
    return Math.max(0, Math.min(100, score));
  }

  // ============================================================================
  // 10. COMPREHENSIVE ANALYSIS
  // ============================================================================
  
  /**
   * Analyze single frame - returns all metrics
   */
  analyzeFrame(keypoints, previousKeypoints = null, timeDelta = 1/30) {
    const metrics = {};
    
    // Basic joint angles
    const angles = this.calculateJointAngles(keypoints);
    Object.assign(metrics, angles);
    
    // Rotation metrics
    metrics.hipRotation = this.calculateHipRotation(keypoints);
    metrics.shoulderRotation = this.calculateShoulderRotation(keypoints);
    metrics.xFactor = this.calculateXFactor(keypoints);
    metrics.trunkTilt = this.calculateTrunkTilt(keypoints);
    
    // Speed metrics
    if (previousKeypoints) {
      metrics.racquetSpeed = this.calculateRacquetSpeed(keypoints, previousKeypoints, timeDelta);
      metrics.maxSpeed = metrics.racquetSpeed?.mph || null;
    }
    
    // Stability metrics
    metrics.headStability = this.calculateHeadStability(keypoints);
    metrics.balance = this.calculateBalanceScore(keypoints);
    
    // Contact point
    metrics.contactPoint = this.calculateContactPoint(keypoints);
    
    // Derived metrics
    metrics.powerGeneration = this.calculatePowerGeneration(metrics);
    metrics.efficiency = this.calculateEfficiency(metrics);
    
    return metrics;
  }

  /**
   * Analyze sequence of frames - returns aggregated metrics
   */
  analyzeSequence(framesData) {
    const aggregated = {
      angles: { shoulder: [], elbow: [], hip: [], knee: [] },
      speeds: [],
      xFactors: [],
      balance: [],
      headStability: []
    };
    
    framesData.forEach((frame, idx) => {
      const prevFrame = idx > 0 ? framesData[idx - 1] : null;
      const timeDelta = prevFrame ? frame.timestamp - prevFrame.timestamp : 1/30;
      
      const metrics = this.analyzeFrame(frame.keypoints, prevFrame?.keypoints, timeDelta);
      
      // Aggregate
      if (metrics.shoulder !== null) aggregated.angles.shoulder.push(metrics.shoulder);
      if (metrics.elbow !== null) aggregated.angles.elbow.push(metrics.elbow);
      if (metrics.hip !== null) aggregated.angles.hip.push(metrics.hip);
      if (metrics.knee !== null) aggregated.angles.knee.push(metrics.knee);
      if (metrics.maxSpeed !== null) aggregated.speeds.push(metrics.maxSpeed);
      if (metrics.xFactor !== null) aggregated.xFactors.push(metrics.xFactor);
      if (metrics.balance !== null) aggregated.balance.push(metrics.balance);
    });
    
    // Calculate summary statistics
    return {
      avgAngles: {
        shoulder: this.avg(aggregated.angles.shoulder),
        elbow: this.avg(aggregated.angles.elbow),
        hip: this.avg(aggregated.angles.hip),
        knee: this.avg(aggregated.angles.knee)
      },
      maxSpeed: this.max(aggregated.speeds),
      avgSpeed: this.avg(aggregated.speeds),
      maxXFactor: this.max(aggregated.xFactors),
      avgXFactor: this.avg(aggregated.xFactors),
      avgBalance: this.avg(aggregated.balance),
      consistency: {
        shoulderStdDev: this.stdDev(aggregated.angles.shoulder),
        elbowStdDev: this.stdDev(aggregated.angles.elbow)
      }
    };
  }

  // Helper statistics functions
  avg(arr) {
    return arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
  }

  max(arr) {
    return arr.length > 0 ? Math.max(...arr) : null;
  }

  stdDev(arr) {
    if (arr.length < 2) return null;
    const mean = this.avg(arr);
    const variance = arr.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / arr.length;
    return Math.sqrt(variance);
  }
}

// ============================================================================
// USAGE EXAMPLE
// ============================================================================

/*
// Initialize
const bioEngine = new BiomechanicsEngine();

// Calibrate on first frame
bioEngine.calibrate(firstFrameKeypoints);

// Analyze each frame
const metrics = bioEngine.analyzeFrame(currentKeypoints, previousKeypoints, timeDelta);

console.log('Metrics:', {
  elbow: metrics.elbow,
  xFactor: metrics.xFactor,
  speed: metrics.maxSpeed,
  balance: metrics.balance,
  power: metrics.powerGeneration
});

// Or analyze entire sequence
const summary = bioEngine.analyzeSequence(allFrames);
console.log('Summary:', summary);
*/

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = BiomechanicsEngine;
}
