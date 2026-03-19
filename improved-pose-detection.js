// ============================================================================
// IMPROVED POSE DETECTION MODULE
// SmartSwing AI - Enhanced Detection & Filtering
// ============================================================================

/**
 * PoseDetector with advanced filtering, validation, and error recovery
 */

class ImprovedPoseDetector {
  constructor(config = {}) {
    this.config = {
      model: config.model || 'MoveNet', // MoveNet or BlazePose
      modelType: config.modelType || 'SINGLEPOSE_THUNDER',
      minConfidence: config.minConfidence || 0.3,
      smoothing: config.smoothing || true,
      oneEuroFilter: config.oneEuroFilter || true,
      fps: config.fps || 30,
      ...config
    };
    
    this.detector = null;
    this.backend = null;
    this.filters = {};
    this.history = [];
    this.maxHistory = 30; // Keep last 30 frames
    this.missingFrames = 0;
    this.totalFrames = 0;
  }

  // ============================================================================
  // 1. INITIALIZATION
  // ============================================================================
  
  async initialize() {
    try {
      await tf.ready();
      
      // Try WebGL first, fall back to CPU
      this.backend = await this.initializeBackend();
      
      // Initialize pose detector
      this.detector = await this.createDetector();
      
      // Initialize filters for each keypoint
      if (this.config.oneEuroFilter) {
        this.initializeFilters();
      }
      
      console.log('✅ Pose detector initialized:', {
        model: this.config.model,
        backend: this.backend,
        filtering: this.config.smoothing
      });
      
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize pose detector:', error);
      throw error;
    }
  }

  async initializeBackend() {
    const backends = ['webgl', 'wasm', 'cpu'];
    
    for (const backend of backends) {
      try {
        await tf.setBackend(backend);
        await tf.ready();
        console.log(`✅ Using backend: ${backend}`);
        return backend;
      } catch (error) {
        console.warn(`Failed to initialize ${backend}, trying next...`);
      }
    }
    
    throw new Error('No TensorFlow backend available');
  }

  async createDetector() {
    if (this.config.model === 'MoveNet') {
      return await poseDetection.createDetector(
        poseDetection.SupportedModels.MoveNet,
        {
          modelType: poseDetection.movenet.modelType[this.config.modelType]
        }
      );
    } else if (this.config.model === 'BlazePose') {
      return await poseDetection.createDetector(
        poseDetection.SupportedModels.BlazePose,
        {
          runtime: 'tfjs',
          modelType: 'full'
        }
      );
    }
    
    throw new Error('Unsupported model type');
  }

  // ============================================================================
  // 2. ONE EURO FILTER (Smoothing)
  // ============================================================================
  
  initializeFilters() {
    const keypointCount = this.config.model === 'MoveNet' ? 17 : 33;
    
    for (let i = 0; i < keypointCount; i++) {
      this.filters[i] = {
        x: new OneEuroFilter(this.config.fps, 1.0, 0.05, 1.0),
        y: new OneEuroFilter(this.config.fps, 1.0, 0.05, 1.0)
      };
    }
  }

  applyFiltering(keypoints, timestamp) {
    if (!this.config.oneEuroFilter) return keypoints;
    
    return keypoints.map((kp, idx) => {
      if (!this.filters[idx]) return kp;
      
      const filteredX = this.filters[idx].x.filter(kp.x, timestamp);
      const filteredY = this.filters[idx].y.filter(kp.y, timestamp);
      
      return {
        ...kp,
        x: filteredX,
        y: filteredY
      };
    });
  }

  // ============================================================================
  // 3. VALIDATION & QUALITY CHECKS
  // ============================================================================
  
  /**
   * Validate keypoints quality
   */
  validateKeypoints(keypoints) {
    if (!keypoints || keypoints.length === 0) {
      return { valid: false, reason: 'No keypoints detected' };
    }
    
    // Count high-confidence keypoints
    const confidenceThreshold = this.config.minConfidence;
    const validKeypoints = keypoints.filter(kp => 
      (kp.score || kp.confidence || 0) >= confidenceThreshold
    );
    
    const validRatio = validKeypoints.length / keypoints.length;
    
    if (validRatio < 0.5) {
      return { 
        valid: false, 
        reason: `Low confidence (${Math.round(validRatio * 100)}% valid keypoints)`,
        validCount: validKeypoints.length,
        totalCount: keypoints.length
      };
    }
    
    // Check if critical points are detected
    const criticalPoints = this.getCriticalPoints();
    const criticalDetected = criticalPoints.every(idx => {
      const kp = keypoints[idx];
      return kp && (kp.score || kp.confidence || 0) >= confidenceThreshold;
    });
    
    if (!criticalDetected) {
      return {
        valid: false,
        reason: 'Critical points missing (shoulders, hips, wrists)',
        validCount: validKeypoints.length
      };
    }
    
    return { 
      valid: true, 
      confidence: this.calculateAverageConfidence(keypoints),
      validCount: validKeypoints.length
    };
  }

  getCriticalPoints() {
    // Shoulders, hips, wrists are critical for tennis analysis
    if (this.config.model === 'MoveNet') {
      return [5, 6, 9, 10, 11, 12]; // Shoulders, wrists, hips
    } else {
      return [11, 12, 15, 16, 23, 24]; // BlazePose indices
    }
  }

  calculateAverageConfidence(keypoints) {
    const sum = keypoints.reduce((acc, kp) => 
      acc + (kp.score || kp.confidence || 0), 0
    );
    return sum / keypoints.length;
  }

  // ============================================================================
  // 4. OUTLIER DETECTION & CORRECTION
  // ============================================================================
  
  /**
   * Detect outliers using history
   */
  detectOutliers(keypoints) {
    if (this.history.length < 5) return keypoints;
    
    const corrected = keypoints.map((kp, idx) => {
      // Get historical positions for this keypoint
      const historicalPositions = this.history
        .slice(-5)
        .map(frame => frame[idx])
        .filter(Boolean);
      
      if (historicalPositions.length < 3) return kp;
      
      // Calculate average historical position
      const avgX = historicalPositions.reduce((sum, p) => sum + p.x, 0) / historicalPositions.length;
      const avgY = historicalPositions.reduce((sum, p) => sum + p.y, 0) / historicalPositions.length;
      
      // Check if current position is an outlier (>100px from average)
      const distFromAvg = Math.sqrt(
        Math.pow(kp.x - avgX, 2) + Math.pow(kp.y - avgY, 2)
      );
      
      if (distFromAvg > 100) {
        // Likely an outlier - use interpolated position
        return {
          ...kp,
          x: avgX,
          y: avgY,
          outlier: true
        };
      }
      
      return kp;
    });
    
    return corrected;
  }

  /**
   * Interpolate missing keypoints
   */
  interpolateMissing(keypoints) {
    if (this.history.length < 2) return keypoints;
    
    const lastFrame = this.history[this.history.length - 1];
    const previousFrame = this.history[this.history.length - 2];
    
    return keypoints.map((kp, idx) => {
      const confidence = kp.score || kp.confidence || 0;
      
      // If confidence is too low, try interpolation
      if (confidence < this.config.minConfidence) {
        const last = lastFrame[idx];
        const prev = previousFrame[idx];
        
        if (last && prev) {
          // Linear interpolation
          return {
            ...kp,
            x: last.x + (last.x - prev.x),
            y: last.y + (last.y - prev.y),
            interpolated: true,
            score: confidence
          };
        }
      }
      
      return kp;
    });
  }

  // ============================================================================
  // 5. TEMPORAL CONSISTENCY
  // ============================================================================
  
  /**
   * Enforce temporal consistency across frames
   */
  enforceTemporalConsistency(keypoints) {
    if (this.history.length === 0) return keypoints;
    
    const lastFrame = this.history[this.history.length - 1];
    const maxMovement = 50; // Max pixels between frames
    
    return keypoints.map((kp, idx) => {
      const last = lastFrame[idx];
      if (!last) return kp;
      
      const movement = Math.sqrt(
        Math.pow(kp.x - last.x, 2) + Math.pow(kp.y - last.y, 2)
      );
      
      // If movement is too large, dampen it
      if (movement > maxMovement) {
        const ratio = maxMovement / movement;
        return {
          ...kp,
          x: last.x + (kp.x - last.x) * ratio,
          y: last.y + (kp.y - last.y) * ratio,
          dampened: true
        };
      }
      
      return kp;
    });
  }

  // ============================================================================
  // 6. MAIN DETECTION PIPELINE
  // ============================================================================
  
  /**
   * Detect pose with full pipeline
   */
  async detectPose(videoElement, timestamp = Date.now()) {
    this.totalFrames++;
    
    try {
      // Run pose detection
      const poses = await this.detector.estimatePoses(videoElement);
      
      if (!poses || poses.length === 0) {
        this.missingFrames++;
        return {
          success: false,
          reason: 'No pose detected',
          keypoints: null
        };
      }
      
      let keypoints = poses[0].keypoints;
      
      // Apply processing pipeline
      if (this.config.smoothing) {
        // 1. Validate
        const validation = this.validateKeypoints(keypoints);
        if (!validation.valid) {
          this.missingFrames++;
          return {
            success: false,
            reason: validation.reason,
            keypoints: null,
            partial: keypoints // Return partial data for debugging
          };
        }
        
        // 2. Outlier detection
        keypoints = this.detectOutliers(keypoints);
        
        // 3. Interpolate missing
        keypoints = this.interpolateMissing(keypoints);
        
        // 4. Temporal consistency
        keypoints = this.enforceTemporalConsistency(keypoints);
        
        // 5. Apply smoothing filter
        if (this.config.oneEuroFilter) {
          keypoints = this.applyFiltering(keypoints, timestamp);
        }
      }
      
      // Update history
      this.history.push(keypoints);
      if (this.history.length > this.maxHistory) {
        this.history.shift();
      }
      
      // Calculate statistics
      const stats = {
        validKeypoints: keypoints.filter(kp => 
          (kp.score || kp.confidence || 0) >= this.config.minConfidence
        ).length,
        avgConfidence: this.calculateAverageConfidence(keypoints),
        detectionRate: ((this.totalFrames - this.missingFrames) / this.totalFrames) * 100
      };
      
      return {
        success: true,
        keypoints,
        stats,
        timestamp
      };
      
    } catch (error) {
      console.error('Pose detection error:', error);
      this.missingFrames++;
      
      return {
        success: false,
        reason: error.message,
        keypoints: null
      };
    }
  }

  /**
   * Get detection statistics
   */
  getStats() {
    return {
      totalFrames: this.totalFrames,
      successfulFrames: this.totalFrames - this.missingFrames,
      missingFrames: this.missingFrames,
      detectionRate: ((this.totalFrames - this.missingFrames) / this.totalFrames) * 100,
      backend: this.backend,
      model: this.config.model
    };
  }

  /**
   * Reset detector state
   */
  reset() {
    this.history = [];
    this.missingFrames = 0;
    this.totalFrames = 0;
    
    if (this.config.oneEuroFilter) {
      this.initializeFilters();
    }
  }

  /**
   * Cleanup
   */
  dispose() {
    if (this.detector) {
      this.detector.dispose();
    }
    this.history = [];
  }
}

// ============================================================================
// ONE EURO FILTER IMPLEMENTATION
// ============================================================================

class OneEuroFilter {
  constructor(freq, mincutoff = 1.0, beta = 0.0, dcutoff = 1.0) {
    this.freq = freq;
    this.mincutoff = mincutoff;
    this.beta = beta;
    this.dcutoff = dcutoff;
    this.x = null;
    this.dx = null;
    this.lasttime = null;
  }

  alpha(cutoff) {
    const te = 1.0 / this.freq;
    const tau = 1.0 / (2 * Math.PI * cutoff);
    return 1.0 / (1.0 + tau / te);
  }

  filter(x, timestamp = null) {
    if (this.x === null) {
      this.x = x;
      this.dx = 0;
      this.lasttime = timestamp;
      return x;
    }

    let te;
    if (timestamp !== null && this.lasttime !== null) {
      te = timestamp - this.lasttime;
    } else {
      te = 1.0 / this.freq;
    }
    this.lasttime = timestamp;

    const dx = (x - this.x) / te;
    const edx = this.dx === null ? dx : dx + this.alpha(this.dcutoff) * (dx - this.dx);
    this.dx = edx;

    const cutoff = this.mincutoff + this.beta * Math.abs(edx);
    const filteredX = this.x + this.alpha(cutoff) * (x - this.x);
    this.x = filteredX;

    return filteredX;
  }
}

// ============================================================================
// USAGE EXAMPLE
// ============================================================================

/*
// Initialize
const detector = new ImprovedPoseDetector({
  model: 'MoveNet',
  minConfidence: 0.3,
  smoothing: true,
  oneEuroFilter: true,
  fps: 30
});

await detector.initialize();

// Detect pose
const result = await detector.detectPose(videoElement, timestamp);

if (result.success) {
  console.log('Detected:', {
    keypoints: result.keypoints,
    stats: result.stats
  });
  
  // Use keypoints for analysis...
} else {
  console.log('Detection failed:', result.reason);
}

// Get overall stats
const stats = detector.getStats();
console.log('Detection rate:', stats.detectionRate + '%');

// Reset when analyzing new video
detector.reset();
*/

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ImprovedPoseDetector, OneEuroFilter };
}
