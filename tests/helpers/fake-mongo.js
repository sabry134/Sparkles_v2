function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function matches(document, filter) {
  return Object.entries(filter).every(([key, value]) => document?.[key] === value);
}

function setPath(document, path, value) {
  const parts = path.split('.');
  let current = document;
  for (const part of parts.slice(0, -1)) {
    if (!current[part] || typeof current[part] !== 'object') current[part] = {};
    current = current[part];
  }
  current[parts.at(-1)] = clone(value);
}

function unsetPath(document, path) {
  const parts = path.split('.');
  let current = document;
  for (const part of parts.slice(0, -1)) {
    if (!current?.[part] || typeof current[part] !== 'object') return;
    current = current[part];
  }
  delete current[parts.at(-1)];
}

function getPath(document, path) {
  return path.split('.').reduce((current, part) => current?.[part], document);
}

function applyUpdate(document, update, inserted) {
  for (const [path, value] of Object.entries(update.$set ?? {})) {
    setPath(document, path, value);
  }
  for (const path of Object.keys(update.$unset ?? {})) {
    unsetPath(document, path);
  }
  for (const [path, value] of Object.entries(update.$inc ?? {})) {
    setPath(document, path, (getPath(document, path) ?? 0) + value);
  }
  for (const [path, value] of Object.entries(update.$max ?? {})) {
    const current = getPath(document, path);
    if (current === undefined || current < value) setPath(document, path, value);
  }
  if (inserted) {
    for (const [path, value] of Object.entries(update.$setOnInsert ?? {})) {
      if (getPath(document, path) === undefined) setPath(document, path, value);
    }
  }
}

class FakeCursor {
  #documents;
  #limit = Infinity;

  constructor(documents) {
    this.#documents = documents;
  }

  sort(specification) {
    const entries = Object.entries(specification);
    this.#documents.sort((left, right) => {
      for (const [field, direction] of entries) {
        const a = left[field];
        const b = right[field];
        if (a === b) continue;
        return (a < b ? -1 : 1) * direction;
      }
      return 0;
    });
    return this;
  }

  limit(value) {
    this.#limit = value;
    return this;
  }

  async toArray() {
    return clone(this.#documents.slice(0, this.#limit));
  }
}

class FakeCollection {
  #documents = new Map();

  constructor(initial = []) {
    for (const document of initial) {
      this.#documents.set(String(document._id), clone(document));
    }
  }

  async createIndex() {
    return 'fake_index';
  }

  find(filter = {}) {
    return new FakeCursor(
      [...this.#documents.values()].filter((document) => matches(document, filter)),
    );
  }

  async findOne(filter) {
    const document = [...this.#documents.values()].find((item) =>
      matches(item, filter),
    );
    return clone(document ?? null);
  }

  async updateOne(filter, update, options = {}) {
    let entry = [...this.#documents.entries()].find(([, document]) =>
      matches(document, filter),
    );
    let inserted = false;

    if (!entry && options.upsert) {
      inserted = true;
      const document = Object.fromEntries(
        Object.entries(filter).filter(([key]) => !key.startsWith('$')),
      );
      if (document._id === undefined) {
        document._id = `fake:${this.#documents.size + 1}`;
      }
      entry = [String(document._id), document];
    }

    if (!entry) return { matchedCount: 0, modifiedCount: 0 };

    const [key, document] = entry;
    applyUpdate(document, update, inserted);
    this.#documents.set(String(document._id ?? key), clone(document));
    if (String(document._id ?? key) !== key) this.#documents.delete(key);

    return {
      matchedCount: inserted ? 0 : 1,
      modifiedCount: 1,
      upsertedCount: inserted ? 1 : 0,
    };
  }

  async replaceOne(filter, replacement, options = {}) {
    const existing = [...this.#documents.entries()].find(([, document]) =>
      matches(document, filter),
    );
    if (!existing && !options.upsert) return { matchedCount: 0, modifiedCount: 0 };
    const document = clone(replacement);
    if (document._id === undefined) {
      document._id = existing?.[1]?._id ?? filter._id ?? `fake:${this.#documents.size + 1}`;
    }
    if (existing) this.#documents.delete(existing[0]);
    this.#documents.set(String(document._id), document);
    return { matchedCount: existing ? 1 : 0, modifiedCount: 1 };
  }

  async deleteOne(filter) {
    const existing = [...this.#documents.entries()].find(([, document]) =>
      matches(document, filter),
    );
    if (!existing) return { deletedCount: 0 };
    this.#documents.delete(existing[0]);
    return { deletedCount: 1 };
  }

  async deleteMany(filter = {}) {
    let deletedCount = 0;
    for (const [key, document] of [...this.#documents.entries()]) {
      if (!matches(document, filter)) continue;
      this.#documents.delete(key);
      deletedCount += 1;
    }
    return { deletedCount };
  }

  async insertOne(document) {
    const copy = clone(document);
    if (copy._id === undefined) copy._id = `fake:${this.#documents.size + 1}`;
    if (this.#documents.has(String(copy._id))) {
      const error = new Error('duplicate key');
      error.code = 11000;
      throw error;
    }
    this.#documents.set(String(copy._id), copy);
    return { insertedId: copy._id };
  }

  async findOneAndUpdate(filter, update, options = {}) {
    await this.updateOne(filter, update, { upsert: options.upsert });
    return this.findOne(filter);
  }

  async bulkWrite(operations) {
    for (const operation of operations) {
      if (operation.replaceOne) {
        await this.replaceOne(
          operation.replaceOne.filter,
          operation.replaceOne.replacement,
          { upsert: operation.replaceOne.upsert },
        );
      } else if (operation.updateOne) {
        await this.updateOne(
          operation.updateOne.filter,
          operation.updateOne.update,
          { upsert: operation.updateOne.upsert },
        );
      } else if (operation.deleteOne) {
        await this.deleteOne(operation.deleteOne.filter);
      }
    }
    return { ok: 1 };
  }
}

export class FakeMongoDatabase {
  #collections = new Map();

  collection(name) {
    if (!this.#collections.has(name)) {
      this.#collections.set(name, new FakeCollection());
    }
    return this.#collections.get(name);
  }

  seed(name, documents) {
    this.#collections.set(name, new FakeCollection(documents));
    return this;
  }
}
