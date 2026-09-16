/**
 * Minimal in-memory Firestore stand-in for tests. Supports the small subset
 * of the Admin SDK surface the email pipeline uses: nested collections,
 * equality `where` filters, `get`/`set`/`update`, and `runTransaction`.
 */

export type MemoryDocData = Record<string, unknown>;

function getField(data: MemoryDocData, field: string): unknown {
  return field
    .split(".")
    .reduce<unknown>(
      (acc, key) =>
        acc && typeof acc === "object"
          ? (acc as MemoryDocData)[key]
          : undefined,
      data
    );
}

export class MemoryDocSnapshot {
  constructor(
    readonly id: string,
    private readonly value: MemoryDocData | undefined
  ) {}

  get exists(): boolean {
    return this.value !== undefined;
  }

  data(): MemoryDocData | undefined {
    return this.value;
  }
}

export class MemoryDocRef {
  constructor(
    readonly path: string,
    private readonly store: MemoryFirestore
  ) {}

  get id(): string {
    return this.path.split("/").pop()!;
  }

  collection(name: string): MemoryCollectionRef {
    return new MemoryCollectionRef(`${this.path}/${name}`, this.store);
  }

  async get(): Promise<MemoryDocSnapshot> {
    return new MemoryDocSnapshot(this.id, this.store.get(this.path));
  }

  async set(
    data: MemoryDocData,
    options?: { merge?: boolean }
  ): Promise<void> {
    if (options?.merge) {
      this.store.set(this.path, { ...this.store.get(this.path), ...data });
    } else {
      this.store.set(this.path, data);
    }
  }

  async update(data: MemoryDocData): Promise<void> {
    this.store.set(this.path, { ...this.store.get(this.path), ...data });
  }
}

export class MemoryQuerySnapshot {
  constructor(readonly docs: MemoryDocSnapshot[]) {}

  get size(): number {
    return this.docs.length;
  }

  get empty(): boolean {
    return this.docs.length === 0;
  }
}

export class MemoryCollectionRef {
  constructor(
    readonly path: string,
    private readonly store: MemoryFirestore,
    private readonly filters: Array<readonly [string, unknown]> = []
  ) {}

  doc(id: string): MemoryDocRef {
    return new MemoryDocRef(`${this.path}/${id}`, this.store);
  }

  where(field: string, op: string, value: unknown): MemoryCollectionRef {
    if (op !== "==") {
      throw new Error(`MemoryFirestore only supports == filters, got ${op}`);
    }
    return new MemoryCollectionRef(this.path, this.store, [
      ...this.filters,
      [field, value] as const,
    ]);
  }

  async get(): Promise<MemoryQuerySnapshot> {
    const prefix = `${this.path}/`;
    const docs: MemoryDocSnapshot[] = [];
    for (const [path, data] of this.store.entries()) {
      if (!path.startsWith(prefix)) continue;
      const id = path.slice(prefix.length);
      if (id.includes("/")) continue;
      if (this.filters.every(([f, v]) => getField(data, f) === v)) {
        docs.push(new MemoryDocSnapshot(id, data));
      }
    }
    return new MemoryQuerySnapshot(docs);
  }
}

export class MemoryFirestore {
  private readonly records = new Map<string, MemoryDocData>();

  get(path: string): MemoryDocData | undefined {
    return this.records.get(path);
  }

  set(path: string, data: MemoryDocData): void {
    this.records.set(path, data);
  }

  entries(): IterableIterator<[string, MemoryDocData]> {
    return this.records.entries();
  }

  collection(path: string): MemoryCollectionRef {
    return new MemoryCollectionRef(path, this);
  }

  async runTransaction<T>(
    fn: (tx: {
      get: (ref: MemoryDocRef) => Promise<MemoryDocSnapshot>;
      set: (ref: MemoryDocRef, data: MemoryDocData) => void;
      update: (ref: MemoryDocRef, data: MemoryDocData) => void;
    }) => Promise<T>
  ): Promise<T> {
    const store = this.records;
    return fn({
      get: (ref) => ref.get(),
      set: (ref, data) => {
        store.set(ref.path, data);
      },
      update: (ref, data) => {
        store.set(ref.path, { ...store.get(ref.path), ...data });
      },
    });
  }
}

export function asFirestore(
  memory: MemoryFirestore
): FirebaseFirestore.Firestore {
  return memory as unknown as FirebaseFirestore.Firestore;
}
