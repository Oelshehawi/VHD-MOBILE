# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Tech Stack

- **Platform**: Expo 54 (React Native, cross-platform iOS/Android/Web)
- **Language**: TypeScript 5.9
- **UI Framework**: React Native with NativeWind (Tailwind CSS) and React Navigation
- **State Management**: Context API (ThemeProvider, PowerSyncProvider)
- **Database**: PowerSync (local-first sync) + OPSqlite for local storage
- **Authentication**: Clerk (with custom token template for PowerSync)
- **Styling**: NativeWind (Tailwind CSS for React Native)
- **Icons**: Expo Vector Icons (FontAwesome)

## Development Commands

```bash
# Start development server
npm start

# Run on specific platform
npm run android
npm run ios
npm run web

# Linting & Type Checking
npm run lint:types           # Run TypeScript type check (no emit)

# Testing
npm test                     # Run Jest with watch mode
npm test -- --no-coverage   # Run tests without coverage

# Analysis & Build
npm run analyze              # Generate sourcemap and analyze bundle
```

**Important**: Always run both `npm run lint:types` and `npm run lint:eslint` after making changes to catch type errors and linting issues before committing.

## Project Architecture

### Overview

VHD-App is an Expo-based mobile application for field service management with real-time job scheduling, technician availability tracking, photo documentation, and invoice management. It uses **local-first architecture with PowerSync** for offline-capable sync and **Clerk** for authentication.

### Core Architecture Pattern

```
Providers (Global State)
├── ClerkProvider (Authentication)
├── PowerSyncProvider (Database sync)
├── ThemeProvider (Theme management)
├── BottomSheetModalProvider (Modal dialogs)
└── GestureHandlerRootView (Gesture handling)
        ↓
   Router (Expo Router)
   ├── (auth) - Sign-in screens
   └── (tabs) - Main app with 3 tabs
        ├── Dashboard
        ├── Schedule
        └── Profile
        ↓
   Services Layer
   ├── ApiClient (REST API)
   ├── Database (PowerSync + BackendConnector)
   ├── Storage (Cloudinary + attachment queue)
   └── Background jobs (Photo uploads)
```

### Data Architecture: Local-First with PowerSync

**Key Pattern**: All data flows through PowerSync's local SQLite database first, then syncs to backend.

**Sync Flow**:
1. **Local Operations**: App writes to local PowerSync tables
2. **Operation Tracking**: `add_photo_operations` and `delete_photo_operations` tables track mutations
3. **BackendConnector**: Implements `uploadData()` to push mutations to the server
4. **Download**: Server returns new/updated data; PowerSync merges conflicts
5. **Attachment Sync**: `PhotoAttachmentQueue` handles concurrent file uploads to Cloudinary with retry logic

**Key Tables** (defined in `services/database/schema.ts`):
- `schedules` - Job assignments with assigned technicians
- `invoices` - Invoice records
- `payrollperiods` - Payroll period configuration
- `availability` - Technician availability windows
- `timeoffRequests` - Time-off request tracking
- `attachments` - File metadata
- `add_photo_operations` / `delete_photo_operations` - Sync operation tracking

**Query Pattern**:
```typescript
// Reactive subscriptions using PowerSync hooks
const { data: schedules } = useQuery<Schedule>(
  `SELECT * FROM schedules WHERE isActive = true ORDER BY startTime`
);

// Writes go through ApiClient
await ApiClient.from('schedules').upsert({ id, ...data });
```

### Authentication & Authorization

**Clerk Integration**:
- Token caching via `tokenCache` for persistent sessions
- Custom PowerSync token template for backend authentication
- User metadata: `user.publicMetadata.isManager` determines role

**Protected Routes**:
- Unauthenticated users redirected to `(auth)/sign-in`
- PowerSync initializes after Clerk loads (checks `isLoaded` flag)
- Technician name mapping in `PowerSyncProvider.tsx` for user display

### Component Organization

**Directory Structure**:
- `app/` - Expo Router page structure (follows file-based routing)
  - `(auth)/` - Authentication screens
  - `(tabs)/` - Main app with bottom tab navigation
  - `_layout.tsx` - Root layout with all providers
- `components/` - Reusable React components organized by feature
  - `dashboard/` - Dashboard tab
  - `schedule/` - Schedule tab and related modals
  - `PhotoComponents/` - Photo capture and gallery
  - `common/` - Shared UI components
- `services/` - Business logic and integrations
  - `ApiClient.ts` - REST API client (wraps Supabase PostgREST)
  - `database/` - PowerSync setup and schema
  - `data/` - Data access layer (custom hooks for queries)
  - `storage/` - Cloudinary integration
- `providers/` - React Context providers
- `utils/` - Utility functions and helpers
- `types/` - TypeScript type definitions

**Component Patterns**:
- **Container Components**: Manage state and logic (DashboardView, ScheduleView)
- **Presentational Components**: Display data (PhotoItem, Card)
- **Custom Hooks**: Data fetching and state management (useSchedules, useQuery)
- **Modal Pattern**: Bottom sheet modals for detailed flows (InvoiceModal, PhotoDocumentationModal)
- **Theme**: NativeWind classNames; color values from `constants/Colors.ts`

### Feature Breakdown

**Dashboard Tab** (`app/(tabs)/index.tsx`):
- Real-time job metrics and summaries
- Current payroll period display
- Weather data integration
- Quick access to scheduled work

**Schedule Tab** (`app/(tabs)/schedule.tsx`):
- Calendar views (Month, Week, Daily)
- Job assignment and detail view
- **Photo Documentation**: Capture before/after photos with metadata
- **Invoice Management**: Create and send invoices
- **Technician Notes**: Add/edit job notes
- **Signature Capture**: Digital signature for job sign-off

**Profile Tab** (`app/(tabs)/profile.tsx`):
- User profile management
- **Availability Management**: Set working hours/availability windows
- **Time-Off Requests**: Request and track time-off periods
- **Theme Selection**: Switch between light/dark themes

**Background Services**:
- Photo upload queue with retry logic
- OTA update checking and notification
- Network status monitoring

### Database Connection Pattern

**Reading Data**:
```typescript
// From data hooks (services/data/*.ts)
const { data, isLoading } = useSchedules(userId, isManager);
// Uses PowerSync's useQuery() hook for reactive subscriptions
```

**Writing Data**:
```typescript
// Direct API writes
await ApiClient.from('schedules').upsert(scheduleData);
await ApiClient.from('invoices').update(invoiceData).eq('id', invoiceId);
await ApiClient.from('schedules').delete().eq('id', scheduleId);

// Or through service methods for complex operations
await sendInvoice(invoiceId);
await updateAvailability(technicianId, availability);
```

### Key Services

**ApiClient** (`services/ApiClient.ts`):
- Wrapper around REST API endpoints
- Methods: `.from(table).select()`, `.upsert()`, `.update()`, `.delete()`
- Handles authentication headers and error responses

**BackendConnector** (`services/database/BackendConnector.ts`):
- Implements PowerSync's `PowerSyncBackendConnector` interface
- `uploadData()` - Pushes local mutations to server
- `downloadData()` - Fetches server state for given tables
- Token renewal via Clerk

**PhotoAttachmentQueue** (`services/database/PhotoAttachmentQueue.ts`):
- Manages concurrent photo uploads to Cloudinary
- Retry logic for failed uploads
- Tracks operation state (pending, completed, failed)

**CloudinaryStorageAdapter** (`services/storage/CloudinaryStorageAdapter.ts`):
- File upload/download handling
- Signed URL generation
- Part of PowerSync's attachment sync

## Important Implementation Notes

### Offline-First Design

The app is designed to work offline:
1. All data reads go through local PowerSync database
2. Writes are queued if offline
3. When reconnected, `BackendConnector.uploadData()` syncs pending changes
4. Photo uploads queue and retry when network available

**Do not bypass PowerSync**: Always use `useQuery()` for reads and `ApiClient` for writes instead of direct database calls.

### Photo System

Photos are stored as attachments:
- Metadata in `add_photo_operations` / `delete_photo_operations` tables
- Files in Cloudinary CDN
- `PhotoAttachmentQueue` handles async upload with retry
- Use `PhotoCapture.tsx` for capturing, `PhotoDocumentationModal.tsx` for management

### Type Safety

- Strict TypeScript mode enabled (`strict: true` in tsconfig.json)
- Interface definitions for API responses in `types/`
- Always define types for service responses

### Styling

- Use NativeWind classNames: `className="bg-white dark:bg-slate-900 p-4"`
- Colors defined in `constants/Colors.ts` (theme-aware)
- Responsive with `sm:`, `md:`, `lg:` prefixes when applicable

### Environment Variables

Defined in `.env`:
- `EXPO_PUBLIC_API_URL` - Backend API endpoint
- `EXPO_PUBLIC_POWERSYNC_URL` - PowerSync service endpoint
- `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` - Clerk public key

All public values must be prefixed with `EXPO_PUBLIC_`.

### Testing

- Jest preset: `jest-expo`
- Run: `npm test`
- For a single test file: `npm test -- path/to/test.ts`

### Building for Production

Use EAS (Expo Application Services):
```bash
eas build --platform android  # For Android
eas build --platform ios      # For iOS
```

Configuration in `eas.json`.

## Common Development Tasks

### Adding a New Tab/Screen

1. Create page in `app/(tabs)/newpage.tsx` or nested folder
2. Add route to `app/(tabs)/_layout.tsx` in the navigation config
3. Create container component in `components/` folder
4. Import and render in the page

### Adding a New Data Table

1. Define schema in `services/database/schema.ts`
2. Create query hooks in `services/data/newtable.ts`
3. Use `ApiClient.from('tablename')` for mutations
4. Data automatically syncs through PowerSync

### Adding a Photo-Related Feature

1. Use `PhotoCapture.tsx` for capture interface
2. Store metadata via `ApiClient.from('add_photo_operations')`
3. Files upload automatically via `PhotoAttachmentQueue`
4. Retrieve via `PhotoDocumentationModal` or `JobPhotoHistory`

## Debugging

**DebugLogger** (`utils/DebugLogger.ts`):
```typescript
import { debugLog } from '@/utils/DebugLogger';
debugLog('feature', 'message', data); // Conditional logging
```

**OTA Updates**:
- Handled in root `_layout.tsx`
- Shows update modal when available
- User can apply immediately or on next launch

**Network Status**:
- Monitor via `@react-native-community/netinfo`
- PowerSync queues operations when offline

## Performance Considerations

- **Image Caching**: Use `imageCache.ts` utilities to cache downloaded images
- **Query Optimization**: PowerSync queries are subscriptions; filter in WHERE clause
- **Modal Performance**: BottomSheetModalProvider manages modal lifecycle
- **Bundle Analysis**: Run `npm run analyze` to check bundle size
