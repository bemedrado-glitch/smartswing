# GPT API INTEGRATION FOR SMARTSWING AI
## Complete Implementation Guide

---

## 🎯 OVERVIEW

Integrate your custom GPT with SmartSwing AI to provide:
- Detailed swing analysis
- Personalized coaching feedback
- Training recommendations
- Pro technique comparisons
- Progress insights

---

## 📋 WHAT YOU NEED

### 1. OpenAI API Key
```
Get from: https://platform.openai.com/api-keys
Cost: ~$0.002 per assessment (GPT-4o)
```

### 2. Your Custom GPT's System Prompt
```
The instructions you gave your GPT about tennis analysis
```

### 3. Session Data Format
```javascript
{
  summary: {
    score: 87,
    grade: "A-",
    shotType: "forehand",
    avgAngles: {
      shoulder: 106,
      elbow: 147,
      hip: 166,
      knee: 161,
      trunk: 15,
      wrist: 82
    },
    maxSpeed: 89,
    xFactor: 42,
    framesAnalyzed: 150
  }
}
```

---

## 🔧 IMPLEMENTATION METHODS

### METHOD 1: Direct API Call (Recommended)

Add this to your `analyze.html`:

```javascript
// ============================================================================
// GPT API INTEGRATION
// ============================================================================

const OPENAI_API_KEY = 'sk-proj-...'; // Your OpenAI API key
const GPT_MODEL = 'gpt-4o'; // or 'gpt-4o-mini' for cheaper option

async function analyzeWithGPT(sessionData, userProfile) {
  console.log('🤖 Analyzing swing with GPT...');
  
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: GPT_MODEL,
        messages: [
          {
            role: 'system',
            content: `You are an expert tennis coach specializing in biomechanics analysis. 
            Analyze tennis swing data and provide:
            1. Detailed technical assessment
            2. Specific improvement recommendations
            3. Training drills
            4. Pro player comparisons
            
            Format your response in clear sections with actionable advice.`
          },
          {
            role: 'user',
            content: `Analyze this tennis swing:
            
            Player Profile:
            - Skill Level: ${userProfile.skillLevel}
            - Age: ${userProfile.age}
            - Rating: ${userProfile.rating}
            
            Swing Data:
            - Shot Type: ${sessionData.summary.shotType}
            - Overall Score: ${sessionData.summary.score}/100
            - Grade: ${sessionData.summary.grade}
            
            Biomechanics:
            - Shoulder Angle: ${sessionData.summary.avgAngles.shoulder}° (optimal: 105°)
            - Elbow Angle: ${sessionData.summary.avgAngles.elbow}° (optimal: 147°)
            - Hip Angle: ${sessionData.summary.avgAngles.hip}° (optimal: 165°)
            - Knee Angle: ${sessionData.summary.avgAngles.knee}° (optimal: 165°)
            - Trunk Rotation: ${sessionData.summary.avgAngles.trunk}° (optimal: 15°)
            - X-Factor: ${sessionData.summary.xFactor}° (optimal: 40°)
            - Racquet Speed: ${sessionData.summary.maxSpeed} mph
            
            Provide detailed coaching feedback with specific drills.`
          }
        ],
        temperature: 0.7,
        max_tokens: 1000
      })
    });
    
    if (!response.ok) {
      throw new Error(`GPT API error: ${response.status}`);
    }
    
    const data = await response.json();
    const analysis = data.choices[0].message.content;
    
    console.log('✅ GPT Analysis Complete');
    return {
      success: true,
      analysis: analysis,
      tokens: data.usage.total_tokens,
      cost: (data.usage.total_tokens / 1000) * 0.002 // Approximate cost
    };
    
  } catch (error) {
    console.error('❌ GPT Analysis Error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// ============================================================================
// INTEGRATE WITH ANALYSIS FLOW
// ============================================================================

// In your existing analyze button handler, add:
document.getElementById('analyzeBtn').addEventListener('click', async () => {
  // ... your existing analysis code ...
  
  // After pose detection and biomechanics calculation:
  const sessionData = buildSession();
  
  // Show GPT analysis loading
  showGPTLoadingState();
  
  // Get user profile
  const userProfile = {
    skillLevel: currentUser?.skill_level || 'intermediate',
    age: currentUser?.age_range || '26-35',
    rating: currentUser?.rating || 'USTA 4.0'
  };
  
  // Call GPT API
  const gptResult = await analyzeWithGPT(sessionData, userProfile);
  
  if (gptResult.success) {
    // Display GPT analysis
    displayGPTAnalysis(gptResult.analysis);
    
    // Optionally save to database
    await saveGPTAnalysisToSupabase(sessionData.id, gptResult.analysis);
  } else {
    console.error('GPT analysis failed:', gptResult.error);
    // Continue without GPT analysis
  }
});

// ============================================================================
// UI FUNCTIONS
// ============================================================================

function showGPTLoadingState() {
  const container = document.getElementById('gptAnalysisContainer');
  container.innerHTML = `
    <div class="gpt-loading">
      <div class="spinner"></div>
      <p>🤖 AI Coach analyzing your technique...</p>
    </div>
  `;
  container.style.display = 'block';
}

function displayGPTAnalysis(analysis) {
  const container = document.getElementById('gptAnalysisContainer');
  container.innerHTML = `
    <div class="gpt-analysis">
      <div class="gpt-header">
        <h3>🤖 AI Coach Feedback</h3>
        <span class="gpt-badge">Powered by GPT-4</span>
      </div>
      <div class="gpt-content">
        ${formatAnalysis(analysis)}
      </div>
    </div>
  `;
}

function formatAnalysis(text) {
  // Convert markdown-style text to HTML
  return text
    .split('\n\n')
    .map(paragraph => {
      if (paragraph.startsWith('##')) {
        return `<h4>${paragraph.replace('## ', '')}</h4>`;
      } else if (paragraph.includes('•')) {
        const items = paragraph.split('\n').filter(line => line.includes('•'));
        return '<ul>' + items.map(item => 
          `<li>${item.replace('•', '').trim()}</li>`
        ).join('') + '</ul>';
      } else {
        return `<p>${paragraph}</p>`;
      }
    })
    .join('');
}

// ============================================================================
// SAVE GPT ANALYSIS TO DATABASE
// ============================================================================

async function saveGPTAnalysisToSupabase(assessmentId, gptAnalysis) {
  try {
    const { error } = await supabase
      .from('assessments')
      .update({ 
        gpt_analysis: gptAnalysis,
        analyzed_with_gpt: true 
      })
      .eq('id', assessmentId);
    
    if (error) throw error;
    
    console.log('✅ GPT analysis saved to database');
  } catch (error) {
    console.error('Error saving GPT analysis:', error);
  }
}
```

---

## 🎨 ADD GPT UI TO ANALYZER

Add this HTML to your `analyze.html` (after the report section):

```html
<!-- GPT Analysis Section -->
<div id="gptAnalysisContainer" style="display: none; margin-top: 40px;">
  <!-- Will be populated by JavaScript -->
</div>

<style>
.gpt-analysis {
  background: linear-gradient(135deg, rgba(13, 59, 71, 0.4), rgba(10, 22, 40, 0.4));
  border: 2px solid rgba(57, 255, 20, 0.3);
  border-radius: 24px;
  padding: 32px;
  margin-top: 40px;
}

.gpt-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 1px solid rgba(57, 255, 20, 0.2);
}

.gpt-header h3 {
  font-size: 24px;
  font-weight: 900;
  color: var(--neon-green);
}

.gpt-badge {
  padding: 6px 16px;
  background: rgba(57, 255, 20, 0.2);
  border-radius: 20px;
  font-size: 12px;
  font-weight: 700;
  color: var(--neon-green);
}

.gpt-content {
  color: var(--silver);
  line-height: 1.8;
}

.gpt-content h4 {
  font-size: 18px;
  font-weight: 700;
  color: var(--neon-green);
  margin: 24px 0 12px;
}

.gpt-content p {
  margin-bottom: 16px;
  color: var(--silver);
}

.gpt-content ul {
  margin: 16px 0;
  padding-left: 24px;
}

.gpt-content li {
  margin-bottom: 8px;
  color: var(--gray);
}

.gpt-loading {
  text-align: center;
  padding: 40px;
  color: var(--neon-green);
}

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid rgba(57, 255, 20, 0.2);
  border-top-color: var(--neon-green);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 16px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
```

---

## 💰 COST ESTIMATION

### Per Assessment:
```
GPT-4o: ~500 tokens × $0.002/1K = $0.001 per analysis
GPT-4o-mini: ~500 tokens × $0.0002/1K = $0.0001 per analysis

Monthly costs (100 users, 10 analyses each):
GPT-4o: 1,000 analyses × $0.001 = $1
GPT-4o-mini: 1,000 analyses × $0.0001 = $0.10
```

---

## 🔐 SECURITY: HIDE API KEY

**Never expose API key in frontend!** Use a backend proxy:

### Create API Route (if using Vercel/Next.js):

```javascript
// api/gpt-analysis.js

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const { sessionData, userProfile } = req.body;
  
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'You are an expert tennis coach...'
          },
          {
            role: 'user',
            content: `Analyze this swing: ${JSON.stringify(sessionData)}`
          }
        ]
      })
    });
    
    const data = await response.json();
    return res.status(200).json(data);
    
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
```

Then in frontend:

```javascript
async function analyzeWithGPT(sessionData, userProfile) {
  const response = await fetch('/api/gpt-analysis', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionData, userProfile })
  });
  
  return await response.json();
}
```

---

## 🎯 CUSTOM GPT SYSTEM PROMPT

Use this as your GPT's system instructions:

```
You are an expert tennis biomechanics coach with 20+ years of experience working with ATP/WTA players. 

Your role is to analyze swing data and provide:

1. TECHNICAL ASSESSMENT (2-3 sentences)
   - Evaluate the player's biomechanics
   - Compare to professional standards
   - Identify strengths and weaknesses

2. PRIORITY IMPROVEMENTS (Top 3)
   - Most impactful changes
   - Specific angle/metric targets
   - Why each matters

3. TRAINING DRILLS (3-4 specific drills)
   - Name of drill
   - How to perform it
   - What it improves
   - Recommended frequency

4. PRO COMPARISON
   - Which pro player their technique resembles
   - Specific similarities
   - What they can learn from that pro

Format your response with clear headers and bullet points.
Be specific with numbers and techniques.
Keep coaching advice actionable and motivating.
Tailor recommendations to player's skill level and age.
```

---

## 🚀 TESTING YOUR INTEGRATION

### Test in Browser Console:

```javascript
// After analyzing a swing:
const testData = {
  summary: {
    score: 87,
    grade: "A-",
    shotType: "forehand",
    avgAngles: {
      shoulder: 106,
      elbow: 147,
      hip: 166,
      knee: 161,
      trunk: 15
    },
    maxSpeed: 89,
    xFactor: 42
  }
};

const testProfile = {
  skillLevel: 'advanced',
  age: '26-35',
  rating: 'USTA 5.0'
};

const result = await analyzeWithGPT(testData, testProfile);
console.log(result.analysis);
```

---

## 📊 ENHANCED SUPABASE SCHEMA

Add GPT analysis column to assessments table:

```sql
-- Add GPT analysis column
ALTER TABLE assessments 
ADD COLUMN gpt_analysis TEXT,
ADD COLUMN analyzed_with_gpt BOOLEAN DEFAULT FALSE,
ADD COLUMN gpt_tokens_used INTEGER;

-- Index for quick filtering
CREATE INDEX idx_assessments_gpt ON assessments(analyzed_with_gpt);
```

---

## 🎯 COMPLETE INTEGRATION FLOW

```
1. User uploads video → analyze.html
   ↓
2. MoveNet detects pose → 17 keypoints
   ↓
3. Biomechanics engine → 20+ metrics
   ↓
4. Build session data → scores, angles, speed
   ↓
5. Call GPT API → coaching analysis
   ↓
6. Display results → Report + GPT feedback
   ↓
7. Save to Supabase → Store both biomechanics + GPT
   ↓
8. Dashboard → View history + coaching tips
```

---

## ✅ IMPLEMENTATION CHECKLIST

- [ ] Get OpenAI API key
- [ ] Add GPT function to analyze.html
- [ ] Create API route (if using backend)
- [ ] Add GPT UI container
- [ ] Test with sample data
- [ ] Update Supabase schema
- [ ] Integrate with save flow
- [ ] Add loading states
- [ ] Test cost per analysis
- [ ] Deploy and monitor

---

## 🔥 ADVANCED: STREAMING RESPONSE

For real-time GPT feedback:

```javascript
async function analyzeWithGPTStreaming(sessionData, userProfile) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [...],
      stream: true // Enable streaming
    })
  });
  
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let analysis = '';
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    const chunk = decoder.decode(value);
    const lines = chunk.split('\n').filter(line => line.trim());
    
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') break;
        
        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices[0]?.delta?.content || '';
          analysis += content;
          
          // Update UI in real-time
          document.getElementById('gptAnalysisContent').textContent = analysis;
        } catch (e) {}
      }
    }
  }
  
  return analysis;
}
```

---

## 📞 SUPPORT

Need help? Contact:
- Email: contact@smartswingai.com
- OpenAI Docs: https://platform.openai.com/docs

---

**Your GPT integration is now ready!** 🎾🤖✨
