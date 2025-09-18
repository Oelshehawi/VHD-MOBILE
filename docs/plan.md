# 2025 Concurrent Photo Upload Implementation Plan

## Current System Analysis

### How to Know if It's Concurrently Uploading
Currently, your system is **NOT** uploading concurrently. Evidence:
- BackgroundUploadService processes one `uploadData()` call at a time
- PowerSync attachment queue processes sequentially through `uploadData()`
- No parallel processing implementation found
- 2-second polling interval between upload cycles
- Single background service handles all uploads

### Current Upload Flow
1. `PhotoCapture.tsx` � `batchSavePhotosFromUri()` � Local storage + PowerSync queue
2. `checkAndStartBackgroundUpload()` � Background service starts
3. `BackgroundUploadService` polls every 2 seconds for pending uploads
4. `uploadWithRetry()` � `system.backendConnector.uploadData()` � Sequential processing
5. PowerSync processes one attachment at a time

### Current Bottlenecks
1. **Sequential Processing**: Only one photo uploads at a time through PowerSync
2. **PowerSync Queue Limitation**: Built-in queue processes attachments one by one
3. **Memory Issues**: 10MB limit, large files loaded entirely into memory
4. **No Progress Tracking**: Per-file progress not visible to users
5. **Polling Delay**: 2-second intervals add latency

## Proposed Solution: PowerSync-Compatible Concurrent Upload System

### Key Constraint: Must Use PowerSync Attachment Queue
- PowerSync attachment queue is essential for tracking upload states
- Ensures data consistency and proper retry handling
- Maintains offline capability and sync integrity
- Cannot bypass PowerSync without losing state management

### 1. **Enhanced PowerSync Integration**

#### A. Modify PhotoAttachmentQueue.ts
- Add concurrent batch processing within PowerSync constraints
- Implement intelligent upload prioritization
- Enhanced retry logic with exponential backoff
- Better memory management for large files

#### B. Improve BackgroundUploadService.ts
- **Multi-worker approach**: Process multiple PowerSync transactions concurrently
- **Smart scheduling**: Batch smaller files, chunk larger ones
- **Progress tracking**: Per-file upload progress
- **Memory monitoring**: Pause uploads if memory pressure detected

### 2. **Handle Larger Images (13MB+)**

#### A. Simplified Large File Handling (No Chunking Needed)
Since your MongoDB schema only stores photo URLs in schedules (not file chunks), chunking is **not necessary**:
- **Direct Cloudinary upload**: Large files go directly to Cloudinary
- **PowerSync stores URL only**: Only the resulting URL is synced through PowerSync
- **Increase file size limit**: Raise from 10MB to 20MB+ for better UX
- **Memory optimization**: Stream-based uploads without full file loading

#### B. Memory Optimization
- **Stream-based processing**: Avoid loading entire files into memory
- **Progressive compression**: WebP conversion to reduce file sizes by ~29%
- **Garbage collection**: Explicit cleanup after each upload
- **Thumbnail generation**: Immediate UI feedback while uploading

### 3. **Concurrent Architecture Within PowerSync**

#### A. Enhanced BackgroundUploadService
```typescript
// Conceptual implementation
const CONCURRENT_WORKERS = 3; // Configurable based on device
const MAX_FILE_SIZE_MEMORY = 10 * 1024 * 1024; // 10MB

// Process multiple PowerSync upload batches concurrently
const concurrentUploadWorkers = Array.from({ length: CONCURRENT_WORKERS },
  () => processUploadBatch()
);

await Promise.allSettled(concurrentUploadWorkers);
```

#### B. Intelligent Batch Processing
- **Small files**: Batch upload 3-5 simultaneously
- **Large files**: Process individually with memory management
- **Priority queue**: Signatures first, then by upload order
- **Network awareness**: Adjust concurrency based on connection

### 4. **Platform Compatibility (iOS & Android)**

#### A. Background Processing
- **Keep react-native-background-actions**: As required (expo-background-tasks fails when app killed)
- **iOS 18 compliance**: Handle strict background processing limitations
- **Android 14/15**: Proper foreground service notifications and permissions
- **Battery optimization**: Smart scheduling to minimize battery drain

#### B. Memory Management by Platform
- **iOS**: Leverage memory pressure APIs
- **Android**: Monitor heap usage and GC events
- **Cross-platform**: Universal memory threshold monitoring

### 5. **Implementation Steps**

#### Core Concurrency Implementation
- [ ] Modify BackgroundUploadService for concurrent PowerSync processing
- [ ] Add configurable worker limits (2-4 concurrent uploads)
- [ ] Implement smart batching for small files
- [ ] Enhanced progress tracking and logging

#### Large File Support
- [ ] Increase file size limit from 10MB to 20MB+
- [ ] Add memory pressure monitoring
- [ ] Stream-based upload processing
- [ ] WebP conversion for large images

#### UI/UX Improvements
- [ ] Real-time upload progress in UI
- [ ] Background notification enhancements
- [ ] Better error messaging and recovery
- [ ] Performance testing and optimization

### 6. **Technical Implementation Details**

#### A. PowerSync Queue Enhancement
- Maintain PowerSync as source of truth for upload states
- Add metadata fields for chunk information
- Implement concurrent batch retrieval from queue
- Enhanced retry logic with exponential backoff

#### B. Simplified Large File Flow
1. Large file detected (>10MB)
2. Direct upload to Cloudinary with progress tracking
3. PowerSync queue stores only the resulting URL
4. MongoDB schedule updated with photo URL reference
5. No chunking needed since only URLs are synced

#### C. Memory Management
- Stream-based file reading for large files
- Explicit garbage collection after uploads
- Memory pressure monitoring with upload throttling
- Platform-specific memory optimization

### 7. **Manual Testing Plan**

#### A. Concurrent Upload Testing
**Test Scenario 1: Multiple Small Files (2-5MB each)**
1. Take 5-8 photos in quick succession
2. Observe background notification showing multiple uploads
3. Check console logs for concurrent worker activity
4. Verify all photos appear in schedule within expected time

**Test Scenario 2: Mixed File Sizes**
1. Take 2 small photos (2MB), 2 large photos (13MB+)
2. Observe upload prioritization (small files first)
3. Check memory usage during large file uploads
4. Verify no app crashes or memory warnings

**Test Scenario 3: Network Conditions**
1. Test on WiFi with concurrent uploads
2. Switch to cellular during upload process
3. Test with poor network (throttled connection)
4. Verify retry logic and error handling

#### B. Large File Testing (13MB+)
**Test Scenario 4: Maximum File Size**
1. Take high-resolution photos (15-20MB)
2. Verify file size limit increased from 10MB
3. Monitor memory usage during upload
4. Check upload progress feedback

**Test Scenario 5: Memory Pressure**
1. Upload multiple large files simultaneously
2. Monitor device memory usage
3. Verify graceful handling of memory pressure
4. Check for proper garbage collection

#### C. Platform-Specific Testing
**iOS Testing:**
- Test background app refresh scenarios
- Verify background upload continues when app backgrounded
- Check iOS memory pressure handling
- Test with low power mode enabled

**Android Testing:**
- Test foreground service notifications
- Verify uploads continue after app kill
- Check battery optimization scenarios
- Test on different Android versions (12+)

### 8. **What You'll Notice After Implementation**

#### A. Immediate Observable Changes
**Background Notifications:**
- Multiple "Uploading X of Y photos" notifications instead of single file
- Progress bars showing concurrent upload progress
- Faster completion times for batches of photos

**Console Logs:**
```
[BackgroundUpload] Starting 3 concurrent workers
[BackgroundUpload] Worker 1: Processing attachment batch (2 files)
[BackgroundUpload] Worker 2: Processing attachment batch (1 large file)
[BackgroundUpload] Worker 3: Processing attachment batch (3 files)
[BackgroundUpload] Uploaded 6 photos in 45 seconds (previously: 2-3 minutes)
```

**App Performance:**
- Faster photo upload completion
- Better responsiveness during uploads
- No app freezing with large files
- Smoother background processing

#### B. Performance Improvements
**Upload Speed:**
- **Before**: 5 photos take ~2-3 minutes (sequential)
- **After**: 5 photos take ~45-60 seconds (concurrent)
- Large files (13MB+) upload without memory issues
- Better progress feedback and error recovery

**Memory Usage:**
- Stable memory consumption even with large files
- No memory spikes or crashes
- Proper cleanup after each upload
- Better handling of multiple simultaneous uploads

**User Experience:**
- Real-time upload progress per file
- Faster batch completion
- Better error messages
- No blocking UI during uploads

#### C. Technical Indicators
**PowerSync Integration:**
- Attachment queue state management still intact
- Proper offline/online sync behavior
- Correct retry logic for failed uploads
- Consistent data synchronization

**System Stability:**
- No memory leaks or crashes
- Proper background service management
- Cross-platform compatibility maintained
- Battery usage remains reasonable

### 9. **Success Metrics**
- **Upload Speed**: 3-4x faster for multiple files
- **Memory Usage**: Stable memory usage for 13MB+ files
- **Reliability**: 99%+ upload success rate
- **User Experience**: Real-time progress feedback
- **Battery Impact**: Minimal additional battery drain

This simplified plan maintains PowerSync integration while adding true concurrency, supports larger files without chunking complexity, and ensures cross-platform compatibility with your current constraints.