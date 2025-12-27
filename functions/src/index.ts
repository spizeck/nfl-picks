/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

import {setGlobalOptions} from "firebase-functions";
import { onGameComplete } from "./scheduled-stats-update";
import { updateGameScores } from "./scheduled-game-update";
<<<<<<< C:\Users\chadn\CodingProjects\NFLPicks\nfl-picks\functions\src\index.ts

setGlobalOptions({ maxInstances: 10 });

export { onGameComplete, updateGameScores };
=======
import { runMigrationHttp } from "./run-migration-http";

setGlobalOptions({ maxInstances: 10 });

export { onGameComplete, updateGameScores, runMigrationHttp };
>>>>>>> c:\Users\chadn\.windsurf\worktrees\nfl-picks\nfl-picks-035e43d6\functions\src\index.ts
