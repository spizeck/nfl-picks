# NFL Picks App

A Next.js application for making NFL game picks and tracking your record against family and friends.

## Features

- 🔐 Google Authentication with Firebase
- 🏈 Live NFL game data from ESPN API
- 💾 Secure pick storage in Firestore
- 🎨 Modern UI with Chakra UI v3 and Tailwind CSS
- 📱 Responsive design for all devices
- 🏆 Track your weekly and overall record

## Tech Stack

- **Frontend**: Next.js 15, React 19, TypeScript
- **Styling**: Chakra UI v3, Tailwind CSS
- **Authentication**: Firebase Auth (Google)
- **Database**: Firestore
- **API**: ESPN API for NFL game data

## APIs and Data Flow

### 1. ESPN API Integration

#### Endpoint Used
```
https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard
```

#### Query Parameters
- `week`: NFL week number (1-18 for regular season, 19-22 for postseason)
- `year`: Season year (e.g., 2025)
- `seasontype`: Optional (1=preseason, 2=regular, 3=postseason)

#### Example Request
```javascript
const response = await fetch(
  'https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?week=1&year=2025'
);
```

#### ESPN API Response Structure
```json
{
  "leagues": [{
    "events": [
      {
        "id": "401437678",
        "name": "Houston Texans at Buffalo Bills",
        "date": "2025-09-04T23:15Z",
        "competitions": [{
          "competitors": [
            {
              "team": {
                "id": "33",
                "displayName": "Houston Texans",
                "logo": "https://a.espncdn.com/i/teamlogos/nfl/500/33.png"
              },
              "score": 20,
              "homeAway": "away"
            },
            {
              "team": {
                "id": "13",
                "displayName": "Buffalo Bills",
                "logo": "https://a.espncdn.com/i/teamlogos/nfl/500/13.png"
              },
              "score": 24,
              "homeAway": "home"
            }
          ]
        }],
        "status": {
          "type": {
            "state": "post",
            "completed": true,
            "description": "Final"
          }
        }
      }
    ]
  }]
}
```

### 2. Data Normalization

Since ESPN's API response has a complex nested structure, we normalize it into a simpler format:

#### Normalized Game Interface
```typescript
interface NormalizedGame {
  eventId: string;
  date: string;
  away: {
    id: string;
    name: string;
    logo: string;
    abbreviation?: string;
    record?: string;
    score?: number;
  };
  home: {
    id: string;
    name: string;
    logo: string;
    abbreviation?: string;
    record?: string;
    score?: number;
  };
  status: {
    state: "pre" | "in" | "post";
    displayText: string;
    detail?: string;
  };
}
```

#### Normalized Example
```json
{
  "eventId": "401437678",
  "date": "2025-09-04T23:15Z",
  "away": {
    "id": "33",
    "name": "Houston Texans",
    "logo": "https://a.espncdn.com/i/teamlogos/nfl/500/33.png",
    "abbreviation": "HOU",
    "record": "10-7",
    "score": 20
  },
  "home": {
    "id": "13",
    "name": "Buffalo Bills",
    "logo": "https://a.espncdn.com/i/teamlogos/nfl/500/13.png",
    "abbreviation": "BUF",
    "record": "11-6",
    "score": 24
  },
  "status": {
    "state": "post",
    "displayText": "Final",
    "detail": "20-24"
  }
}
```

### 3. Internal API Routes

#### `/api/games`
Fetches games for a specific week and year. Handles both fetching from ESPN API and caching in Firestore.

**Query Parameters:**
- `week` (required): Week number
- `year` (optional): Season year (defaults to current year)
- `refreshScores` (optional): Set to "true" to force refresh from ESPN

**Response:** Array of `NormalizedGame` objects

#### `/api/current-week`
Returns the current NFL week number based on ESPN's API.

**Response:**
```json
{
  "week": 1,
  "year": 2025,
  "seasonType": 2
}
```

#### `/api/user-picks`
Manages user's game picks.

**GET:** Returns user's picks for a week
**POST:** Saves new picks

Request/Response format:
```json
{
  "gameId": "401437678",
  "selectedTeam": "33",
  "week": 1,
  "year": 2025,
  "timestamp": {
    "seconds": 1725494400,
    "nanoseconds": 0
  }
}
```

#### `/api/all-picks`
Returns all users' picks for a week (used for displaying what others picked).

### 4. Data Storage in Firestore

#### Collections Structure

**games** collection:
- Document ID: ESPN event ID
- Fields: Normalized game data plus `week`, `year`, and `lastUpdated` timestamps

**users** collection:
- Document ID: Firebase auth UID
- Fields: User profile information

**picks** collection:
- Document ID: Auto-generated
- Fields: User pick data with indexes on userId, week, and year

#### Example Game Document
```json
{
  "eventId": "401437678",
  "date": "2025-09-04T23:15Z",
  "away": {
    "id": "33",
    "name": "Houston Texans",
    "logo": "https://a.espncdn.com/i/teamlogos/nfl/500/33.png",
    "score": 20
  },
  "home": {
    "id": "13",
    "name": "Buffalo Bills",
    "logo": "https://a.espncdn.com/i/teamlogos/nfl/500/13.png",
    "score": 24
  },
  "status": {
    "state": "post",
    "displayText": "Final",
    "detail": "20-24"
  },
  "week": 1,
  "year": 2025,
  "lastUpdated": "2025-01-05T20:30:00Z"
}
```

### 5. Scheduled Updates

Firebase Cloud Functions run every 5 minutes to:
1. Check ESPN API for score updates
2. Update active games in Firestore
3. Only updates games that are in progress or about to start

#### Cloud Functions

**`updateGameScores`** (Scheduled every 5 minutes)
- Fetches current week from ESPN API
- Updates all active/pre-game scores in Firestore
- Includes rate limiting to avoid excessive API calls

**`forceUpdateWeek`** (Callable function)
- Manually trigger update for specific week
- Used for testing or immediate updates
- Accepts `week` and `year` parameters

**`onGameComplete`** (Firestore trigger)
- Automatically processes completed games
- Updates user pick records (win/loss)
- Calculates weekly standings

**`processCompletedGames`** (HTTP trigger)
- Batch processes multiple completed games
- Updates leaderboards and statistics

### 6. Postseason Handling

Since ESPN's API may not have postseason data immediately, the app includes mock data for playoff weeks:
- Week 19: Wild Card Weekend
- Week 20: Divisional Round
- Week 21: Conference Championships
- Week 22: Super Bowl

The app automatically detects postseason based on date and uses mock data until ESPN updates their API.

### 7. Error Handling

- If ESPN API fails, the app falls back to cached data in Firestore
- If no cached data exists, shows an error message
- Rate limiting prevents excessive calls to ESPN API
- Automatic retries with exponential backoff for network errors

### 8. Frontend Data Usage

#### Dashboard Component
The main dashboard (`src/components/dashboard/dashboard.tsx`) consumes the APIs:

1. **Fetches current week** on mount to determine which week to display
2. **Loads games** for the selected week via `/api/games`
3. **Loads user's existing picks** via `/api/user-picks`
4. **Loads all users' picks** via `/api/all-picks` for social features

#### Game Display
Each game is rendered using the `GamePickCard` component:
- Shows team logos, names, and records
- Displays current score or game time based on status
- Allows picking winners before game starts
- Shows results after games complete
- Displays what other users picked (after game starts)

#### Week Selection
The `WeekDropdown` component provides:
- Regular season weeks 1-18
- Postseason weeks 19-22 with labels (Wild Card, Divisional, etc.)
- Automatic navigation to current week on load

#### Real-time Updates
- Scores refresh every 30 seconds for active games
- Status updates (pre -> in -> post) trigger UI changes
- Pick buttons disable when games start

## Setup Instructions

### 1. Clone and Install Dependencies

```bash
cd nfl-picks
npm install
```

### 2. Firebase Setup

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project
3. Enable Authentication:
   - Go to Authentication > Sign-in method
   - Enable Google provider
4. Create Firestore Database:
   - Go to Firestore Database
   - Create a new database in test mode
5. Get your Firebase configuration:
   - Project Settings > General > Your apps
   - Copy the Firebase config

### 3. Set Up Service Account

1. In Firebase Console, go to Project Settings > Service accounts
2. Click "Generate new private key"
3. Save the JSON file securely
4. Copy the values from the JSON file for your environment variables

### 4. Environment Variables

1. Copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```

2. Fill in your Firebase credentials in `.env.local`:
   ```env
   # Firebase Configuration (Client-side)
   NEXT_PUBLIC_FIREBASE_API_KEY=your_actual_api_key
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id

   # Firebase Admin SDK Configuration (Server-side)
   FIREBASE_ADMIN_PROJECT_ID=your_project_id
   FIREBASE_ADMIN_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your_project.iam.gserviceaccount.com
   FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour private key here\n-----END PRIVATE KEY-----"
   ```

### 5. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## How to Use

1. **Sign In**: Click "Sign in with Google" to authenticate
2. **View Games**: See this week's NFL games with team logos
3. **Make Picks**: Click on a team to select your winner
4. **Track Progress**: Your picks are saved and you can see your results

## Project Structure

```
nfl-picks/
├── src/
│   ├── app/                 # Next.js App Router
│   │   ├── api/            # API routes
│   │   │   ├── games/      # Game data fetching and caching
│   │   │   ├── current-week/ # Current week detection
│   │   │   ├── user-picks/ # User pick management
│   │   │   └── all-picks/  # All users' picks for social features
│   │   ├── layout.tsx      # Root layout with providers
│   │   └── page.tsx        # Main page (authentication)
│   ├── components/         # React components
│   │   ├── auth/          # Authentication components
│   │   ├── dashboard/     # Main dashboard and game cards
│   │   ├── layout/        # Layout components (week dropdown)
│   │   └── ui/            # Reusable UI components
│   └── lib/               # Utility files
│       ├── firebase.ts    # Client-side Firebase config
│       ├── firebase-admin.ts # Server-side Firebase config
│       ├── espn-data.ts   # ESPN API data normalization
│       ├── espn-cache.ts  # Caching utilities
│       └── mock-postseason-data.ts # Temporary playoff data
├── functions/             # Firebase Cloud Functions
│   ├── src/
│   │   ├── index.ts       # Function exports
│   │   ├── scheduled-game-update.ts # Automated score updates
│   │   ├── force-update.ts # Manual update trigger
│   │   └── lib/           # Shared utilities
│   └── package.json
├── public/               # Static assets
├── firebase.json         # Firebase configuration
└── package.json         # Dependencies
```

## Security Features

- 🔒 Firebase ID token verification on all API routes
- 🛡️ Server-side authentication with Firebase Admin SDK
- 🚫 No direct database access from client
- ✅ Environment variables for sensitive data

## Future Enhancements

- 🏆 Leaderboard to compete with family
- 📊 Statistics and analytics
- 🔔 Notifications for game results
- 📅 Historical pick tracking
- 👥 Multiple week competitions

## Troubleshooting

### Common Issues

1. **"Unauthorized - Invalid token" error**
   - Make sure your Firebase Admin SDK credentials are correct
   - Check that Google Authentication is enabled in Firebase Console

2. **"Failed to fetch NFL games" error**
   - The ESPN API might be temporarily unavailable
   - Check your internet connection

3. **Build errors**
   - Make sure all environment variables are set
   - Run `npm install` to ensure all dependencies are installed

### Getting Help

If you run into issues:
1. Check the browser console for error messages
2. Verify your Firebase configuration
3. Make sure all environment variables are properly set

## Learning Resources

This project is great for learning:
- Next.js App Router and Server Components
- Firebase Authentication and Firestore
- API integration and data fetching
- Modern React patterns with TypeScript
- Component-based UI design with Chakra UI

Happy coding and good luck with your NFL picks! 🏈
