// ============================================================================
// SECURE GPT INTEGRATION - ADD TO ANALYZE.HTML
// ============================================================================
// This code should be added to your analyze.html file
// API key will be stored in .env.local file (NEVER in this code)
// ============================================================================

// ============================================================================
// CONFIGURATION
// ============================================================================

// DO NOT PUT YOUR API KEY HERE!
// It will be loaded from environment variable or config file
const GPT_CONFIG = {
  model: 'gpt-4o', // or 'gpt-4o-mini' for lower cost
  temperature: 0.7,
  maxTokens: 1000,
  streaming: true // Enable streaming for real-time feedback
};

// This will be replaced with your actual key during build/deployment
// For local testing, you'll set this in your environment
let OPENAI_API_KEY = null;

// ============================================================================
// INITIALIZE API KEY (SECURE METHOD)
// ============================================================================

async function initializeGPTKey() {
  // Method 1: Load from local config file (for development)
  try {
    const response = await fetch('/config.json');
    const config = await response.json();
    OPENAI_API_KEY = config.OPENAI_API_KEY;
    console.log('✅ GPT API key loaded from config');
  } catch (error) {
    console.warn('⚠️ Config file not found, GPT features disabled');
    return false;
  }
  
  return OPENAI_API_KEY !== null;
}

// ============================================================================
// GPT ANALYSIS FUNCTION WITH STREAMING
// ============================================================================

async function analyzeWithGPTStreaming(sessionData, userProfile) {
  if (!OPENAI_API_KEY) {
    console.error('❌ OpenAI API key not configured');
    return {
      success: false,
      error: 'GPT API key not configured'
    };
  }
  
  console.log('🤖 Starting GPT analysis with streaming...');
  
  // Build the analysis prompt
  const prompt = buildAnalysisPrompt(sessionData, userProfile);
  
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: GPT_CONFIG.model,
        messages: [
          {
            role: 'system',
            content: getSystemPrompt()
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: GPT_CONFIG.temperature,
        max_tokens: GPT_CONFIG.maxTokens,
        stream: GPT_CONFIG.streaming
      })
    });
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }
    
    // Handle streaming response
    if (GPT_CONFIG.streaming) {
      return await handleStreamingResponse(response);
    } else {
      // Handle non-streaming response
      const data = await response.json();
      return {
        success: true,
        analysis: data.choices[0].message.content,
        tokens: data.usage.total_tokens,
        cost: calculateCost(data.usage.total_tokens)
      };
    }
    
  } catch (error) {
    console.error('❌ GPT API Error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// ============================================================================
// STREAMING RESPONSE HANDLER
// ============================================================================

async function handleStreamingResponse(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  
  let analysis = '';
  let totalTokens = 0;
  
  // Show streaming UI
  showGPTStreamingUI();
  
  try {
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) {
        console.log('✅ Streaming complete');
        break;
      }
      
      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter(line => line.trim() !== '');
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          
          if (data === '[DONE]') {
            continue;
          }
          
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices[0]?.delta?.content || '';
            
            if (content) {
              analysis += content;
              
              // Update UI in real-time
              updateGPTStreamingContent(analysis);
            }
            
          } catch (e) {
            // Skip invalid JSON chunks
          }
        }
      }
    }
    
    // Estimate tokens (rough estimate for streaming)
    totalTokens = Math.ceil(analysis.length / 4);
    
    return {
      success: true,
      analysis: analysis,
      tokens: totalTokens,
      cost: calculateCost(totalTokens),
      streamed: true
    };
    
  } catch (error) {
    console.error('Streaming error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// ============================================================================
// PROMPT BUILDERS
// ============================================================================

function getSystemPrompt() {
  return `You are an expert tennis biomechanics coach with 20+ years of ATP/WTA experience.

Analyze swing data and provide:
1. TECHNICAL ASSESSMENT (2-3 sentences)
2. PRIORITY IMPROVEMENTS (Top 3 with specific targets)
3. TRAINING DRILLS (3-4 specific drills with frequency)
4. PRO COMPARISON (Which pro they resemble and why)

Format with clear headers and bullet points.
Be specific with numbers and techniques.
Tailor advice to skill level and age.
Keep tone motivating and actionable.`;
}

function buildAnalysisPrompt(sessionData, userProfile) {
  return `Analyze this tennis swing:

**PLAYER PROFILE:**
- Age: ${userProfile.age_range || 'Not specified'}
- Gender: ${userProfile.gender || 'Not specified'}
- USTA Level: ${userProfile.usta_level || 'Not specified'}
- UTR Rating: ${userProfile.utr_rating || 'Not specified'}
- Preferred Hand: ${userProfile.preferred_hand || 'Right'}

**SWING DATA:**
- Shot Type: ${sessionData.summary.shotType}
- Overall Score: ${sessionData.summary.score}/100
- Grade: ${sessionData.summary.grade}
- Percentile: Top ${sessionData.summary.percentile}%

**BIOMECHANICS:**
- Shoulder Angle: ${Math.round(sessionData.summary.avgAngles.shoulder)}° (optimal: 105°)
- Elbow Angle: ${Math.round(sessionData.summary.avgAngles.elbow)}° (optimal: 147°)
- Hip Angle: ${Math.round(sessionData.summary.avgAngles.hip)}° (optimal: 165°)
- Knee Angle: ${Math.round(sessionData.summary.avgAngles.knee)}° (optimal: 165°)
- Trunk Rotation: ${Math.round(sessionData.summary.avgAngles.trunk)}° (optimal: 15°)
- Wrist Angle: ${Math.round(sessionData.summary.avgAngles.wrist)}°

**ADVANCED METRICS:**
- X-Factor (Hip-Shoulder Separation): ${Math.round(sessionData.summary.xFactor)}° (optimal: 40°)
- Racquet Head Speed: ${Math.round(sessionData.summary.maxSpeed)} mph
- Frames Analyzed: ${sessionData.summary.framesAnalyzed}
- Average Confidence: ${sessionData.summary.avgConfidence}%

Provide detailed coaching feedback with actionable drills.`;
}

// ============================================================================
// UI FUNCTIONS
// ============================================================================

function showGPTLoadingState() {
  const container = document.getElementById('gptAnalysisContainer');
  container.innerHTML = `
    <div class="gpt-loading">
      <div class="spinner"></div>
      <div class="loading-text">
        <h3>🤖 AI Coach is analyzing your technique...</h3>
        <p>This will take about 5-10 seconds</p>
      </div>
    </div>
  `;
  container.style.display = 'block';
}

function showGPTStreamingUI() {
  const container = document.getElementById('gptAnalysisContainer');
  container.innerHTML = `
    <div class="gpt-analysis streaming">
      <div class="gpt-header">
        <h3>🤖 AI Coach Feedback</h3>
        <span class="gpt-badge">
          <span class="pulse-dot"></span>
          Analyzing...
        </span>
      </div>
      <div class="gpt-content" id="gptStreamingContent">
        <div class="typing-indicator">
          <span></span><span></span><span></span>
        </div>
      </div>
    </div>
  `;
  container.style.display = 'block';
}

function updateGPTStreamingContent(text) {
  const contentEl = document.getElementById('gptStreamingContent');
  if (contentEl) {
    contentEl.innerHTML = formatAnalysis(text);
    
    // Auto-scroll to bottom
    contentEl.scrollTop = contentEl.scrollHeight;
  }
}

function displayGPTAnalysis(analysis, metadata = {}) {
  const container = document.getElementById('gptAnalysisContainer');
  
  container.innerHTML = `
    <div class="gpt-analysis">
      <div class="gpt-header">
        <h3>🤖 AI Coach Feedback</h3>
        <div class="gpt-meta">
          <span class="gpt-badge">Powered by GPT-4</span>
          ${metadata.tokens ? `<span class="gpt-stats">${metadata.tokens} tokens • $${metadata.cost?.toFixed(4) || '0.00'}</span>` : ''}
        </div>
      </div>
      <div class="gpt-content">
        ${formatAnalysis(analysis)}
      </div>
      ${metadata.streamed ? '<div class="gpt-footer">✨ Streamed in real-time</div>' : ''}
    </div>
  `;
  
  // Scroll to GPT analysis
  container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function formatAnalysis(text) {
  // Convert text to formatted HTML
  let formatted = text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/^#{1,2}\s+(.+)$/gm, '<h4>$1</h4>')
    .replace(/^[-•]\s+(.+)$/gm, '<li>$1</li>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
  
  // Wrap paragraphs
  if (!formatted.startsWith('<h4>') && !formatted.startsWith('<ul>')) {
    formatted = '<p>' + formatted + '</p>';
  }
  
  return formatted;
}

function showGPTError(error) {
  const container = document.getElementById('gptAnalysisContainer');
  container.innerHTML = `
    <div class="gpt-error">
      <h4>⚠️ AI Coach Unavailable</h4>
      <p>${error}</p>
      <p class="error-help">Your biomechanics analysis is still available above.</p>
    </div>
  `;
}

// ============================================================================
// COST CALCULATION
// ============================================================================

function calculateCost(tokens) {
  // GPT-4o pricing: $2.50 per 1M input tokens, $10.00 per 1M output tokens
  // Rough estimate: assume 40% input, 60% output
  const inputTokens = tokens * 0.4;
  const outputTokens = tokens * 0.6;
  
  const inputCost = (inputTokens / 1000000) * 2.50;
  const outputCost = (outputTokens / 1000000) * 10.00;
  
  return inputCost + outputCost;
}

// ============================================================================
// DATABASE INTEGRATION
// ============================================================================

async function saveGPTAnalysisToSupabase(assessmentId, gptData) {
  try {
    const { error } = await supabase
      .from('assessments')
      .update({
        gpt_analysis: gptData.analysis,
        analyzed_with_gpt: true,
        gpt_tokens_used: gptData.tokens,
        gpt_cost: gptData.cost
      })
      .eq('id', assessmentId);
    
    if (error) throw error;
    
    console.log('✅ GPT analysis saved to database');
    return true;
    
  } catch (error) {
    console.error('❌ Error saving GPT analysis:', error);
    return false;
  }
}

// ============================================================================
// INTEGRATION WITH EXISTING ANALYZE FLOW
// ============================================================================

// Add this to your existing analysis completion handler
async function handleAnalysisComplete(sessionData) {
  console.log('📊 Analysis complete, checking GPT integration...');
  
  // Check if GPT is available
  const gptReady = await initializeGPTKey();
  
  if (!gptReady) {
    console.log('⚠️ GPT not configured, skipping AI coach feedback');
    return;
  }
  
  // Show loading state
  showGPTLoadingState();
  
  // Get user profile
  const userProfile = {
    age_range: currentUser?.age_range || '26-35',
    gender: currentUser?.gender || 'not specified',
    usta_level: currentUser?.usta_level || '4.0',
    utr_rating: currentUser?.utr_rating || '6-7',
    preferred_hand: currentUser?.preferred_hand || 'right'
  };
  
  // Call GPT API
  const gptResult = await analyzeWithGPTStreaming(sessionData, userProfile);
  
  if (gptResult.success) {
    // Display analysis
    displayGPTAnalysis(gptResult.analysis, {
      tokens: gptResult.tokens,
      cost: gptResult.cost,
      streamed: gptResult.streamed
    });
    
    // Save to database (if assessment was saved)
    if (sessionData.assessmentId) {
      await saveGPTAnalysisToSupabase(sessionData.assessmentId, gptResult);
    }
    
    console.log('✅ GPT Analysis Complete:', {
      tokens: gptResult.tokens,
      cost: `$${gptResult.cost.toFixed(4)}`,
      streamed: gptResult.streamed
    });
    
  } else {
    console.error('❌ GPT Analysis Failed:', gptResult.error);
    showGPTError(gptResult.error);
  }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

console.log('🤖 GPT Integration Module Loaded');
console.log('⚙️ Configuration:', GPT_CONFIG);
