# Test Plan for TextForageView Submission Flow Refactor

## Changes Made
1. **Immediate Local Save**: Text blocks are now saved immediately with minimal data, then enriched asynchronously
2. **Background Metadata Processing**: URL extraction and location lookup happen in the background
3. **Error Boundaries**: Added timeout handling and error recovery for metadata operations
4. **UI Responsiveness**: Form clears immediately after local save, not after full processing

## Key Functions Modified

### `enrichBlockMetadata(blockId, textContent)`
- Extracts URL metadata asynchronously with 10-second timeout
- Uses Promise.allSettled to handle individual operation failures
- Updates block after metadata extraction completes

### `onSaveResult()`
- Clears UI immediately after capturing form state
- Creates text blocks immediately with minimal data
- Triggers background metadata enrichment without blocking
- Adds error recovery to re-populate form on failure

### `processMediaAsset(asset)`
- Added 5-second timeout for location metadata extraction
- Fallback to basic lat/lng coordinates if reverse geocoding fails
- Better error handling for EXIF processing

## Testing Scenarios

### 1. Text Submission Performance
- Type text and submit → UI should clear immediately
- Check database for immediate save before metadata processing
- Verify URL links get enriched to Link type asynchronously

### 2. Error Recovery
- Submit with poor network → form should not hang
- Test timeout scenarios for URL extraction and location services
- Verify form re-populates on submission errors

### 3. Media Processing
- Upload images with GPS data → location processing should have timeout
- Test with corrupted EXIF data → should fallback gracefully
- Verify capture time extraction still works

### 4. Background Processing
- Submit URL and immediately background app → metadata should still process
- Monitor console for background operation warnings
- Verify no UI blocking during metadata operations

## Expected Behavior
- ✅ Text submission clears form within 100ms
- ✅ No UI freezing during URL or location processing
- ✅ Graceful degradation when metadata services fail
- ✅ Error recovery maintains user's input on failure
- ✅ Background operations don't affect user experience