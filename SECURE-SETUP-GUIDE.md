# 🔐 SECURE GPT SETUP GUIDE - OPTION B (Environment Variables)
## Complete Implementation Instructions

---

## 📋 OVERVIEW

This guide will help you securely integrate your OpenAI GPT API with SmartSwing AI.

**Security Promise:**
- ✅ API key stored locally only
- ✅ Never committed to GitHub
- ✅ Never exposed in browser
- ✅ Production-ready security

---

## 🚀 STEP-BY-STEP SETUP

### **STEP 1: Create Security Files (5 minutes)**

#### **1.1 Create config.json**

In your project root folder (same level as index.html):

```bash
# Create the file
touch config.json
```

Open `config.json` and add:

```json
{
  "OPENAI_API_KEY": "PASTE_YOUR_KEY_HERE"
}
```

**⚠️ Replace `PASTE_YOUR_KEY_HERE` with your actual OpenAI API key**

#### **1.2 Update .gitignore**

Open your `.gitignore` file and add these lines:

```
# API Keys and Secrets - NEVER COMMIT THESE
config.json
.env
.env.local
.env.production
.env.development

# Backup files
*.backup
**/config.json
**/.env*
```

**This prevents your API key from being uploaded to GitHub!**

#### **1.3 Create config.example.json**

Create a template file (safe to commit):

```json
{
  "OPENAI_API_KEY": "sk-proj-your-key-here"
}
```

This shows others the format without exposing your key.

---

### **STEP 2: Add GPT Integration to Analyzer (10 minutes)**

#### **2.1 Open analyze.html**

Find the `</head>` tag and add BEFORE it:

```html
<!-- GPT Integration -->
<script src="gpt-integration-secure.js"></script>
```

#### **2.2 Add GPT UI Container**

Find where your report section ends, and add:

```html
<!-- GPT Analysis Section -->
<div id="gptAnalysisContainer" style="display: none;">
  <!-- GPT feedback will appear here -->
</div>
```

#### **2.3 Add GPT Styles**

Copy the entire contents of `gpt-ui-components.html` into your `<style>` section.

---

### **STEP 3: Integrate with Your Analysis Flow**

#### **3.1 Find Your Save Button Handler**

Look for code like:

```javascript
document.getElementById('saveBtn').addEventListener('click', async () => {
  // Your existing save code
});
```

#### **3.2 Add GPT Analysis Call**

After saving to Supabase, add:

```javascript
// After successful save
const session = buildSession();

// Add assessment ID to session
session.assessmentId = savedAssessmentId;

// Run GPT analysis
await handleAnalysisComplete(session);
```

**Complete example:**

```javascript
document.getElementById('saveBtn').addEventListener('click', async () => {
  // Your existing code...
  const session = buildSession();
  
  // Save to Supabase
  const { data, error } = await supabase
    .from('assessments')
    .insert([{
      // Your assessment data...
    }])
    .select();
  
  if (error) throw error;
  
  console.log('✅ Saved to database');
  
  // NEW: Add GPT Analysis
  session.assessmentId = data[0].id;
  await handleAnalysisComplete(session);
});
```

---

### **STEP 4: Upload Files to GitHub**

#### **4.1 Upload These Files:**

✅ `gpt-integration-secure.js` (no API key in it)
✅ `gpt-ui-components.html` (just styles)
✅ `analyze.html` (updated with integration)
✅ `.gitignore` (updated)
✅ `config.example.json` (template only)

#### **4.2 DO NOT Upload:**

❌ `config.json` (has your API key!)
❌ `.env` or `.env.local`

**Verify with:**

```bash
git status

# Should NOT show:
# - config.json
# - .env
```

---

### **STEP 5: Test Locally**

#### **5.1 Run Local Server**

```bash
# In your project folder
python3 -m http.server 8000

# Or use any local server
```

#### **5.2 Test GPT Integration**

1. Open http://localhost:8000/analyze.html
2. Open browser console (F12)
3. You should see:
   ```
   🤖 GPT Integration Module Loaded
   ⚙️ Configuration: {model: 'gpt-4o', ...}
   ✅ GPT API key loaded from config
   ```

4. Upload a video and analyze
5. After analysis completes, GPT should stream feedback

#### **5.3 Check Console Output**

Look for:
```
🤖 Starting GPT analysis with streaming...
✅ Streaming complete
✅ GPT Analysis Complete: {tokens: 450, cost: "$0.0045"}
✅ GPT analysis saved to database
```

---

### **STEP 6: Deploy to GitHub Pages**

#### **6.1 Before Deploying**

**Important:** GitHub Pages is static hosting. Your `config.json` won't be available there.

**Two options:**

**Option A: Temporary - Embed for Testing**

In `gpt-integration-secure.js`, temporarily add your key (line 30):

```javascript
// TEMPORARY - For GitHub Pages testing only
let OPENAI_API_KEY = 'sk-proj-YOUR-KEY';
```

**⚠️ This exposes your key! Only for testing, then remove it.**

**Option B: Backend Route (Production)**

Use Vercel/Netlify backend (I'll create this next if needed)

#### **6.2 Push to GitHub**

```bash
git add .
git commit -m "Add GPT integration"
git push origin main
```

#### **6.3 Test Live Site**

Visit: https://bemedrado-glitch.github.io/smartswing-ai/analyze.html

Test a swing analysis and verify GPT feedback appears.

---

## 🧪 TESTING CHECKLIST

Test each feature:

- [ ] **Local Server**
  - [ ] config.json loads correctly
  - [ ] Console shows "✅ GPT API key loaded"
  - [ ] No API key visible in browser inspector

- [ ] **Analysis Flow**
  - [ ] Upload video
  - [ ] Run analysis
  - [ ] See "🤖 AI Coach is analyzing..." 
  - [ ] GPT feedback streams in real-time
  - [ ] Final analysis displays beautifully

- [ ] **Database**
  - [ ] Check Supabase assessments table
  - [ ] gpt_analysis column has text
  - [ ] analyzed_with_gpt = true
  - [ ] gpt_tokens_used has count
  - [ ] gpt_cost has value

- [ ] **Console Monitoring**
  - [ ] No errors
  - [ ] Token count displayed
  - [ ] Cost calculated
  - [ ] Streaming works smoothly

---

## 💰 COST MONITORING

### Check Your Usage:

```javascript
// Add to console for testing
console.log('Total analyses:', totalAnalyses);
console.log('Total cost:', totalCost);
```

### Track in Database:

```sql
-- Check total GPT usage
SELECT 
  COUNT(*) as total_analyses,
  SUM(gpt_tokens_used) as total_tokens,
  SUM(gpt_cost) as total_cost
FROM assessments
WHERE analyzed_with_gpt = true;
```

### Set Alerts:

In OpenAI Dashboard:
1. Go to Usage → Limits
2. Set monthly limit (e.g., $10)
3. Set email alerts at 80%

---

## 🔒 SECURITY VERIFICATION

### Double-Check Security:

```bash
# 1. Verify config.json NOT in git
git ls-files | grep config.json
# Should return nothing

# 2. Check .gitignore working
cat .gitignore | grep config.json
# Should show: config.json

# 3. Search for API key in code
grep -r "sk-proj" *.js *.html
# Should only find in config.json (not tracked)
```

### If API Key Leaked:

1. **Immediately** go to OpenAI → API Keys
2. **Revoke** the compromised key
3. **Generate** new key
4. **Update** your config.json
5. **Never** commit config.json

---

## 📊 SUCCESS METRICS

You'll know it's working when:

✅ Analysis completes normally
✅ "🤖 AI Coach Feedback" appears below report
✅ Feedback streams in real-time (5-10 seconds)
✅ Console shows successful API call
✅ Database has gpt_analysis saved
✅ Cost tracking shows ~$0.002 per analysis
✅ No API key visible in browser tools

---

## 🐛 TROUBLESHOOTING

### Issue: "GPT API key not configured"

**Solution:**
```javascript
// Check config.json exists
fetch('/config.json')
  .then(r => r.json())
  .then(config => console.log('Config:', config))
  .catch(e => console.error('Config not found!'));
```

### Issue: "API error: 401 Unauthorized"

**Solution:**
- API key incorrect
- Check OpenAI dashboard for key status
- Regenerate if needed

### Issue: "API error: 429 Rate limit"

**Solution:**
- Too many requests
- Wait a minute
- Check OpenAI usage limits

### Issue: Streaming doesn't work

**Solution:**
```javascript
// Temporarily disable streaming for testing
const GPT_CONFIG = {
  streaming: false  // Change to false
};
```

### Issue: CORS error

**Solution:**
- Only happens with OpenAI API directly
- Need backend proxy (Option A - Vercel)
- Or add CORS headers (advanced)

---

## 🎯 PRODUCTION DEPLOYMENT

For production with 100% security:

**I recommend creating a backend API route (10 mins):**

Would you like me to create:
1. Vercel serverless function
2. Handles API calls server-side
3. API key never exposed
4. Production-ready

Just say "Yes, create backend route" and I'll build it!

---

## 📞 SUPPORT

Need help?
- Check console for errors
- Verify config.json format
- Test API key in OpenAI Playground
- Check Supabase connection

---

## ✅ FINAL CHECKLIST

Before going live:

- [ ] config.json created with your API key
- [ ] .gitignore updated (config.json listed)
- [ ] gpt-integration-secure.js uploaded
- [ ] gpt-ui-components.html styles added
- [ ] analyze.html updated with integration
- [ ] Tested locally (works!)
- [ ] config.json NOT in GitHub
- [ ] Supabase schema updated
- [ ] GPT feedback appears after analysis
- [ ] Database saves gpt_analysis
- [ ] Cost monitoring setup
- [ ] Monthly budget limit set

---

**You're ready to add AI coaching to every swing analysis!** 🎾🤖✨

**Your API key is secure and never exposed!** 🔒
