# Pill Scanner Components

Comprehensive UI components for the AI-powered pill identification feature, built based on the backend vision service implementation.

## Components Overview

### Core Components

#### 1. **index.tsx** - Main PillScanner Component
The primary component that orchestrates the pill scanning workflow:
- File upload with drag-and-drop support
- Image preview with zoom and rotation controls
- AI-powered feature extraction and identification
- Multiple drug match display with confidence scores
- Scan history tracking (localStorage)
- Error handling and validation

**Features:**
- Validates file type (JPEG/PNG only) and size (max 10MB)
- Parses backend response to extract drug matches
- Saves scan history to localStorage
- Displays extracted features (imprint, color, shape)
- Shows multiple possible matches with confidence scores

#### 2. **pill-scanner-full.tsx** - Full Page Layout
Enhanced version with tabbed interface:
- Scanner tab (main functionality)
- History tab (recent scans)
- Stats tab (system information)
- Help tab (documentation and examples)

### UI Components

#### 3. **pill-upload-zone.tsx** - Upload Interface
Drag-and-drop file upload zone with:
- Visual feedback for drag events
- File input trigger buttons
- Support for camera capture
- File type and size validation
- Disabled state handling

#### 4. **pill-image-preview.tsx** - Image Preview
Interactive image preview with controls:
- Zoom in/out (0.5x to 3x)
- Rotation (90° increments)
- Remove image button
- Smooth transitions

#### 5. **pill-feature-display.tsx** - Feature Extraction Display
Shows extracted visual features:
- Imprint text with OCR confidence
- Color identification
- Shape detection
- Clean card-based layout

#### 6. **pill-match-card.tsx** - Drug Match Card
Individual drug match display:
- Drug name and generic name
- Manufacturer information
- Price information
- Match score with color-coded badge
- Match reason (Text/Vector search)
- View details button

#### 7. **pill-results-panel.tsx** - Results Display
Comprehensive results panel:
- Status alert (high/medium/low confidence)
- Best match highlight
- Additional matches list
- Safety warning
- Action buttons (scan another)

### Information Components

#### 8. **pill-scanner-stats.tsx** - System Statistics
Displays system capabilities:
- Database size (250K+ records)
- Search methods (Text + Vector)
- Accuracy metrics
- Processing time

#### 9. **pill-scanner-help.tsx** - Help & Documentation
Accordion-based help system:
- How it works explanation
- Best practices for photos
- Safety information and limitations
- Troubleshooting guide

#### 10. **pill-examples.tsx** - Common Pills
Examples of identifiable pills:
- Dolo 650 (Paracetamol)
- Pan 40 (Pantoprazole)
- Azithral 500 (Azithromycin)
- Crocin (Paracetamol)

#### 11. **pill-scan-history.tsx** - Scan History
Recent scans tracking:
- Last 50 scans stored in localStorage
- Timestamp with relative time display
- Confidence scores
- Clear history functionality
- Individual item removal

## Backend Integration

### API Endpoint
```typescript
POST /api/vision/identify-pill
Content-Type: multipart/form-data

Response: PillIdentification {
  name: string
  confidence: number
  description: string
  color?: string
  shape?: string
  imprint?: string
}
```

### Backend Features Used
1. **Gemini Vision AI** - Feature extraction (OCR, color, shape)
2. **Turso Database** - Text search on 250K+ Indian drugs
3. **Qdrant Vector DB** - Semantic similarity search
4. **Sentence Transformers** - all-MiniLM-L6-v2 embeddings

### Search Strategy
1. **Text Search**: Direct imprint matching in Turso
2. **Vector Search**: Semantic similarity in Qdrant
3. **Score Ranking**: Combined results sorted by confidence

## Usage

### Basic Usage (Widget)
```tsx
import PillScanner from "@/components/PillScanner";

<PillScanner />
```

### Full Page Usage
```tsx
import PillScannerFull from "@/components/PillScanner/pill-scanner-full";

<PillScannerFull />
```

### Individual Components
```tsx
import PillUploadZone from "@/components/PillScanner/pill-upload-zone";
import PillMatchCard from "@/components/PillScanner/pill-match-card";
import PillFeatureDisplay from "@/components/PillScanner/pill-feature-display";

// Use individually as needed
```

## Features

### Image Processing
- ✅ Drag-and-drop upload
- ✅ File type validation (JPEG/PNG)
- ✅ File size validation (max 10MB)
- ✅ Image preview with zoom/rotate
- ✅ Magic byte validation

### AI Analysis
- ✅ Gemini Vision feature extraction
- ✅ OCR for imprint text
- ✅ Color detection
- ✅ Shape identification
- ✅ Confidence scoring

### Database Search
- ✅ Text search (Turso)
- ✅ Vector similarity (Qdrant)
- ✅ Multiple match results
- ✅ Score-based ranking

### User Experience
- ✅ Loading states
- ✅ Error handling
- ✅ Success/warning alerts
- ✅ Safety warnings
- ✅ Scan history
- ✅ Help documentation
- ✅ Example pills
- ✅ System statistics

## Safety Features

### Warnings Displayed
- Visual matching only - not medical advice
- Many pills look similar
- Always verify with pharmacist
- Never take based on visual ID alone
- Consult healthcare professional if unsure

### Validation
- File type checking
- File size limits
- Magic byte validation
- Error boundaries
- Graceful degradation

## Dependencies

### Required UI Components
- Card, Button, Badge, Alert
- Tabs, Accordion
- Icons from lucide-react

### External Libraries
- date-fns (for timestamp formatting)
- Next.js Image component
- React hooks (useState, useEffect, useRef)

## File Structure
```
frontend/components/PillScanner/
├── index.tsx                    # Main scanner component
├── pill-scanner-full.tsx        # Full page with tabs
├── pill-upload-zone.tsx         # Upload interface
├── pill-image-preview.tsx       # Image preview with controls
├── pill-feature-display.tsx     # Extracted features
├── pill-match-card.tsx          # Individual match card
├── pill-results-panel.tsx       # Results display
├── pill-scanner-stats.tsx       # System statistics
├── pill-scanner-help.tsx        # Help documentation
├── pill-examples.tsx            # Common pills
├── pill-scan-history.tsx        # Scan history
└── README.md                    # This file
```

## Integration Points

### Dashboard Widget
```tsx
// frontend/components/dashboard/widgets/pill-scanner.tsx
import PillScanner from "@/components/PillScanner";
export default PillScanner;
```

### Dashboard Page
```tsx
// frontend/app/dashboard/PillScanner/page.tsx
import PillScannerFull from "@/components/PillScanner/pill-scanner-full";

export default function PillScannerPage() {
  return (
    <div className="container mx-auto p-6">
      <PillScannerFull />
    </div>
  );
}
```

## Future Enhancements

### Potential Additions
- [ ] Camera capture integration
- [ ] Batch scanning
- [ ] Export scan results
- [ ] Share functionality
- [ ] Advanced filters
- [ ] Comparison view
- [ ] Offline mode
- [ ] PWA support

### Backend Improvements
- [ ] Caching layer
- [ ] Rate limiting
- [ ] Analytics tracking
- [ ] A/B testing
- [ ] Model fine-tuning
