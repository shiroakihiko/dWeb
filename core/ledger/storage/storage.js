/**
 * Abstract base class for key-value storage implementations
 */
class StorageContainer {
    get(key) { throw new Error('Not implemented'); }
    async put(key, value) { throw new Error('Not implemented'); }
    async delete(key) { throw new Error('Not implemented'); }
    async getRange(options) { throw new Error('Not implemented'); }
    async getCount() { throw new Error('Not implemented'); }
    async transaction(fn) { throw new Error('Not implemented'); }
}

/**
 * LMDB implementation of the storage container
 */
class LMDBContainer extends StorageContainer {
    constructor(db) {
        super();
        this.db = db;
    }

    get(key) {
        return this.db.get(key);
    }

    async put(key, value) {
        return this.db.put(key, value);
    }

    async delete(key) {
        return this.db.remove(key);
    }

    getRange(options) {
        return this.db.getRange(options);
    }

    getCount() {
        return this.db.getCount();
    }

    async transaction(fn) {
        return this.db.transaction(fn);
    }
}

/**
 * IndexedDB implementation of the storage container
 */
class IndexedDBContainer extends StorageContainer {
    constructor(db, storeName) {
        super();
        this.db = db;
        this.storeName = storeName;
    }

    async get(key) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(this.storeName, 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.get(key);
            
            request.onsuccess = () => resolve(JSON.parse(request.result));
            request.onerror = () => reject(request.error);
        });
    }

    async put(key, value) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(this.storeName, 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.put(JSON.stringify(value), key);
            
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async delete(key) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(this.storeName, 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.delete(key);
            
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async getRange(options) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(this.storeName, 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.openCursor();
            const results = [];
            
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    results.push({ key: cursor.key, value: JSON.parse(cursor.value) });
                    cursor.continue();
                } else {
                    resolve(results);
                }
            };
            request.onerror = () => reject(request.error);
        });
    }

    async getCount() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(this.storeName, 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.count();
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async transaction(fn) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(this.storeName, 'readwrite');
            const store = transaction.objectStore(this.storeName);
            
            try {
                const result = fn(store);
                transaction.oncomplete = () => resolve(result);
                transaction.onerror = () => reject(transaction.error);
            } catch (error) {
                reject(error);
            }
        });
    }
}

/**
 * NeDB implementation of the storage container
 */
class NeDBContainer extends StorageContainer {
    constructor(db) {
        super();
        this.db = db;
    }

    async get(key) {
        return new Promise((resolve, reject) => {
            this.db.findOne({ _id: key }, (err, doc) => {
                if (err) reject(err);
                else resolve(doc ? JSON.parse(doc.value) : null);
            });
        });
    }

    async put(key, value) {
        return new Promise((resolve, reject) => {
            this.db.update(
                { _id: key },
                { _id: key, value: JSON.stringify(value) },
                { upsert: true },
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    }

    async delete(key) {
        return new Promise((resolve, reject) => {
            this.db.remove({ _id: key }, {}, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    async getRange(options) {
        return new Promise((resolve, reject) => {
            this.db.find({}, (err, docs) => {
                if (err) reject(err);
                else resolve(docs.map(doc => ({
                    key: doc._id,
                    value: JSON.parse(doc.value)
                })));
            });
        });
    }

    async getCount() {
        return new Promise((resolve, reject) => {
            this.db.count({}, (err, count) => {
                if (err) reject(err);
                else resolve(count);
            });
        });
    }

    async transaction(fn) {
        // NeDB doesn't support true transactions, but we can make atomic updates
        try {
            const result = await fn();
            return result;
        } catch (error) {
            throw error;
        }
    }
}

/**
 * LevelDB implementation of the storage container
 */
class LevelDBContainer extends StorageContainer {
    constructor(db) {
        super();
        this.db = db;
    }

    async get(key) {
        try {
            const value = await this.db.get(key);
            return value;
        } catch (error) {
            if (error.notFound) return null;
            throw error;
        }
    }

    async put(key, value) {
        return this.db.put(key, value);
    }

    async delete(key) {
        return this.db.del(key);
    }

    async getRange(options = {}) {
        const results = [];
        for await (const [key, value] of this.db.iterator(options)) {
            results.push({
                key: key,
                value: value // value is already parsed since we use valueEncoding: 'json'
            });
        }
        return results;
    }

    async getCount() {
        let count = 0;
        for await (const _ of this.db.keys()) {
            count++;
        }
        return count;
    }

    async transaction(fn) {
        // LevelDB supports atomic batch operations
        const batch = this.db.batch();
        try {
            const result = await fn(batch);
            await batch.write();
            return result;
        } catch (error) {
            throw error;
        }
    }
}

/**
 * Main storage class that manages database connections and containers
 */
class Storage {
    constructor(options = {}) {
        this.type = options.type || 'lmdb';
        this.path = options.path;
        this.name = options.name || 'mydb';
        this.containers = new Map();
        this.db = null;
    }

    async initialize() {
        switch (this.type) {
            case 'lmdb':
                const LMDB = require('lmdb');
                this.db = LMDB.open({
                    path: this.path,
                    compression: true
                });
                break;

            case 'indexeddb':
                this.db = await new Promise((resolve, reject) => {
                    const request = indexedDB.open(this.name, 1);
                    request.onerror = () => reject(request.error);
                    request.onsuccess = () => resolve(request.result);
                    request.onupgradeneeded = (event) => {
                        const db = event.target.result;
                        this.containers.forEach((_, name) => {
                            if (!db.objectStoreNames.contains(name)) {
                                db.createObjectStore(name);
                            }
                        });
                    };
                });
                break;

            case 'nedb':
                const Datastore = require('@seald-io/nedb');
                break;

            case 'leveldb':
                const { Level } = require('level');
                this.db = new Level(this.path || this.name, {
                    valueEncoding: 'json'
                });
                await this.db.open();
                break;

            default:
                throw new Error('Unsupported storage type: ' + this.type);
        }
    }

    async openDB(options) {
        const name = options.name;
        
        if (this.containers.has(name)) {
            return this.containers.get(name);
        }

        let container;
        switch (this.type) {
            case 'lmdb':
                const initOptions = { name, create: true, compression: true };
                if(options.cache) {
                    initOptions.cache = options.cache;
                }
                const db = this.db.openDB(initOptions);
                container = new LMDBContainer(db);
                break;

            case 'indexeddb':
                if (!this.db.objectStoreNames.contains(name)) {
                    const version = this.db.version + 1;
                    this.db.close();
                    
                    await new Promise((resolve, reject) => {
                        const request = indexedDB.open(this.name, version);
                        request.onupgradeneeded = (event) => {
                            const db = event.target.result;
                            db.createObjectStore(name);
                        };
                        request.onsuccess = () => {
                            this.db = request.result;
                            resolve();
                        };
                        request.onerror = () => reject(request.error);
                    });
                }
                container = new IndexedDBContainer(this.db, name);
                break;

            case 'nedb':
                const Datastore = require('@seald-io/nedb')
                const dbPath = this.path ? `${this.path}/${this.name}_${name}.db` : null;
                
                const dbNedb = new Datastore({ 
                    filename: dbPath,
                    autoload: true
                });
                container = new NeDBContainer(dbNedb);
                break;

            case 'leveldb':
                const { Level } = require('level');
                const dbPathLevel = this.path ? `${this.path}/${name}` : name;
                const dbLevel = new Level(dbPathLevel, {
                    valueEncoding: 'json'
                });
                await dbLevel.open();
                container = new LevelDBContainer(dbLevel);
                break;
        }

        this.containers.set(name, container);
        return container;
    }

    async close() {
        // Only LMDB and IndexedDB need explicit closing
        switch (this.type) {
            case 'lmdb':
                this.db.close();
                break;
            case 'indexeddb':
                this.db.close();
                break;
            case 'leveldb':
                await this.db.close();
                for (const container of this.containers.values()) {
                    if (container instanceof LevelDBContainer) {
                        await container.db.close();
                    }
                }
                break;
        }
    }
}

module.exports = Storage; 