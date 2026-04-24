# Match analysis (Phase A)

This directory holds the modules that turn a full-match video into a
per-rally analysis. It ships in five PRs:

| PR | Scope | Status |
|---|---|---|
| 1 | Multi-player tracker | ✅ shipped |
| 2 | Rally segmentation + shot classification | ✅ shipped |
| **3** | **Chunked long-video processor (memory mgmt)** | ✅ shipped |
| 4 | Click-to-pick player selection UX | queued |
| 5 | Match report page | queued |

Everything in this directory is pure JS — no DOM, no pose-library deps —
so it's fully testable under Node. Browser wiring happens in `analyze.html`
via the existing `<script src="./match/...">` pattern.

## player-tracker.js

Turns a stream of "N poses per frame" (the output of BlazePose MultiPose)
into stable per-player tracks using Hungarian assignment on bounding-box
centroids.

### Public API

```js
const { PlayerTracker } = window.SmartSwingPlayerTracker;

const tracker = new PlayerTracker({
  maxAbsentFrames: 90,     // ~3 seconds at 30fps
  maxMatchDistance: 300    // pixels; cap on how far a track can "teleport"
});

// Each frame:
const detections = await poseDetector.estimatePoses(video); // [{bbox, keypoints, score}]
const assignments = tracker.advance(frameIdx, detections);
// assignments: [{ trackId: 'track-1', pose, wasNew: true }, ...]

// When done processing:
tracker.labelSides({ canvasHeight: video.videoHeight });
const subject = tracker.pickSubject({ side: 'near' });
// subject: { trackId, track } where track.poses = [{frameIdx, pose}, ...]
```

### Track lifecycle

- A track is **created** the frame a detection appears that can't be
  matched to any existing track.
- It's **updated** every frame it gets a match.
- It's **expired** (marked with `expired: true`) after
  `maxAbsentFrames` consecutive unassigned frames. Call `pruneExpired()`
  to drop them from memory.

### Why Hungarian?

When two players briefly cross paths (changeovers, doubles cross-court
movement) bounding boxes overlap. Greedy nearest-neighbour loses the
assignment on those frames; Hungarian solves the joint assignment
optimally, so both tracks stay attached to the right player.

For ≤6 detections per frame the O(n³) cost is irrelevant — adds <0.1ms
per frame even on a cold CPU.

### Side labelling

Tennis match video almost always has one player near the camera and one
far. `labelSides()` sorts tracks by average bbox Y position:

- **near**: highest average Y (closer to bottom of screen)
- **far**: second-highest
- **other**: anything else (refs, coaches, ball-boys)

Tracks with fewer than `minPoses` observations (default 10) are skipped
during labelling so a referee walking through one frame doesn't get
promoted to "player."

### Why this module doesn't import BlazePose

BlazePose (`@tensorflow-models/pose-detection`) is already loaded by
`analyze.html`. Passing its output through this tracker is a 5-line
integration in the capture loop. Keeping the tracker pose-library-
agnostic means:

1. It runs in Node for the test suite with zero browser shim
2. Swapping to YOLO-Pose or MoveNet multipose later is a one-file change
3. The 700+ test cases in `tests/functional-tests.js` keep protecting
   track behavior through any future detector change

### Integration notes for PR 2+

Rally segmentation (PR 2) will consume the tracks directly:

```js
const tracks = tracker.getTracks();
for (const [id, track] of Object.entries(tracks)) {
  const rallies = segmentRallies(track.poses); // PR 2 work
  // ...
}
```

No changes to this module should be needed. The track shape is the
stable contract.
