# Deployment Instructions

## Pre-Deployment Checklist

### 1. Review Changes
- [ ] Review all modified files in `REFACTORING_SUMMARY.md`
- [ ] Understand new data structure
- [ ] Review security rules changes

### 2. Backup Current Data
```bash
# Export current Firestore data
firebase firestore:export gs://your-bucket-name/backups/pre-refactor-$(date +%Y%m%d)
```

### 3. Test Locally (Optional)
```bash
# Start Firebase emulators
firebase emulators:start

# Test in another terminal
npm run dev
```

---

## Deployment Steps

### Step 1: Deploy Firestore Rules
```bash
firebase deploy --only firestore:rules
```

**Verify**: Check Firebase Console → Firestore → Rules

### Step 2: Deploy Cloud Functions
```bash
cd functions
npm install
npm run build
firebase deploy --only functions
```

**Expected Functions**:
- `onGameComplete` - Triggers when game status changes to final
- `updateGameScores` - Scheduled every 5 minutes to update active games

### Step 3: Deploy Next.js Application
```bash
# Return to root
cd ..

# Build and deploy
npm run build
vercel --prod
# OR
npm run deploy
```

### Step 4: Run Data Migration

**Important**: Only run this ONCE after deploying functions

```bash
cd functions
npx ts-node src/migrate-picks.ts
```

**What to expect**:
- Script will process all users
- Migrates picks to new structure
- Calculates weekly and season stats
- Prints progress for each user
- Shows total migrated/skipped picks

**Monitor output**:
```
Starting picks migration...

Migrating picks for user: user123
  Migrated 45 picks for user user123

Migrating picks for user: user456
  Migrated 32 picks for user user456

✅ Migration complete!
   Total picks migrated: 234
   Total picks skipped: 3
```

### Step 5: Verify Migration

#### Check Firestore Console
1. Navigate to Firestore Database
2. Verify new structure exists:
   ```
   users/{userId}/seasons/{year}/weeks/{week}/picks/{gameId}
   ```
3. Check that stats documents exist:
   ```
   users/{userId}/seasons/{year}/weeks/{week}
   users/{userId}/seasons/{year}
   ```

#### Test in Application
1. Log in as a test user
2. Navigate to current week
3. Verify picks are displayed
4. Try making a new pick
5. Check that "Save Picks" works
6. Verify picks lock after game starts
7. Check that other users' picks are hidden before games start

---

## Post-Deployment Verification

### API Endpoints
Test each endpoint:

```bash
# Get games for current week
curl "https://your-app.com/api/games?week=15&year=2024"

# Get user picks (requires auth token)
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "https://your-app.com/api/user-picks?week=15&year=2024"

# Get all picks for a week
curl "https://your-app.com/api/all-picks?week=15&year=2024"
```

### Function Logs
Monitor Cloud Functions logs:

```bash
firebase functions:log
```

**Look for**:
- Successful game score updates
- Game completion triggers
- Stats calculations
- Any errors or warnings

### Performance Monitoring

#### ESPN API Usage
Check logs for ESPN API calls:
```bash
firebase functions:log --only updateGameScores
```

**Expected behavior**:
- Schedule fetched once per week
- Score updates only for active games
- Rate limit enforced (5-minute minimum)

#### Firestore Operations
Monitor Firestore usage in Firebase Console:
- Reads should decrease significantly
- Writes concentrated during game times
- No excessive document scans

---

## Rollback Plan

### If Issues Occur

#### Option 1: Revert Code Only
```bash
# Revert to previous commit
git revert HEAD
git push

# Redeploy
npm run build && vercel --prod
firebase deploy --only functions
```

**Note**: Old data structure still exists, so app will work with old code

#### Option 2: Full Rollback
```bash
# Restore Firestore backup
firebase firestore:import gs://your-bucket-name/backups/pre-refactor-YYYYMMDD

# Revert code
git revert HEAD
git push

# Redeploy everything
firebase deploy
npm run build && vercel --prod
```

---

## Monitoring & Maintenance

### Daily Checks (First Week)
- [ ] Check function execution logs
- [ ] Monitor ESPN API call count
- [ ] Verify game completion triggers
- [ ] Check user-reported issues

### Weekly Checks
- [ ] Review Firestore usage metrics
- [ ] Check function error rates
- [ ] Verify stats calculations are accurate
- [ ] Monitor cache hit rates

### Alerts to Set Up
1. **ESPN API Rate Limit**: Alert if approaching limits
2. **Function Errors**: Alert on repeated failures
3. **Firestore Costs**: Alert if costs spike unexpectedly

---

## Troubleshooting

### Issue: Migration Script Fails
**Symptoms**: Script exits with errors

**Solutions**:
1. Check Firebase Admin credentials
2. Verify Firestore permissions
3. Run script with `--debug` flag
4. Check for missing game data

### Issue: Picks Not Saving
**Symptoms**: "Save Picks" button doesn't work

**Solutions**:
1. Check browser console for errors
2. Verify auth token is valid
3. Check Firestore rules are deployed
4. Verify week/year parameters are passed

### Issue: Picks Visible Before Game Starts
**Symptoms**: Users can see others' picks too early

**Solutions**:
1. Check `all-picks` API filtering logic
2. Verify game start times are correct
3. Check client-side time comparison
4. Clear browser cache

### Issue: Stats Not Updating
**Symptoms**: Weekly/season totals incorrect

**Solutions**:
1. Check `onGameComplete` function logs
2. Verify game status changes are detected
3. Manually trigger stats recalculation
4. Check for race conditions in batch writes

### Issue: Too Many ESPN API Calls
**Symptoms**: High API usage

**Solutions**:
1. Verify cache is working (check logs)
2. Check rate limiter is active
3. Ensure completed games aren't being updated
4. Review `shouldUpdateScores()` logic

---

## Success Criteria

### Functional Requirements
✅ Schedule fetched once per week  
✅ Scores update only for active games  
✅ Rate limiting enforced (5-minute minimum)  
✅ Picks save to hierarchical structure  
✅ Weekly stats calculated automatically  
✅ Season stats aggregated correctly  
✅ Game completion triggers stats update  
✅ Picks hidden before game starts  
✅ Picks lock when game starts  
✅ Avatars display after game starts  
✅ Result badges show on completed games  

### Performance Metrics
✅ ESPN API calls reduced by >80%  
✅ Pick queries 90% faster  
✅ Stats calculation instant (pre-calculated)  
✅ No performance degradation in UI  

### User Experience
✅ No disruption to existing users  
✅ All historical picks preserved  
✅ Improved page load times  
✅ Clear visual feedback on pick status  

---

## Support & Documentation

### Key Files
- `REFACTORING_SUMMARY.md` - Complete technical overview
- `src/lib/espn-cache.ts` - Caching implementation
- `src/lib/types.ts` - TypeScript interfaces
- `functions/src/migrate-picks.ts` - Migration script
- `firestore.rules` - Security rules

### Contact
For issues or questions:
1. Check logs first
2. Review troubleshooting section
3. Check Firebase Console for errors
4. Review code comments in modified files

---

## Next Steps After Deployment

1. **Monitor for 24 hours**: Watch logs and metrics closely
2. **Gather user feedback**: Check for any reported issues
3. **Optimize if needed**: Adjust cache times or rate limits
4. **Document learnings**: Update this guide with any discoveries
5. **Plan next features**: Consider enhancements from REFACTORING_SUMMARY.md

---

## Cleanup (After 30 Days)

Once confident the new system is stable:

```bash
# Optional: Remove old pick structure
# WARNING: This is irreversible!

# Create a Cloud Function to delete old picks
# Test thoroughly before running in production
```

**Recommendation**: Keep old data for at least one full season as backup.
