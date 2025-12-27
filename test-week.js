// Test what week getCurrentNFLWeek returns
function getCurrentNFLWeek() {
  const now = new Date();
  const startDate = new Date(2024, 8, 1); // September 1st, 2024
  
  // Calculate weeks since start of season
  const diffTime = Math.abs(now.getTime() - startDate.getTime());
  const diffWeeks = Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 7));
  
  // Ensure week is between 1 and 18
  return Math.min(Math.max(diffWeeks, 1), 18);
}

console.log('Current NFL Week:', getCurrentNFLWeek());
console.log('Current date:', new Date().toLocaleDateString());
console.log('Season start:', new Date(2024, 8, 1).toLocaleDateString());
