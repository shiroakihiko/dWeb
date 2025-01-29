/**
 * Abstract base class for key-value storage implementations
 */
class StorageContainer {
    async get(key) { throw new Error('Not implemented'); }
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

    async get(key) {
        return this.db.get(key);
    }

    async put(key, value) {
        return this.db.put(key, value);
    }

    async delete(key) {
        return this.db.remove(key);
    }

    async getRange(options) {
        return this.db.getRange(options);
    }

    async getCount() {
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
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async put(key, value) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(this.storeName, 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.put(value, key);
            
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
                    results.push({ key: cursor.key, value: cursor.value });
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
                else resolve(doc ? doc.value : null);
            });
        });
    }

    async put(key, value) {
        return new Promise((resolve, reject) => {
            this.db.update(
                { _id: key },
                { _id: key, value: value },
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
                    value: doc.value
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
                    mapSize: 10 * 1024 * 1024
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
                const db = this.db.openDB({ name, create: true });
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
        }
    }
}

module.exports = Storage; 