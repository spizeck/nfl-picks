import { Timestamp } from "firebase-admin/firestore";
import { isGameDateInSeason } from "./nfl-season";
import type { UserPick } from "./types";

export class PickValidationError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

interface SavePickInput {
  gameId: string;
  selectedTeam: string;
  week: number;
  year: number;
}

export async function saveValidatedPick(
  adminDb: FirebaseFirestore.Firestore,
  userId: string,
  input: SavePickInput,
  now = Timestamp.now()
): Promise<void> {
  const gameDoc = await adminDb.collection("games").doc(input.gameId).get();
  if (!gameDoc.exists) throw new PickValidationError("Game not found", 404);

  const gameData = gameDoc.data()!;
  if (
    gameData.year !== input.year ||
    gameData.week !== input.week ||
    !isGameDateInSeason(gameData.date, input.year, input.week)
  ) {
    throw new PickValidationError(
      "Game does not belong to the requested season and week",
      400
    );
  }
  if (
    input.selectedTeam !== gameData.home?.id &&
    input.selectedTeam !== gameData.away?.id
  ) {
    throw new PickValidationError("Selected team is not in this game", 400);
  }

  const gameStartTime = Timestamp.fromDate(new Date(gameData.date));
  if (gameStartTime.toMillis() <= now.toMillis()) {
    throw new PickValidationError(
      "Picks are locked - this game has already started",
      403
    );
  }

  const pickData: Partial<UserPick> = {
    gameId: input.gameId,
    selectedTeam: input.selectedTeam,
    timestamp: now,
    result: "pending",
    locked: false,
    gameStartTime,
  };
  await adminDb
    .collection("users")
    .doc(userId)
    .collection("seasons")
    .doc(input.year.toString())
    .collection("weeks")
    .doc(input.week.toString())
    .collection("picks")
    .doc(input.gameId)
    .set(pickData);
}
