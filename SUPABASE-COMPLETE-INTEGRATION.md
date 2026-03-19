# SmartSwing AI - Complete Supabase Integration Guide

## 🎯 Overview

This guide sets up a **free Supabase backend** for SmartSwing AI with:
- ✅ User authentication
- ✅ Database storage (assessments, scores, history)
- ✅ File storage (videos)
- ✅ Real-time updates
- ✅ API access
- ✅ Complete data model

---

## 📋 STEP 1: CREATE SUPABASE PROJECT (5 minutes)

### **1.1 Sign Up**
```
1. Go to https://supabase.com
2. Click "Start your project"
3. Sign up with GitHub (recommended) or email
4. Free tier: Unlimited API requests, 500MB database, 1GB file storage
```

### **1.2 Create Project**
```
1. Click "New Project"
2. Organization: Create new or use existing
3. Project name: smartswing-ai
4. Database password: [generate strong password - SAVE THIS!]
5. Region: Choose closest to your users
6. Click "Create new project"
7. Wait 2-3 minutes for setup
```

### **1.3 Get API Keys**
```
1. Go to Project Settings (gear icon)
2. Click "API"
3. Copy these values (you'll need them):
   - Project URL: https://xxxxx.supabase.co
   - anon/public key: eyJhbGc...
   - service_role key: eyJhbGc... (keep secret!)
```

---

## 🗄️ STEP 2: CREATE DATABASE SCHEMA

### **2.1 Navigate to SQL Editor**
```
1. In Supabase dashboard, click "SQL Editor"
2. Click "New query"
3. Paste the schema below
4. Click "Run"
```

### **2.2 Complete Database Schema**

```sql
-- ============================================================================
-- SMARTSWING AI DATABASE SCHEMA
-- ============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- USERS TABLE (extends Supabase auth.users)
-- ============================================================================
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  email TEXT UNIQUE,
  full_name TEXT,
  age_range TEXT,
  gender TEXT,
  skill_level TEXT, -- beginner, intermediate, advanced, pro
  preferred_hand TEXT, -- right, left
  coach_id UUID REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  avatar_url TEXT,
  subscription_tier TEXT DEFAULT 'free', -- free, pro, coach
  subscription_expires_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view own profile" 
  ON public.profiles FOR SELECT 
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" 
  ON public.profiles FOR UPDATE 
  USING (auth.uid() = id);

CREATE POLICY "Coaches can view their students" 
  ON public.profiles FOR SELECT 
  USING (
    coach_id = auth.uid() OR 
    id IN (SELECT coach_id FROM public.profiles WHERE id = auth.uid())
  );

-- ============================================================================
-- ASSESSMENTS TABLE (stores analysis results)
-- ============================================================================
CREATE TABLE public.assessments (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  
  -- Session info
  shot_type TEXT NOT NULL, -- forehand, backhand, serve, volley
  video_url TEXT,
  video_filename TEXT,
  video_duration DECIMAL(6,2),
  
  -- Analysis results
  frames_analyzed INTEGER,
  avg_landmarks INTEGER,
  avg_confidence INTEGER,
  
  -- Scores
  overall_score INTEGER, -- 10-100
  grade TEXT, -- A+, A, A-, B+, etc.
  percentile INTEGER, -- 0-100
  
  -- Biomechanics angles (average)
  shoulder_angle DECIMAL(5,2),
  elbow_angle DECIMAL(5,2),
  hip_angle DECIMAL(5,2),
  knee_angle DECIMAL(5,2),
  trunk_angle DECIMAL(5,2),
  wrist_angle DECIMAL(5,2),
  
  -- Advanced metrics
  x_factor DECIMAL(5,2),
  max_speed_mph DECIMAL(5,2),
  avg_speed_mph DECIMAL(5,2),
  hip_shoulder_delay INTEGER, -- milliseconds
  
  -- Full session data (JSONB for flexibility)
  session_data JSONB,
  
  -- Timestamps
  analyzed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Metadata
  device_type TEXT,
  ai_version TEXT DEFAULT '1.0.0'
);

-- Enable RLS
ALTER TABLE public.assessments ENABLE ROW LEVEL SECURITY;

-- Assessments policies
CREATE POLICY "Users can view own assessments" 
  ON public.assessments FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own assessments" 
  ON public.assessments FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own assessments" 
  ON public.assessments FOR UPDATE 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own assessments" 
  ON public.assessments FOR DELETE 
  USING (auth.uid() = user_id);

CREATE POLICY "Coaches can view student assessments" 
  ON public.assessments FOR SELECT 
  USING (
    user_id IN (
      SELECT id FROM public.profiles WHERE coach_id = auth.uid()
    )
  );

-- Indexes for performance
CREATE INDEX idx_assessments_user_date ON public.assessments(user_id, analyzed_at DESC);
CREATE INDEX idx_assessments_shot_type ON public.assessments(shot_type);
CREATE INDEX idx_assessments_score ON public.assessments(overall_score DESC);

-- ============================================================================
-- TRAINING SESSIONS TABLE
-- ============================================================================
CREATE TABLE public.training_sessions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  
  -- Session info
  session_name TEXT,
  session_type TEXT, -- practice, match, drill, lesson
  location TEXT,
  duration_minutes INTEGER,
  
  -- Performance
  overall_rating INTEGER, -- 1-10
  energy_level INTEGER, -- 1-10
  focus_level INTEGER, -- 1-10
  
  -- Notes
  notes TEXT,
  goals TEXT,
  achievements TEXT,
  
  -- Related assessments
  assessment_ids UUID[],
  
  -- Timestamps
  session_date DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.training_sessions ENABLE ROW LEVEL SECURITY;

-- Training sessions policies
CREATE POLICY "Users can manage own sessions" 
  ON public.training_sessions FOR ALL 
  USING (auth.uid() = user_id);

CREATE POLICY "Coaches can view student sessions" 
  ON public.training_sessions FOR SELECT 
  USING (
    user_id IN (
      SELECT id FROM public.profiles WHERE coach_id = auth.uid()
    )
  );

-- Index
CREATE INDEX idx_sessions_user_date ON public.training_sessions(user_id, session_date DESC);

-- ============================================================================
-- COACH NOTES TABLE
-- ============================================================================
CREATE TABLE public.coach_notes (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  coach_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  student_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  assessment_id UUID REFERENCES public.assessments(id) ON DELETE SET NULL,
  
  -- Note content
  note_type TEXT, -- feedback, drill, goal, observation
  title TEXT,
  content TEXT NOT NULL,
  priority TEXT DEFAULT 'normal', -- low, normal, high
  
  -- Action items
  action_required BOOLEAN DEFAULT FALSE,
  completed BOOLEAN DEFAULT FALSE,
  due_date DATE,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.coach_notes ENABLE ROW LEVEL SECURITY;

-- Coach notes policies
CREATE POLICY "Coaches can manage their notes" 
  ON public.coach_notes FOR ALL 
  USING (auth.uid() = coach_id);

CREATE POLICY "Students can view notes about them" 
  ON public.coach_notes FOR SELECT 
  USING (auth.uid() = student_id);

-- Index
CREATE INDEX idx_coach_notes_student ON public.coach_notes(student_id, created_at DESC);

-- ============================================================================
-- PROGRESS TRACKING VIEW
-- ============================================================================
CREATE OR REPLACE VIEW public.user_progress AS
SELECT 
  user_id,
  shot_type,
  COUNT(*) as total_assessments,
  AVG(overall_score) as avg_score,
  MAX(overall_score) as best_score,
  MIN(overall_score) as worst_score,
  AVG(max_speed_mph) as avg_speed,
  MAX(max_speed_mph) as max_speed,
  MIN(analyzed_at) as first_assessment,
  MAX(analyzed_at) as last_assessment,
  -- Score trend (last 5 vs first 5)
  (
    SELECT AVG(overall_score) 
    FROM (
      SELECT overall_score 
      FROM public.assessments a2 
      WHERE a2.user_id = assessments.user_id 
        AND a2.shot_type = assessments.shot_type
      ORDER BY analyzed_at DESC 
      LIMIT 5
    ) recent
  ) - (
    SELECT AVG(overall_score) 
    FROM (
      SELECT overall_score 
      FROM public.assessments a2 
      WHERE a2.user_id = assessments.user_id 
        AND a2.shot_type = assessments.shot_type
      ORDER BY analyzed_at ASC 
      LIMIT 5
    ) oldest
  ) as improvement
FROM public.assessments
GROUP BY user_id, shot_type;

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER training_sessions_updated_at
  BEFORE UPDATE ON public.training_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER coach_notes_updated_at
  BEFORE UPDATE ON public.coach_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Function to create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile on signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- SAMPLE DATA (optional - for testing)
-- ============================================================================

-- Note: Run this only if you want test data
/*
INSERT INTO public.profiles (id, email, full_name, age_range, gender, skill_level, preferred_hand)
VALUES 
  (uuid_generate_v4(), 'test@example.com', 'Test Player', '26-30', 'male', 'intermediate', 'right');
*/
```

---

## 🔐 STEP 3: CONFIGURE AUTHENTICATION

### **3.1 Enable Email Auth**
```
1. Go to Authentication → Providers
2. Email is enabled by default
3. Configure email templates (optional):
   - Confirmation email
   - Password reset email
   - Magic link email
```

### **3.2 Configure Auth Settings**
```
1. Go to Authentication → Settings
2. Site URL: https://yourdomain.com (or localhost for testing)
3. Redirect URLs: Add your app URLs
   - http://localhost:8000 (for development)
   - https://yourdomain.com (for production)
```

---

## 📁 STEP 4: CONFIGURE FILE STORAGE

### **4.1 Create Storage Bucket**
```
1. Go to Storage
2. Click "New bucket"
3. Name: tennis-videos
4. Public: No (files are private by default)
5. Click "Create bucket"
```

### **4.2 Set Storage Policies**
```sql
-- Go to Storage → tennis-videos → Policies
-- Click "New policy"

-- Policy 1: Users can upload their own videos
CREATE POLICY "Users can upload own videos"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'tennis-videos' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Policy 2: Users can view their own videos
CREATE POLICY "Users can view own videos"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'tennis-videos' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Policy 3: Users can delete their own videos
CREATE POLICY "Users can delete own videos"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'tennis-videos' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Policy 4: Coaches can view student videos
CREATE POLICY "Coaches can view student videos"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'tennis-videos' AND
  (storage.foldername(name))[1] IN (
    SELECT id::text FROM public.profiles 
    WHERE coach_id = auth.uid()
  )
);
```

---

## 💻 STEP 5: INTEGRATE WITH SMARTSWING AI

### **5.1 Add Supabase Client to HTML**

Add this to the `<head>` section of `smartswing-movenet-working.html`:

```html
<!-- Supabase Client -->
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>

<script>
  // Initialize Supabase
  const SUPABASE_URL = 'https://xxxxx.supabase.co'; // Replace with your URL
  const SUPABASE_ANON_KEY = 'eyJhbGc...'; // Replace with your anon key
  
  const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  
  // Check if user is logged in
  let currentUser = null;
  
  supabase.auth.getSession().then(({ data: { session } }) => {
    currentUser = session?.user ?? null;
    console.log('User session:', currentUser ? 'Logged in' : 'Not logged in');
  });
</script>
```

### **5.2 Add Login/Signup UI**

Add before the wizard section:

```html
<!-- Auth Section -->
<div id="authSection" class="wizard-section" style="max-width: 500px; margin: 40px auto;">
  <h2 style="text-align: center; margin-bottom: 24px;">
    <span class="gradient-text">Login to SmartSwing AI</span>
  </h2>
  
  <!-- Login Form -->
  <div id="loginForm">
    <input type="email" id="loginEmail" placeholder="Email" 
           style="width: 100%; padding: 12px; margin-bottom: 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.05); color: white;">
    <input type="password" id="loginPassword" placeholder="Password" 
           style="width: 100%; padding: 12px; margin-bottom: 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.05); color: white;">
    <button class="btn btn-primary" onclick="login()" style="width: 100%; margin-bottom: 12px;">
      Login
    </button>
    <button class="btn btn-secondary" onclick="showSignup()" style="width: 100%;">
      Create Account
    </button>
  </div>
  
  <!-- Signup Form (hidden by default) -->
  <div id="signupForm" style="display: none;">
    <input type="text" id="signupName" placeholder="Full Name" 
           style="width: 100%; padding: 12px; margin-bottom: 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.05); color: white;">
    <input type="email" id="signupEmail" placeholder="Email" 
           style="width: 100%; padding: 12px; margin-bottom: 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.05); color: white;">
    <input type="password" id="signupPassword" placeholder="Password (min 6 characters)" 
           style="width: 100%; padding: 12px; margin-bottom: 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.05); color: white;">
    <button class="btn btn-primary" onclick="signup()" style="width: 100%; margin-bottom: 12px;">
      Create Account
    </button>
    <button class="btn btn-secondary" onclick="showLogin()" style="width: 100%;">
      Back to Login
    </button>
  </div>
</div>

<!-- Main App (hidden until logged in) -->
<div id="mainApp" style="display: none;">
  <!-- Your existing wizard section goes here -->
</div>
```

### **5.3 Add Authentication Functions**

```javascript
// ============================================================================
// AUTHENTICATION FUNCTIONS
// ============================================================================

async function login() {
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;
  
  if (!email || !password) {
    alert('Please enter email and password');
    return;
  }
  
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });
  
  if (error) {
    alert('Login failed: ' + error.message);
    return;
  }
  
  currentUser = data.user;
  showMainApp();
  alert('✅ Logged in successfully!');
}

async function signup() {
  const name = document.getElementById('signupName').value;
  const email = document.getElementById('signupEmail').value;
  const password = document.getElementById('signupPassword').value;
  
  if (!name || !email || !password) {
    alert('Please fill all fields');
    return;
  }
  
  if (password.length < 6) {
    alert('Password must be at least 6 characters');
    return;
  }
  
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: name
      }
    }
  });
  
  if (error) {
    alert('Signup failed: ' + error.message);
    return;
  }
  
  alert('✅ Account created! Please check your email to confirm your account.');
  showLogin();
}

async function logout() {
  await supabase.auth.signOut();
  currentUser = null;
  document.getElementById('authSection').style.display = 'block';
  document.getElementById('mainApp').style.display = 'none';
  alert('Logged out successfully');
}

function showSignup() {
  document.getElementById('loginForm').style.display = 'none';
  document.getElementById('signupForm').style.display = 'block';
}

function showLogin() {
  document.getElementById('loginForm').style.display = 'block';
  document.getElementById('signupForm').style.display = 'none';
}

function showMainApp() {
  document.getElementById('authSection').style.display = 'none';
  document.getElementById('mainApp').style.display = 'block';
}
```

### **5.4 Save Assessment to Supabase**

Update the save button handler:

```javascript
document.getElementById('saveBtn').addEventListener('click', async () => {
  if (!currentUser) {
    alert('Please login to save assessments');
    return;
  }
  
  if (analysisData.frames.length < 30) {
    alert('Analyze at least 30 frames before saving');
    return;
  }

  const session = buildSession();
  const btn = document.getElementById('saveBtn');
  btn.disabled = true;
  btn.textContent = '💾 Saving...';

  try {
    // Upload video to storage (if video file exists)
    let videoUrl = null;
    if (playerProfile.videoFile) {
      const fileName = `${currentUser.id}/${Date.now()}_${playerProfile.videoFile.name}`;
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('tennis-videos')
        .upload(fileName, playerProfile.videoFile);
      
      if (uploadError) throw uploadError;
      
      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('tennis-videos')
        .getPublicUrl(fileName);
      
      videoUrl = publicUrl;
    }

    // Save assessment to database
    const { data, error } = await supabase
      .from('assessments')
      .insert([{
        user_id: currentUser.id,
        shot_type: session.summary.shotType,
        video_url: videoUrl,
        video_filename: playerProfile.videoFile?.name,
        frames_analyzed: session.summary.framesAnalyzed,
        avg_landmarks: session.summary.avgLandmarks,
        avg_confidence: session.summary.avgConfidence,
        overall_score: session.summary.score,
        grade: session.summary.grade,
        percentile: session.summary.percentile,
        shoulder_angle: session.summary.avgAngles.shoulder,
        elbow_angle: session.summary.avgAngles.elbow,
        hip_angle: session.summary.avgAngles.hip,
        knee_angle: session.summary.avgAngles.knee,
        trunk_angle: session.summary.avgAngles.trunk,
        wrist_angle: session.summary.avgAngles.wrist,
        session_data: session,
        ai_version: '1.0.0'
      }])
      .select();

    if (error) throw error;

    alert('✅ Assessment saved to your account!\n\n' +
          `Score: ${session.summary.score}\n` +
          `Grade: ${session.summary.grade}\n\n` +
          'View all your assessments in your dashboard.');

  } catch (error) {
    console.error('Save error:', error);
    alert('❌ Failed to save: ' + error.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '💾 Save Analysis';
  }
});
```

### **5.5 Load Assessment History**

Add function to load user's past assessments:

```javascript
async function loadAssessmentHistory() {
  if (!currentUser) return;
  
  const { data, error } = await supabase
    .from('assessments')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('analyzed_at', { ascending: false })
    .limit(10);
  
  if (error) {
    console.error('Error loading history:', error);
    return;
  }
  
  console.log('Assessment history:', data);
  return data;
}

async function loadProgress() {
  if (!currentUser) return;
  
  const { data, error } = await supabase
    .from('user_progress')
    .select('*')
    .eq('user_id', currentUser.id);
  
  if (error) {
    console.error('Error loading progress:', error);
    return;
  }
  
  console.log('Progress data:', data);
  return data;
}
```

---

## 📊 STEP 6: CREATE DASHBOARD PAGE

Create a new file `dashboard.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SmartSwing AI - Dashboard</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap" rel="stylesheet">
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  
  <style>
    /* Copy styles from smartswing-movenet-working.html */
    /* ... */
  </style>
</head>
<body>
  <div class="container">
    <h1>My Dashboard</h1>
    
    <div id="statsGrid">
      <!-- Total Assessments -->
      <div class="stat-card">
        <div class="stat-label">Total Assessments</div>
        <div class="stat-value" id="totalAssessments">0</div>
      </div>
      
      <!-- Average Score -->
      <div class="stat-card">
        <div class="stat-label">Average Score</div>
        <div class="stat-value" id="avgScore">0</div>
      </div>
      
      <!-- Best Score -->
      <div class="stat-card">
        <div class="stat-label">Best Score</div>
        <div class="stat-value" id="bestScore">0</div>
      </div>
      
      <!-- Improvement -->
      <div class="stat-card">
        <div class="stat-label">Improvement</div>
        <div class="stat-value" id="improvement">+0</div>
      </div>
    </div>
    
    <div id="assessmentList"></div>
    
    <button class="btn btn-primary" onclick="location.href='smartswing-movenet-working.html'">
      New Analysis
    </button>
  </div>
  
  <script>
    const SUPABASE_URL = 'YOUR_SUPABASE_URL';
    const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY';
    const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    
    async function loadDashboard() {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        window.location.href = 'index.html';
        return;
      }
      
      // Load assessments
      const { data: assessments } = await supabase
        .from('assessments')
        .select('*')
        .eq('user_id', session.user.id)
        .order('analyzed_at', { ascending: false });
      
      // Load progress
      const { data: progress } = await supabase
        .from('user_progress')
        .select('*')
        .eq('user_id', session.user.id);
      
      // Update stats
      if (progress && progress.length > 0) {
        const p = progress[0];
        document.getElementById('totalAssessments').textContent = p.total_assessments || 0;
        document.getElementById('avgScore').textContent = Math.round(p.avg_score) || 0;
        document.getElementById('bestScore').textContent = p.best_score || 0;
        document.getElementById('improvement').textContent = 
          (p.improvement >= 0 ? '+' : '') + Math.round(p.improvement || 0);
      }
      
      // Display assessments
      displayAssessments(assessments);
    }
    
    function displayAssessments(assessments) {
      const html = assessments.map(a => `
        <div style="padding: 20px; margin: 12px 0; background: rgba(255,255,255,0.05); border-radius: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
              <strong>${a.shot_type}</strong> - 
              Score: ${a.overall_score} (${a.grade}) - 
              ${new Date(a.analyzed_at).toLocaleDateString()}
            </div>
            <button onclick="viewAssessment('${a.id}')" class="btn btn-secondary">
              View
            </button>
          </div>
        </div>
      `).join('');
      
      document.getElementById('assessmentList').innerHTML = html || '<p>No assessments yet</p>';
    }
    
    function viewAssessment(id) {
      window.location.href = `smartswing-movenet-working.html?assessment=${id}`;
    }
    
    loadDashboard();
  </script>
</body>
</html>
```

---

## ✅ COMPLETE CHECKLIST

### **Setup (30 minutes)**
- [ ] Create Supabase project
- [ ] Copy API keys
- [ ] Run database schema SQL
- [ ] Configure authentication
- [ ] Create storage bucket
- [ ] Set storage policies

### **Integration (1 hour)**
- [ ] Add Supabase client to HTML
- [ ] Add login/signup UI
- [ ] Implement auth functions
- [ ] Update save button to use Supabase
- [ ] Test login/signup
- [ ] Test saving assessment
- [ ] Verify data in Supabase dashboard

### **Dashboard (30 minutes)**
- [ ] Create dashboard.html
- [ ] Load assessment history
- [ ] Display progress stats
- [ ] Test dashboard

---

## 🎉 **YOU'RE DONE!**

**What you now have:**
✅ Free cloud database (500MB)
✅ User authentication
✅ Assessment storage
✅ Video storage (1GB)
✅ Progress tracking
✅ Multi-user support
✅ Coach features
✅ Real-time updates
✅ Secure API access

**Total setup time:** ~2 hours
**Total cost:** $0 (free tier)

---

## 📞 **SUPPORT**

**Supabase Docs:** https://supabase.com/docs
**SmartSwing AI Issues:** Use the debug console (F12)
**Database queries:** Use Supabase SQL Editor
**File storage:** Check Storage logs in Supabase

---

**Your SmartSwing AI now has a complete backend!** 🎾☁️
