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
│   │   │   ├── nfl-games/  # ESPN API integration
│   │   │   └── user-picks/ # Pick management
│   │   ├── layout.tsx      # Root layout with providers
│   │   └── page.tsx        # Main page
│   ├── components/         # React components
│   │   ├── auth/          # Authentication components
│   │   ├── games/         # Game display components
│   │   └── providers.tsx  # Chakra UI provider
│   └── lib/               # Utility files
│       ├── firebase.ts    # Client-side Firebase config
│       └── firebase-admin.ts # Server-side Firebase config
├── public/               # Static assets
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
